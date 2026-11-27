/**
 * Slot Gap engine (pure, no I/O) — "where do my starters rank vs the best free
 * agent, and do I need to act?"
 *
 * For each STARTING slot it compares my player (the one the optimal lineup puts
 * in that slot) to the best AVAILABLE free agent, on two independent horizons:
 *   - weekly: this week's rank, compared ONLY within the same weekly rank pool
 *             (qb / flex / k). Pools are separate uploaded lists, so a QB rank is
 *             never compared to a flex rank, even in a SUPERFLEX slot.
 *   - ROS:    rest-of-season POSITION rank, compared to free agents at the SAME
 *             position as my player (a FLEX slot filled by a WR compares to WRs).
 *
 * Output is deliberately quiet-friendly: every slot gets a status (none / minor /
 * actionable / unranked-mine / unavailable) so the UI can collapse the boring
 * ones and still show the numbers ("K #5 vs best available #12 — no action").
 * Recommended moves are attached only where a gap is worth acting on, reusing the
 * guarded-drop result of `findWaiverUpgrades` (this module invents no drop math).
 *
 * DEF-only slots are intentionally skipped here (Story 3.2).
 */

import { buildSlots, optimizeLineup, type LineupSlot } from './lineup-optimizer';
import { poolOf, toOptimizer, type DropTier, type WaiverUpgrade } from './waiver-upgrades';
import type { PortfolioPlayer } from './portfolio';

export type WeeklyPool = 'qb' | 'flex' | 'k';

export type GapStatus = 'none' | 'minor' | 'actionable' | 'unranked-mine' | 'unavailable';

/**
 * Gap thresholds, in rank spots. A gap strictly GREATER than the threshold is
 * `actionable`; a positive gap at or below it is `minor`. Starting values, meant
 * to be tuned against real weeks — change them here only.
 *
 * Note: these control what the Roster Gaps card HIGHLIGHTS. They are intentionally
 * separate from the Action Center's alerting rules (e.g. its 3-spot K/DEF stream
 * trigger) and must not be wired to them.
 */
export const GAP_THRESHOLDS = {
    weekly: { qb: 4, flex: 8, k: 5 } as Record<WeeklyPool, number>,
    ros: { QB: 4, RB: 6, WR: 6, TE: 4 } as Record<string, number>,
} as const;

export interface RankedPlayer {
    player: PortfolioPlayer;
    rank: number;
}

export interface HorizonGap {
    status: GapStatus;
    /** My player's rank on this horizon (null when unranked / empty slot). */
    myRank: number | null;
    /** Best available free agent on this horizon (null when none ranked). */
    best: RankedPlayer | null;
    /** myRank − best.rank. Positive = the free agent is better. */
    gap: number | null;
    /** Threshold used for this horizon (null when not applicable). */
    threshold: number | null;
    /** Weekly horizon only: which rank pool the comparison is in. */
    pool?: WeeklyPool;
    /** Weekly horizon only: my player's game has started, nothing can change. */
    locked?: boolean;
}

export interface SlotMove {
    add: PortfolioPlayer;
    /** Guarded drop, or null (open roster spot, ROS-only, or informational). */
    drop: PortfolioPlayer | null;
    type: 'add' | 'swap';
    tier: DropTier;
    /** True when help exists but every legal drop is a core asset. */
    informational: boolean;
    weeklyRankGain: number | null;
    /** Where the recommendation came from. */
    source: 'weekly-upgrade' | 'ros-only';
    note: string | null;
}

export interface SlotGap {
    slot: string;
    myPlayer: PortfolioPlayer | null;
    weekly: HorizonGap;
    ros: HorizonGap;
    /** The worse of the two horizons. */
    status: GapStatus;
    move: SlotMove | null;
}

