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
    type CompetitiveState,
    labelTeam,
    weakestStarter,
    undervaluedFreeAgents,
    optimizePortfolioTeam,
} from './portfolio';

export type SeasonMode = 'in-season' | 'off-season';
export type ActionKind = 'lineup' | 'trade' | 'waiver' | 'sell';
export type TierBand = 'top' | 'middle' | 'lower';

/** One pending/incoming trade offer for a league (Fleaflicker-only today). */
export interface PendingTradeInput {
    id: string;
    headline: string;       // "You get Garrett Wilson ↔ give Breece Hall"
    detail?: string;        // "even market value"
    deepLink?: string;
}

/** Per-league input the engine consumes (UI supplies these after loading). */
export interface ActionCenterInput {
    league: PortfolioLeague;
    myRosterId: string | null;
    /** Optional pending/incoming trades (Fleaflicker). Absent → no auto trade items. */
    pendingTrades?: PendingTradeInput[];
}

export interface ActionCenterOptions {
    seasonMode: SeasonMode;
    /** Current NFL week (for item ids / week-scoped acknowledge upstream). */
    week?: number | null;
    /** Rank-edge threshold for waiver adds (defaults to the portfolio default). */
    minEdge?: number;
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
    counts: { lineup: number; trade: number; waiver: number; sell: number };
}

const KIND_LABEL: Record<ActionKind, string> = {
    lineup: 'Lineup fixes',
    trade: 'Trades to review',
    waiver: 'Waiver adds',
    sell: 'Sell-window',
};

const KIND_ORDER: ActionKind[] = ['lineup', 'trade', 'waiver', 'sell'];

/**
 * Deep-link target for a league/team. v1 links to the in-app league view (the
 * same routing the portfolio cards use); the "leave to the real platform" URL
 * is a follow-up. Mirrors `dbHref` in src/app/portfolio/page.tsx.
 */
export function deepLinkFor(platform: PortfolioPlatform, leagueId: string): string {
    if (platform === 'yahoo' || platform === 'myffpc') return `/db-league/${platform}/${leagueId}`;
    if (platform === 'sleeper') return `/league/${leagueId}`;
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

/** Rough per-position surplus check for a roster (skill positions only). */
function primaryWeakness(team: { players: PortfolioPlayer[] }): string | undefined {
    const w = weakestStarter(team as any);
    if (w.player) return `${w.player.position} (${w.player.full_name})`;
    return undefined;
}

// ── Per-league derivations ───────────────────────────────────────────────────

function lineupItems(input: ActionCenterInput): ActionItem[] {
    const { league, myRosterId } = input;
    if (!myRosterId) return [];
    const team = league.teams.find(t => t.rosterId === myRosterId);
    if (!team) return [];
    const opt = optimizePortfolioTeam(league, team);
    if (!opt || opt.isOptimal || !opt.hasWeeklyData) return [];
    const link = deepLinkFor(league.platform, league.leagueId);
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

function waiverItems(input: ActionCenterInput, minEdge?: number): ActionItem[] {
    const { league } = input;
    const link = deepLinkFor(league.platform, league.leagueId);
    return undervaluedFreeAgents(league, minEdge).map(fa => ({
        id: `waiver:${league.platform}:${league.leagueId}:${fa.player.sleeper_id}`,
        kind: 'waiver' as const,
        headline: `${fa.player.full_name} (${fa.player.position ?? '—'})`,
        detail: fa.reason === 'buy' ? 'tagged BUY' : fa.reason === 'add' ? 'analyst ADD' : undefined,
        leagueName: league.name,
        platform: league.platform,
        leagueId: league.leagueId,
        deepLink: link,
        edge: fa.rankEdge,
        meta: { reason: fa.reason },
    }));
}

function tradeItems(input: ActionCenterInput): ActionItem[] {
    const { league, pendingTrades } = input;
    if (!pendingTrades || pendingTrades.length === 0) return [];
    const link = deepLinkFor(league.platform, league.leagueId);
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

// ── Public entry ─────────────────────────────────────────────────────────────

export function buildActionCenter(inputs: ActionCenterInput[], opts: ActionCenterOptions): ActionCenter {
    const { seasonMode, minEdge, perTeamLimit = 4 } = opts;

    // Collect all items per kind across leagues.
    const lineup: ActionItem[] = [];
    const trade: ActionItem[] = [];
    const waiver: ActionItem[] = [];

    for (const input of inputs) {
        lineup.push(...lineupItems(input));
        trade.push(...tradeItems(input));
        waiver.push(...waiverItems(input, minEdge));
    }

    const counts = { lineup: lineup.length, trade: trade.length, waiver: waiver.length, sell: 0 };
    const isEmpty = lineup.length + trade.length + waiver.length === 0;

    if (seasonMode === 'in-season') {
        const byKind: Record<ActionKind, ActionItem[]> = { lineup, trade, waiver, sell: [] };
        const byType: ActionTypeGroup[] = KIND_ORDER
            .filter(k => byKind[k].length > 0)
            .map(k => ({ kind: k, label: KIND_LABEL[k], items: byKind[k] }));
        return { seasonMode, isEmpty, byType, counts };
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

        // Strengthen-moves for this team: waiver adds + (trade items if any).
        const items: ActionItem[] = [
            ...waiverItems(input, minEdge),
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
