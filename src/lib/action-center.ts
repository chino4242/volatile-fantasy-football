/**
 * Action Center aggregation engine (pure) — the cross-league roll-up that powers
 * the redesigned portfolio hub.
 *
 * Given each already-loaded PortfolioLeague + which team is mine, it produces a
 * prioritized, SEASON-ADAPTIVE structure of *recommended actions only* (things
 * that deep-link out to the real platform). Passive team health (tier, core age,
 * weakest starter) belongs to the dashboard, not here.
 *
 *   - In-season → group by ACTION TYPE: lineup → trade → waiver.
 *   - Off-season → group by TEAM, each carrying its strengthen-moves.
 *
 * Consultant model: every item exposes a `deepLink`; the UI adds the "↗".
 * Value lens reuses existing computations — this engine does not invent trade
 * or value math. See EXPERIENCE.md / DESIGN.md (ux-portfolio-hub-2026-08-27).
 */

import {
    type PortfolioLeague,
    type PortfolioPlatform,
    type PortfolioLeagueType,
    type PortfolioPlayer,
    type PortfolioTeam,
    type CompetitiveState,
    labelTeam,
    weakestStarter,
    optimizePortfolioTeam,
} from './portfolio';
import {
    generateTransactionSuggestions,
    buildRosterConfig,
    type TxnPlayer,
    type TransactionSuggestion,
} from './transaction-suggestions';
import { findWaiverUpgrades, isBadgeWorthy, type WaiverUpgrade } from './waiver-upgrades';

export type SeasonMode = 'in-season' | 'off-season';
export type ActionKind = 'lineup' | 'trade' | 'waiver' | 'waiver-upgrade' | 'sell' | 'stream';
export type TierBand = 'top' | 'middle' | 'lower';

/** One pending/incoming trade offer for a league (Fleaflicker-only today). */
export interface PendingTradeInput {
    id: string;
    headline: string;       // "You get Garrett Wilson ↔ give Breece Hall"
    detail?: string;        // "even market value"
    deepLink?: string;
}

/** A weekly DST streaming ranking row for a league's DEF recommendation. */
export interface DstRankInput {
    sleeper_id: string;     // DEF_{ABBR}
    rank: number | null;
    tier: number | null;
    spread: number | null;
    opponent: string | null;
    name: string | null;    // e.g. "Los Angeles Chargers"
}

/** Per-league input the engine consumes (UI supplies these after loading). */
export interface ActionCenterInput {
    league: PortfolioLeague;
    myRosterId: string | null;
    /** Optional pending/incoming trades (Fleaflicker). Absent → no auto trade items. */
    pendingTrades?: PendingTradeInput[];
    /** Optional weekly DST streaming rankings (the full uploaded list). Absent → no stream items. */
    dstRankings?: DstRankInput[];
    /**
     * NFL team abbrs (our convention) whose game this week has already kicked off
     * (state != 'pre'). Used to suppress weekly waiver upgrades for free agents
     * who can no longer help this week. Absent → no game-time gating.
     */
    startedTeams?: Set<string>;
    /** MyFFPC ltuid for this league (env-sourced) → real SetLineup.aspx deep
     *  link. Absent → the in-app view is used. */
    myffpcLtuid?: string | null;
}

export interface ActionCenterOptions {
    seasonMode: SeasonMode;
    /** Current NFL week (for item ids / week-scoped acknowledge upstream). */
    week?: number | null;
    /** Max actionable waiver swaps surfaced per league (default 3). */
    waiverPerLeague?: number;
    /** Max strengthen-moves per team off-season. */
    perTeamLimit?: number;
}

export interface ActionItem {
    id: string;
    kind: ActionKind;
    headline: string;
    detail?: string;
    leagueName: string;
    platform: PortfolioPlatform;
    leagueId: string;
    deepLink: string;
    scope?: 'fleaflicker';
    edge?: number | null;
    meta?: Record<string, unknown>;
}

export interface ActionTypeGroup {
    kind: ActionKind;
    label: string;
    items: ActionItem[];
}