export interface SlotGapInput {
    /** My roster (PICK rows are ignored). */
    roster: PortfolioPlayer[];
    /** Players available to add (already excludes anyone rostered in the league). */
    freeAgents: PortfolioPlayer[];
    rosterPositions: string[] | null | undefined;
    /** NFL team abbrs whose game has kicked off. Gates the weekly horizon only. */
    startedTeams?: Set<string>;
    /** Output of findWaiverUpgrades for this team (used to attach guarded moves). */
    upgrades?: WaiverUpgrade[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** De-duplicate by sleeper_id, keeping the first occurrence (candidate merging). */
export function dedupeById<T extends { sleeper_id: string }>(list: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const p of list) {
        if (seen.has(p.sleeper_id)) continue;
        seen.add(p.sleeper_id);
        out.push(p);
    }
    return out;
}

const SEVERITY: Record<GapStatus, number> = {
    unavailable: 0,
    none: 1,
    minor: 2,
    'unranked-mine': 3,
    actionable: 4,
};

function worse(a: GapStatus, b: GapStatus): GapStatus {
    return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

function classify(gap: number, threshold: number): GapStatus {
    if (gap <= 0) return 'none';
    return gap > threshold ? 'actionable' : 'minor';
}

const UNAVAILABLE: HorizonGap = { status: 'unavailable', myRank: null, best: null, gap: null, threshold: null };

function isDefOnly(slot: LineupSlot): boolean {
    return slot.eligible.size === 1 && slot.eligible.has('DEF');
}

// ── core ─────────────────────────────────────────────────────────────────────

export function computeSlotGaps(input: SlotGapInput): SlotGap[] {
    const slots = buildSlots(input.rosterPositions);
    if (slots.length === 0) return [];

    const started = input.startedTeams;
    const hasStarted = (p: PortfolioPlayer): boolean =>
        !!(started && p.team && started.has(p.team.toUpperCase()));

    const roster = input.roster.filter(p => p.position !== 'PICK');
    const freeAgents = input.freeAgents.filter(p => p.position && p.position !== 'PICK');

    // "My player at each slot" = the optimal-lineup assignment. Played players
    // are locked so a played starter keeps its slot (same as findWaiverUpgrades).
    const assigned = optimizeLineup(
        roster.map(p => toOptimizer(p, p.is_starter, hasStarted(p))),
        slots,
    );
    const byId = new Map(roster.map(p => [p.sleeper_id, p]));

    const gaps: SlotGap[] = [];
    slots.forEach((slot, i) => {
        if (isDefOnly(slot)) return; // Story 3.2
        const optPlayer = assigned[i]?.player ?? null;
        const mine = optPlayer ? byId.get(optPlayer.sleeper_id) ?? null : null;

        const weekly = weeklyHorizon(slot, mine, freeAgents, hasStarted);
        const ros = rosHorizon(slot, mine, freeAgents);
        gaps.push({
            slot: slot.slot,
            myPlayer: mine,
            weekly,
            ros,
            // A missing ROS rank is usually an injured / dropped player, not a reason
            // to act, so it stays quiet at the slot level (the horizon still carries
            // the numbers). A missing WEEKLY rank still counts.
            status: worse(weekly.status, ros.status === 'unranked-mine' ? 'none' : ros.status),
            move: null,
        });
    });

    attachMoves(gaps, input.upgrades ?? []);
    return gaps;
}

function weeklyHorizon(
    slot: LineupSlot,
    mine: PortfolioPlayer | null,
    freeAgents: PortfolioPlayer[],
    hasStarted: (p: PortfolioPlayer) => boolean,
): HorizonGap {
    if (mine && hasStarted(mine)) {
        return { ...UNAVAILABLE, myRank: mine.weeklyRank ?? null, locked: true, pool: poolOf(mine.position) ?? undefined };
    }

    const eligibleFas = freeAgents.filter(fa =>
        slot.eligible.has(fa.position as string) &&
        fa.weeklyRank != null &&
        poolOf(fa.position) != null &&
        !hasStarted(fa),
    );

    // Pool: my player's pool; for an empty slot, the pool of the best-ranked
    // eligible free agent (the optimizer also compares raw ranks across pools).
    let pool: WeeklyPool | null = mine ? poolOf(mine.position) : null;
    if (!mine) {
        const top = [...eligibleFas].sort((a, b) => (a.weeklyRank as number) - (b.weeklyRank as number))[0];
        pool = top ? poolOf(top.position) : null;
    }
    if (!pool) return { ...UNAVAILABLE, myRank: mine?.weeklyRank ?? null };

    const threshold = GAP_THRESHOLDS.weekly[pool];
    const candidates = eligibleFas.filter(fa => poolOf(fa.position) === pool);
    const bestFa = [...candidates].sort((a, b) => (a.weeklyRank as number) - (b.weeklyRank as number))[0] ?? null;
    const best: RankedPlayer | null = bestFa ? { player: bestFa, rank: bestFa.weeklyRank as number } : null;
    const myRank = mine?.weeklyRank ?? null;

    if (!mine) {
        // Empty slot: any ranked eligible free agent is worth a look.
        return best
            ? { status: 'actionable', myRank: null, best, gap: null, threshold, pool }
            : { ...UNAVAILABLE, pool };
    }
    if (myRank == null) {
        return best
            ? { status: 'unranked-mine', myRank: null, best, gap: null, threshold, pool }
            : { ...UNAVAILABLE, pool };
    }
    if (!best) return { status: 'none', myRank, best: null, gap: null, threshold, pool };

    const gap = myRank - best.rank;
    return { status: classify(gap, threshold), myRank, best, gap, threshold, pool };
}

function rosHorizon(
    slot: LineupSlot,
    mine: PortfolioPlayer | null,
    freeAgents: PortfolioPlayer[],
): HorizonGap {
    if (!mine || !mine.position) return UNAVAILABLE;
    const threshold = GAP_THRESHOLDS.ros[mine.position];
    if (threshold == null) return UNAVAILABLE; // K / DEF: no ROS horizon

    const pos = mine.position;
    const candidates = freeAgents.filter(fa =>
        fa.position === pos && slot.eligible.has(pos) && fa.rosPosRank != null,
    );
    const bestFa = [...candidates].sort((a, b) =>
        ((a.rosPosRank as number) - (b.rosPosRank as number)) ||
        ((a.rosRank ?? Infinity) - (b.rosRank ?? Infinity)),
    )[0] ?? null;
    const best: RankedPlayer | null = bestFa ? { player: bestFa, rank: bestFa.rosPosRank as number } : null;
    const myRank = mine.rosPosRank ?? null;

    if (myRank == null) {
        return best
            ? { status: 'unranked-mine', myRank: null, best, gap: null, threshold }
            : UNAVAILABLE;
    }
    if (!best) return { status: 'none', myRank, best: null, gap: null, threshold };

    const gap = myRank - best.rank;
    return { status: classify(gap, threshold), myRank, best, gap, threshold };
}

// ── moves ────────────────────────────────────────────────────────────────────

function attachMoves(gaps: SlotGap[], upgrades: WaiverUpgrade[]): void {
    const upgradeByAddId = new Map<string, WaiverUpgrade>();
    for (const u of upgrades) {
        const prev = upgradeByAddId.get(u.add.sleeper_id);
        // Prefer an actionable (non-informational) upgrade if there are duplicates.
        if (!prev || (prev.informational && !u.informational)) upgradeByAddId.set(u.add.sleeper_id, u);
    }

    // Biggest gap first so a shared free agent attaches to the slot that needs him most.
    const order = gaps
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => g.status === 'actionable' || g.status === 'unranked-mine')
        .sort((a, b) => {
            const ag = a.g.weekly.gap ?? a.g.ros.gap ?? Number.POSITIVE_INFINITY;
            const bg = b.g.weekly.gap ?? b.g.ros.gap ?? Number.POSITIVE_INFINITY;
            return (bg - ag) || (a.i - b.i);
        });

    const used = new Set<string>();
    for (const { g } of order) {
        const wk = g.weekly;
        const weeklyWorthIt = wk.status === 'actionable' || wk.status === 'unranked-mine';

        if (weeklyWorthIt && wk.best && !used.has(wk.best.player.sleeper_id)) {
            const u = upgradeByAddId.get(wk.best.player.sleeper_id);
            if (u) {
                used.add(u.add.sleeper_id);
                g.move = {
                    add: u.add,
                    drop: u.informational ? null : u.drop,
                    type: u.type,
                    tier: u.tier,
                    informational: u.informational,
                    weeklyRankGain: u.weeklyRankGain,
                    source: 'weekly-upgrade',
                    note: u.informational
                        ? 'Help exists, but every droppable player is a core asset'
                        : null,
                };
                continue;
            }
        }

        // ROS-only: no weekly engine result exists for it, so don't invent a drop.
        const rs = g.ros;
        if (rs.status === 'actionable' && rs.best && !used.has(rs.best.player.sleeper_id)) {
            used.add(rs.best.player.sleeper_id);
            g.move = {
                add: rs.best.player,
                drop: null,
                type: 'add',
                tier: 'safe',
                informational: false,
                weeklyRankGain: null,
                source: 'ros-only',
                note: 'Check your bench for a drop',
            };
        }
    }
}

// ── summary ──────────────────────────────────────────────────────────────────

export interface GapSummary {
    /** Slots with an actionable gap or an unranked starter. */
    worthAMove: number;
    /** Slots we could compare and found fine (none / minor). */
    fine: number;
    total: number;
}

export function gapSummary(gaps: SlotGap[]): GapSummary {
    let worthAMove = 0;
    let fine = 0;
    for (const g of gaps) {
        if (g.status === 'actionable' || g.status === 'unranked-mine') worthAMove++;
        else if (g.status === 'none' || g.status === 'minor') fine++;
    }
    return { worthAMove, fine, total: gaps.length };
}
