/**
 * Waiver Upgrade Finder — weekly-lineup lens (pure, no I/O).
 *
 * Distinct from the dynasty-value Suggested Transactions engine
 * (transaction-suggestions.ts). That one asks "who improves my long-term asset
 * value?"; THIS one asks "is there a free agent who improves my lineup THIS
 * WEEK?" — using the weekly rank signal (the same the lineup optimizer uses).
 *
 * The whole point is the DROP-SIDE GUARDRAIL: a weekly upgrade should never
 * blindly recommend dropping a valuable long-term asset for a one-week bump.
 * Every suggested drop is classified into three tiers:
 *   - safe    : low long-term value, not a this-week starter → suggest freely.
 *   - caution : meaningful long-term value → show, but flagged ("you'd drop X…").
 *   - block   : major long-term asset → never suggest dropping. If a FA would
 *               help but EVERY legal drop is a block, we emit an informational
 *               item (no drop) so the user knows help exists.
 *
 * Open roster spots produce a pure ADD (no drop) — always safe. This is the
 * clean answer to the bye-week case: add-and-start a fill-in without dropping
 * your benched-on-bye stud.
 *
 * "Long-term value" is injected (longTermValueOf) so the caller controls the
 * lens: dynasty/keeper → dynasty market value; redraft → rest-of-season value
 * (a placeholder today; see the route wiring).
 */

import {
    buildSlots,
    optimizeLineup,
    type OptimizerPlayer,
    type LineupSlot,
} from './lineup-optimizer';
import { canonicalPos } from './transaction-suggestions';
import type { PortfolioTeam, PortfolioPlayer, PortfolioLeagueType } from './portfolio';

export type DropTier = 'safe' | 'caution' | 'block';

export interface WaiverUpgrade {
    /** The free agent to add. */
    add: PortfolioPlayer;
    /**
     * The roster player to drop, or null for a pure add (open roster spot).
     * For an informational item (helps this week but no worthwhile drop), this
     * is the least-bad *blocked* drop we would have paired — kept for context —
     * but `informational` is true and it should NOT be presented as a to-do.
     */
    drop: PortfolioPlayer | null;
    /** 'add' = open spot, no drop needed; 'swap' = requires dropping `drop`. */
    type: 'add' | 'swap';
    /** Drop-side tier (for a pure add, always 'safe'). */
    tier: DropTier;
    /**
     * True when this add would only be actionable by dropping a BLOCKED asset —
     * surfaced as an FYI ("waiver help exists, no worthwhile drop"), never as an
     * actionable suggestion, and never counted toward an urgency badge.
     */
    informational: boolean;
    /** Would the free agent crack my OPTIMAL starting lineup this week? */
    cracksLineup: boolean;
    /**
     * Weekly-rank improvement vs the roster player this add is best compared to
     * (that player's weeklyRank − add's weeklyRank; higher = bigger upgrade).
     * null when either side is unranked this week.
     */
    weeklyRankGain: number | null;
    /** The roster player the add is compared against on the weekly-rank axis. */
    comparedTo: PortfolioPlayer | null;
}

export interface WaiverUpgradeOptions {
    /**
     * Long-term value of a player (higher = more valuable), for tier
     * classification of drop candidates. Defaults to marketValue.
     */
    longTermValueOf?: (p: PortfolioPlayer) => number | null;
    /**
     * Long-term value thresholds. A drop candidate with value:
     *   >= blockAtValue        → 'block'
     *   >= cautionAtValue       → 'caution'
     *   otherwise               → 'safe'
     * Defaults are tuned for FantasyCalc-style values and can be adjusted.
     */
    blockAtValue?: number;
    cautionAtValue?: number;
    /** Max upgrades to return (sorted best-first). Default 25. */
    maxSuggestions?: number;
    /**
     * True roster size when some rostered players couldn't be matched to the DB
     * (so team.players undercounts). Used only for open-spot detection.
     */
    actualCoreCount?: number;
    /** Total core roster capacity (starters + bench), excluding IR/taxi. */
    coreCapacity?: number;
    /**
     * NFL team abbrs (our convention: JAX/LAR/…) whose game this week has already
     * kicked off (state != 'pre'). A free agent on such a team can't help THIS
     * week, so we suppress the upgrade. Add-side only — the drop's game state
     * doesn't matter. Empty/undefined → no game-time gating.
     */
    startedTeams?: Set<string>;
}