export interface TeamActionGroup {
    rosterId: string;
    teamName: string;
    platform: PortfolioPlatform;
    leagueId: string;
    tier: TierBand;
    tierLabel: string;
    weakness?: string;
    items: ActionItem[];
}

export interface ActionCenter {
    seasonMode: SeasonMode;
    isEmpty: boolean;
    byType?: ActionTypeGroup[];
    byTeam?: TeamActionGroup[];
    counts: { lineup: number; trade: number; waiver: number; waiverUpgrade: number; stream: number; sell: number };
}

const KIND_LABEL: Record<ActionKind, string> = {
    lineup: 'Lineup fixes',
    trade: 'Trades to review',
    waiver: 'Waiver adds',
    'waiver-upgrade': 'Weekly waiver upgrades',
    stream: 'Stream a defense',
    sell: 'Sell-window',
};

// The cross-league Action Center (top of the hub) shows ONLY urgent, time-
// sensitive actions. Waiver adds + DEF streaming are per-league concerns and
// render inside each league card instead (see buildLeagueActions).
const URGENT_KINDS: ActionKind[] = ['lineup', 'trade'];

/**
 * Deep-link target for a league/team. v1 links to the in-app league view (the
 * same routing the portfolio cards use); the "leave to the real platform" URL
 * is a follow-up. Mirrors `dbHref` in src/app/portfolio/page.tsx.
 */
/**
 * Deep-link target for a league/team. Prefers the REAL platform URL (so the
 * "Open →" jumps straight to your team on Sleeper/Fleaflicker/Yahoo/MyFFPC to
 * make the move); falls back to the in-app league view when we don't have the
 * URL pattern or the needed id yet.
 *
 * `myRosterId` is the platform's team identifier from useMyTeams:
 *   - fleaflicker: the team id → /nfl/leagues/{leagueId}/teams/{teamId}
 *   - sleeper:     the numeric roster_id (not needed — Sleeper resolves your team from the session)
 *   - yahoo:       the team number
 *   - myffpc:      the viewingTeam-based roster_id (ltuid passed separately)
 */
export function deepLinkFor(platform: PortfolioPlatform, leagueId: string, myRosterId?: string | null, myffpcLtuid?: string | null): string {
    if (platform === 'fleaflicker') {
        // Confirmed pattern: /nfl/leagues/{leagueId}/teams/{teamId}
        return myRosterId
            ? `https://www.fleaflicker.com/nfl/leagues/${leagueId}/teams/${myRosterId}`
            : `https://www.fleaflicker.com/nfl/leagues/${leagueId}`;
    }
    if (platform === 'sleeper') {
        // Confirmed pattern: /leagues/{leagueId}/team → lands on your team
        // (Sleeper resolves "your team" from the logged-in session; no id needed).
        return `https://sleeper.com/leagues/${leagueId}/team`;
    }
    if (platform === 'yahoo') {
        // Pattern: /f1/{leagueId}/{teamNumber}. We only have the portfolio
        // numericId here (not the Yahoo team number), and Yahoo scopes views to
        // the logged-in user anyway, so link to the league home — it resolves to
        // your team. (leagueId IS the numeric Yahoo league id.)
        return `https://football.fantasysports.yahoo.com/f1/${leagueId}`;
    }
    // MyFFPC: real SetLineup.aspx URL when we have the ltuid (env-sourced,
    // provided by the caller); otherwise the in-app view.
    if (platform === 'myffpc') {
        return myffpcLtuid
            ? `https://myffpc.com/SetLineup.aspx?ltuid=${myffpcLtuid}`
            : `/db-league/${platform}/${leagueId}`;
    }
    return `/fleaflicker/${leagueId}`;
}

/** Map a competitive state + league format to a band + format-honest label. */
export function tierFor(state: CompetitiveState, leagueType: PortfolioLeagueType): { band: TierBand; label: string } {
    const band: TierBand = state === 'contender' ? 'top' : state === 'rebuild' ? 'lower' : 'middle';
    const redraft = leagueType === 'redraft';
    const label =
        band === 'top' ? 'Contender' :
        band === 'middle' ? (redraft ? 'In the mix' : 'Middle') :
        (redraft ? 'Falling behind' : 'Rebuild');
    return { band, label };
}

/** The team's weakest starter as a short weakness note (for off-season by-team). */
function primaryWeakness(team: PortfolioTeam): string | undefined {
    const w = weakestStarter(team);
    if (w.player) return `${w.player.position} (${w.player.full_name})`;
    return undefined;
}

// ── Per-league derivations ───────────────────────────────────────────────────

function lineupItems(input: ActionCenterInput): ActionItem[] {
    const { league, myRosterId } = input;
    if (!myRosterId) return [];
    const team = league.teams.find(t => t.rosterId === myRosterId);
    if (!team) return [];
    const opt = optimizePortfolioTeam(league, team, input.startedTeams);
    if (!opt || opt.isOptimal || !opt.hasWeeklyData) return [];
    const link = deepLinkFor(league.platform, league.leagueId, myRosterId, input.myffpcLtuid);
    return opt.swaps.map(s => {
        const startId = s.startPlayer.sleeper_id;
        const benchId = s.benchPlayer?.sleeper_id ?? 'none';
        return {
            id: `lineup:${league.platform}:${league.leagueId}:${startId}->${benchId}`,
            kind: 'lineup' as const,
            headline: s.benchPlayer
                ? `Start ${s.startPlayer.full_name} over ${s.benchPlayer.full_name}`
                : `Start ${s.startPlayer.full_name}`,
            detail: [s.slot, s.rankGain != null ? `+${s.rankGain} rank` : null].filter(Boolean).join(' · ') || undefined,
            leagueName: league.name,
            platform: league.platform,
            leagueId: league.leagueId,
            deepLink: link,
            meta: { startId, benchId, slot: s.slot },
        };
    });
}

function toTxnPlayer(p: PortfolioPlayer): TxnPlayer {
    return { sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team, fc_value: p.marketValue };
}

/**
 * Actionable waiver items: ADD→DROP swaps (or pure adds into an open spot) from
 * the shared transactions engine, which respects starting-requirement legality
 * and only surfaces genuine upgrades. Requires a known my-team (a drop is
 * roster-specific). Capped per league by the caller.
 */
function waiverItems(input: ActionCenterInput, limit: number): ActionItem[] {
    const { league, myRosterId } = input;
    if (!myRosterId) return [];
    const team = league.teams.find(t => t.rosterId === myRosterId);
    if (!team) return [];

    const config = buildRosterConfig(league.rosterPositions);
    if (!config) return [];

    const myPlayers = team.players.map(toTxnPlayer);
    const freeAgents = league.freeAgents.map(toTxnPlayer);
    const suggestions = generateTransactionSuggestions(myPlayers, freeAgents, config, {
        actualCoreCount: myPlayers.length,
        maxSuggestions: limit,
    });

    const link = deepLinkFor(league.platform, league.leagueId, myRosterId, input.myffpcLtuid);
    return suggestions.map((s: TransactionSuggestion) => {
        const add = s.addPlayer;
        const drop = s.dropPlayer;
        const headline = drop
            ? `Add ${add.full_name} (${add.position ?? '—'}) · drop ${drop.full_name} (${drop.position ?? '—'})`
            : `Add ${add.full_name} (${add.position ?? '—'}) — open spot`;
        // Second muted sub-line: the value math behind the gain. (Dynasty value
        // today; rest-of-season value once that lens ships.)
        const addVal = add.fc_value != null ? Math.round(add.fc_value).toLocaleString() : null;
        const dropVal = drop?.fc_value != null ? Math.round(drop.fc_value).toLocaleString() : null;
        const subDetail = drop && addVal && dropVal
            ? `${add.full_name} ${addVal} → ${drop.full_name} ${dropVal}`
            : addVal
                ? `${add.full_name} ${addVal} value`
                : null;
        return {
            id: `waiver:${league.platform}:${league.leagueId}:${add.sleeper_id}->${drop?.sleeper_id ?? 'open'}`,
            kind: 'waiver' as const,
            headline,
            detail: `+${Math.round(s.valueGain).toLocaleString()} value${s.type === 'swap' ? ` (${Math.round(s.valueGainPct)}%)` : ''}`,
            leagueName: league.name,
            platform: league.platform,
            leagueId: league.leagueId,
            deepLink: link,
            meta: { addId: add.sleeper_id, dropId: drop?.sleeper_id ?? null, valueGain: s.valueGain, subDetail },
        };
    });
}