const DEFAULT_BLOCK_AT = 4000;   // ~top-of-market asset; never drop for a streamer
const DEFAULT_CAUTION_AT = 1500; // meaningful piece; flag before dropping

/** Lower weekly rank = better. Unranked sorts last. */
function wr(p: { weeklyRank?: number | null }): number {
    return p.weeklyRank ?? Number.POSITIVE_INFINITY;
}

/** PortfolioPlayer → OptimizerPlayer (the lineup engine's shape). */
function toOptimizer(p: PortfolioPlayer, isStarter: boolean): OptimizerPlayer {
    return {
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        rank: p.weeklyRank ?? null,
        total: p.weeklyTotal ?? null,
        posMatchup: p.weeklyPosMatchup ?? null,
        isStarter,
    };
}

/** Which slots is this position eligible to fill, given the league's slots? */
function eligibleSlotsFor(position: string | null, slots: LineupSlot[]): LineupSlot[] {
    if (!position) return [];
    return slots.filter(s => s.eligible.has(position));
}

/**
 * Find waiver upgrades for one team: free agents whose WEEKLY rank would improve
 * the lineup, each paired with a guarded drop (or a pure add on an open spot).
 */
export function findWaiverUpgrades(
    team: PortfolioTeam,
    freeAgents: PortfolioPlayer[],
    rosterPositions: string[] | null | undefined,
    leagueType: PortfolioLeagueType,
    options: WaiverUpgradeOptions = {},
): WaiverUpgrade[] {
    const slots = buildSlots(rosterPositions);
    if (slots.length === 0) return [];

    const valueOf = options.longTermValueOf ?? ((p: PortfolioPlayer) => p.marketValue);
    const blockAt = options.blockAtValue ?? DEFAULT_BLOCK_AT;
    const cautionAt = options.cautionAtValue ?? DEFAULT_CAUTION_AT;
    const maxSuggestions = options.maxSuggestions ?? 25;

    const roster = team.players.filter(p => p.position !== 'PICK');

    // Only free agents with a weekly rank can improve THIS WEEK's lineup.
    // Also drop any FA whose NFL game has already kicked off — they can't help
    // this week (add-side game-time gate).
    const startedTeams = options.startedTeams;
    const rankedFAs = freeAgents.filter(fa => {
        if (fa.weeklyRank == null || !fa.position) return false;
        if (startedTeams && fa.team && startedTeams.has(fa.team.toUpperCase())) return false;
        return true;
    });
    if (rankedFAs.length === 0) return [];

    // Current optimal lineup (weekly rank) → who would start this week.
    const currentOptimal = optimizeLineup(
        roster.map(p => toOptimizer(p, p.is_starter)),
        slots,
    );
    const currentStarterIds = new Set(
        currentOptimal.map(a => a.player?.sleeper_id).filter(Boolean) as string[],
    );

    // Open-spot detection: capacity − current roster size.
    const rosterCount = Math.max(options.actualCoreCount ?? 0, roster.length);
    const openSpots = options.coreCapacity != null
        ? Math.max(0, options.coreCapacity - rosterCount)
        : 0;

    const classify = (p: PortfolioPlayer | null): DropTier => {
        if (!p) return 'safe';
        const v = valueOf(p) ?? 0;
        if (v >= blockAt) return 'block';
        if (v >= cautionAt) return 'caution';
        return 'safe';
    };

    const out: WaiverUpgrade[] = [];

    for (const fa of rankedFAs) {
        const faSlots = eligibleSlotsFor(fa.position, slots);
        if (faSlots.length === 0) continue; // no slot this FA can fill

        // Roster players this FA competes with (eligible for a shared slot).
        const rivals = roster.filter(r => {
            const pos = r.position;
            return pos != null && faSlots.some(s => s.eligible.has(pos));
        });
        // The best (highest weekly rank) rival the FA still OUT-RANKS this week.
        // We compare against the WORST rival in the FA's pool that the FA beats —
        // i.e. the FA is only an upgrade if it out-ranks at least one rival.
        const beaten = rivals
            .filter(r => wr(fa) < wr(r)) // FA strictly better this week
            .sort((a, b) => wr(b) - wr(a)); // worst rival first (biggest cushion)
        if (beaten.length === 0) continue; // FA doesn't upgrade anyone → skip

        // Does the FA crack the OPTIMAL lineup? Re-optimize with the FA added.
        const withFa = optimizeLineup(
            [
                ...roster.map(p => toOptimizer(p, p.is_starter)),
                toOptimizer(fa, false),
            ],
            slots,
        );
        const cracksLineup = withFa.some(a => a.player?.sleeper_id === fa.sleeper_id);

        // The natural "compared-to" is the weakest rival the FA beats (the one it
        // would replace at the margin). Weekly-rank gain vs that player.
        const comparedTo = beaten[0];
        const weeklyRankGain = fa.weeklyRank != null && comparedTo.weeklyRank != null
            ? comparedTo.weeklyRank - fa.weeklyRank
            : null;

        // Open spot → pure add, no drop, always safe.
        if (openSpots > 0) {
            out.push({
                add: fa, drop: null, type: 'add', tier: 'safe',
                informational: false, cracksLineup, weeklyRankGain, comparedTo,
            });
            continue;
        }

        // Full roster → need a drop. Pick the lowest LONG-TERM-value legal drop
        // among eligible rivals (never a non-rival: dropping a QB to add a WR
        // isn't a weekly-lineup upgrade). Prefer non-starters.
        const dropPool = [...rivals].sort((a, b) => {
            // Non-starters first (safer to drop), then lowest long-term value.
            const aStart = currentStarterIds.has(a.sleeper_id) ? 1 : 0;
            const bStart = currentStarterIds.has(b.sleeper_id) ? 1 : 0;
            if (aStart !== bStart) return aStart - bStart;
            return (valueOf(a) ?? 0) - (valueOf(b) ?? 0);
        });

        // The best actionable drop = the first whose tier is not 'block'.
        const safeOrCaution = dropPool.find(d => classify(d) !== 'block') ?? null;

        if (safeOrCaution) {
            out.push({
                add: fa,
                drop: safeOrCaution,
                type: 'swap',
                tier: classify(safeOrCaution),
                informational: false,
                cracksLineup,
                weeklyRankGain,
                comparedTo,
            });
        } else {
            // Every legal drop is a blocked asset → informational only.
            out.push({
                add: fa,
                drop: dropPool[0] ?? null,
                type: 'swap',
                tier: 'block',
                informational: true,
                cracksLineup,
                weeklyRankGain,
                comparedTo,
            });
        }
    }

    // Sort: actionable before informational; lineup-crackers first; then bigger
    // weekly-rank gain; safe above caution.
    const tierRank = (u: WaiverUpgrade) => (u.informational ? 2 : u.tier === 'caution' ? 1 : 0);
    out.sort((a, b) => {
        if (a.informational !== b.informational) return a.informational ? 1 : -1;
        if (a.cracksLineup !== b.cracksLineup) return a.cracksLineup ? -1 : 1;
        if (tierRank(a) !== tierRank(b)) return tierRank(a) - tierRank(b);
        return (b.weeklyRankGain ?? 0) - (a.weeklyRankGain ?? 0);
    });

    return out.slice(0, maxSuggestions);
}

/** Does this upgrade count toward an urgency badge? Only actionable (non-info)
 *  safe items — caution and informational are intentionally quiet. */
export function isBadgeWorthy(u: WaiverUpgrade): boolean {
    return !u.informational && u.tier === 'safe';
}