/**
 * Weekly waiver UPGRADE items (distinct from value-based `waiver` items): free
 * agents who improve THIS WEEK's lineup by weekly rank, with the 3-tier
 * drop guardrail (safe / caution / block→informational). In-season only — a
 * weekly-lineup concern. For redraft the long-term lens is a rest-of-season
 * placeholder (defaults to marketValue until real ROS data lands).
 */
function waiverUpgradeItems(input: ActionCenterInput, limit: number): ActionItem[] {
    const { league, myRosterId } = input;
    if (!myRosterId) return [];
    const team = league.teams.find(t => t.rosterId === myRosterId);
    if (!team) return [];

    const config = buildRosterConfig(league.rosterPositions);
    if (!config) return [];

    // TODO(ros): when rest-of-season rankings ship, inject longTermValueOf for
    // redraft leagues here (dynasty/keeper keep marketValue). For now marketValue
    // is the stand-in long-term lens across all league types.
    const upgrades = findWaiverUpgrades(team, league.freeAgents, league.rosterPositions, league.leagueType, {
        coreCapacity: config.coreCapacity,
        actualCoreCount: team.players.filter(p => p.position !== 'PICK').length,
        maxSuggestions: limit,
        startedTeams: input.startedTeams,
    });

    const link = deepLinkFor(league.platform, league.leagueId, myRosterId, input.myffpcLtuid);
    const poolLabel = (pool: 'qb' | 'flex' | null) => (pool === 'qb' ? 'QB' : pool === 'flex' ? 'Flex' : '');
    return upgrades.map((u: WaiverUpgrade) => {
        const add = u.add;
        const drop = u.drop;
        const headline = u.informational
            ? `Waiver help at ${add.position ?? '—'}: ${add.full_name} — but no worthwhile drop`
            : u.type === 'add'
                ? `Add ${add.full_name} (${add.position ?? '—'}) — open spot, plays this week`
                : `Add ${add.full_name} (${add.position ?? '—'}) · drop ${drop?.full_name ?? '—'}`;

        // Primary (concise) line.
        const primaryBits = [
            u.cracksLineup ? 'cracks your lineup' : null,
            u.weeklyRankGain != null ? `+${u.weeklyRankGain} spots this week` : null,
        ].filter(Boolean);

        // Second muted sub-line: quantify the this-week edge + what you give up.
        const pl = poolLabel(u.pool);
        const rankBit = u.addWeeklyRank != null && u.dropWeeklyRank != null && drop
            ? `${pl} #${u.addWeeklyRank} vs ${drop.full_name} ${pl} #${u.dropWeeklyRank}`
            : u.addWeeklyRank != null
                ? `${pl} #${u.addWeeklyRank} this week`
                : null;
        const giveUpBit = u.type === 'swap' && u.valueSurrendered != null
            ? `gives up ${Math.round(u.valueSurrendered).toLocaleString()} value`
            : null;
        const subBits = [rankBit, giveUpBit].filter(Boolean);

        return {
            id: `waiver-upgrade:${league.platform}:${league.leagueId}:${add.sleeper_id}->${drop?.sleeper_id ?? 'open'}`,
            kind: 'waiver-upgrade' as const,
            headline,
            detail: primaryBits.join(' · ') || undefined,
            leagueName: league.name,
            platform: league.platform,
            leagueId: league.leagueId,
            deepLink: link,
            meta: {
                addId: add.sleeper_id,
                dropId: drop?.sleeper_id ?? null,
                tier: u.tier,
                informational: u.informational,
                cracksLineup: u.cracksLineup,
                weeklyRankGain: u.weeklyRankGain,
                badgeWorthy: isBadgeWorthy(u),
                subDetail: subBits.join(' · ') || null,
            },
        };
    });
}

function tradeItems(input: ActionCenterInput): ActionItem[] {
    const { league, pendingTrades, myRosterId } = input;
    if (!pendingTrades || pendingTrades.length === 0) return [];
    const link = deepLinkFor(league.platform, league.leagueId, myRosterId, input.myffpcLtuid);
    return pendingTrades.map(t => ({
        id: `trade:${league.platform}:${league.leagueId}:${t.id}`,
        kind: 'trade' as const,
        headline: t.headline,
        detail: t.detail,
        leagueName: league.name,
        platform: league.platform,
        leagueId: league.leagueId,
        deepLink: t.deepLink ?? link,
        scope: 'fleaflicker' as const,
    }));
}

/**
 * DEF streaming: for REDRAFT leagues, recommend the best-ranked AVAILABLE defense
 * (per the weekly DST rankings) when it beats my current starter's ranking — a
 * DST-for-DST swap that keeps a legal lineup (never drops my only DEF for nothing).
 * Requires a known my-team + a supplied DST list. Dynasty leagues are skipped
 * (streaming defenses is a redraft activity).
 */
function streamItems(input: ActionCenterInput): ActionItem[] {
    const { league, myRosterId, dstRankings } = input;
    if (!dstRankings || dstRankings.length === 0) return [];
    if (league.leagueType !== 'redraft') return [];
    if (!myRosterId) return [];
    const myTeam = league.teams.find(t => t.rosterId === myRosterId);
    if (!myTeam) return [];

    // Rank lookup from the uploaded list.
    const rankById = new Map<string, DstRankInput>();
    for (const d of dstRankings) rankById.set(d.sleeper_id, d);

    // Defenses rostered anywhere in the league = unavailable.
    const rosteredDef = new Set<string>();
    for (const t of league.teams) {
        for (const p of t.players) {
            if ((p.position === 'DEF' || p.position === 'DST') && p.sleeper_id) rosteredDef.add(p.sleeper_id);
        }
    }

    // My current DEF (if any) + its rank.
    const myDef = myTeam.players.find(p => (p.position === 'DEF' || p.position === 'DST'));
    const myRank = myDef ? (rankById.get(myDef.sleeper_id)?.rank ?? null) : null;

    // Best-ranked available defense from the list.
    const bestAvailable = dstRankings
        .filter(d => d.rank != null && !rosteredDef.has(d.sleeper_id))
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))[0];
    if (!bestAvailable) return [];

    // Recommend only if it's a genuine upgrade: I have no DEF, my DEF isn't ranked
    // this week, or the available one is meaningfully better (>= 3 rank spots).
    const isUpgrade = myRank == null || (bestAvailable.rank != null && bestAvailable.rank <= myRank - 3);
    if (!isUpgrade) return [];

    const link = deepLinkFor(league.platform, league.leagueId, myRosterId, input.myffpcLtuid);
    const oppNote = bestAvailable.opponent ? `vs ${bestAvailable.opponent}` : '';
    const tierNote = bestAvailable.tier != null ? `tier ${bestAvailable.tier}` : '';
    const spreadNote = bestAvailable.spread != null ? `${bestAvailable.spread > 0 ? '+' : ''}${bestAvailable.spread}` : '';
    const detailBits = [oppNote, tierNote, spreadNote].filter(Boolean).join(' · ');
    const headline = myDef
        ? `Stream ${bestAvailable.name ?? bestAvailable.sleeper_id} · drop ${myDef.full_name}`
        : `Stream ${bestAvailable.name ?? bestAvailable.sleeper_id} (DEF)`;

    return [{
        id: `stream:${league.platform}:${league.leagueId}:${bestAvailable.sleeper_id}`,
        kind: 'stream' as const,
        headline,
        detail: detailBits || undefined,
        leagueName: league.name,
        platform: league.platform,
        leagueId: league.leagueId,
        deepLink: link,
        meta: { defId: bestAvailable.sleeper_id, rank: bestAvailable.rank, myRank },
    }];
}

// ── Public entry ─────────────────────────────────────────────────────────────

export function buildActionCenter(inputs: ActionCenterInput[], opts: ActionCenterOptions): ActionCenter {
    const { seasonMode, perTeamLimit = 4 } = opts;
    const waiverPerLeague = opts.waiverPerLeague ?? 3;

    // Collect all items per kind across leagues.
    const lineup: ActionItem[] = [];
    const trade: ActionItem[] = [];
    const waiver: ActionItem[] = [];
    const waiverUpgrade: ActionItem[] = [];
    const stream: ActionItem[] = [];

    for (const input of inputs) {
        lineup.push(...lineupItems(input));
        trade.push(...tradeItems(input));
        stream.push(...streamItems(input));
        waiver.push(...waiverItems(input, waiverPerLeague));
        // Weekly waiver upgrades are an in-season concern.
        if (seasonMode === 'in-season') waiverUpgrade.push(...waiverUpgradeItems(input, waiverPerLeague));
    }

    // Only badge-worthy upgrades (safe + actionable) count toward the visible
    // tally — caution and informational items stay quiet by design.
    const badgeWorthyUpgrades = waiverUpgrade.filter(i => i.meta?.badgeWorthy === true).length;
    const counts = { lineup: lineup.length, trade: trade.length, waiver: waiver.length, waiverUpgrade: badgeWorthyUpgrades, stream: stream.length, sell: 0 };
    // The cross-league Action Center is urgent-only (lineup + trade). Waiver +
    // stream are surfaced per-league in the cards, so they don't gate the quiet
    // state of the top strip.
    const urgentEmpty = lineup.length + trade.length === 0;

    if (seasonMode === 'in-season') {
        const byKind: Record<ActionKind, ActionItem[]> = { lineup, trade, waiver, 'waiver-upgrade': waiverUpgrade, stream, sell: [] };
        const byType: ActionTypeGroup[] = URGENT_KINDS
            .filter(k => byKind[k].length > 0)
            .map(k => ({ kind: k, label: KIND_LABEL[k], items: byKind[k] }));
        return { seasonMode, isEmpty: urgentEmpty, byType, counts };
    }

    // Off-season → group by TEAM (only leagues where my-team is known).
    const byTeam: TeamActionGroup[] = [];
    for (const input of inputs) {
        const { league, myRosterId } = input;
        if (!myRosterId) continue;
        const team = league.teams.find(t => t.rosterId === myRosterId);
        if (!team) continue;

        const label = labelTeam(team, league);
        const { band, label: tierLabel } = tierFor(label.state, league.leagueType);

        // Strengthen-moves for this team: actionable waiver swaps + streaming + trades.
        const items: ActionItem[] = [
            ...waiverItems(input, waiverPerLeague),
            ...streamItems(input),
            ...tradeItems(input),
        ].slice(0, perTeamLimit);

        if (items.length === 0) continue;

        byTeam.push({
            rosterId: team.rosterId,
            teamName: team.ownerName,
            platform: league.platform,
            leagueId: league.leagueId,
            tier: band,
            tierLabel,
            weakness: primaryWeakness(team),
            items,
        });
    }

    return { seasonMode, isEmpty: byTeam.length === 0, byTeam, counts };
}

/**
 * Per-league in-season recommendations rendered INSIDE that league's card:
 * actionable waiver ADD→DROP swaps + a DEF streaming suggestion (redraft only).
 * Kept out of the cross-league Action Center (which is urgent-only). Returns []
 * when my-team is unknown (both are roster-specific).
 */
export function buildLeagueActions(input: ActionCenterInput, waiverPerLeague = 3): ActionItem[] {
    return [
        // Weekly upgrades surface more (top 5 shown in the card, rest behind
        // "show more") — request a deeper list than the value-based waivers.
        ...waiverUpgradeItems(input, 15),
        ...waiverItems(input, waiverPerLeague),
        ...streamItems(input),
    ];
}
