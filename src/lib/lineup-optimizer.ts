/**
 * Lineup optimizer — platform-agnostic.
 *
 * Given a roster (each player carrying this week's RANK + tiebreak context), the
 * league's starting-slot config, and who's currently started, computes the
 * optimal legal starting lineup and the swaps needed to reach it.
 *
 * KEY SEMANTICS (see brainstorm RESULTS.md):
 *  - The RANK is the projection signal (lower = better). Flex rank orders
 *    RB/WR/TE/flex slots; QB rank orders QB/superflex slots.
 *  - `total` (NFL team implied total) and `posMatchup` are TIEBREAKERS ONLY —
 *    never summed, never a per-player score. When ranks are close, prefer the
 *    higher team total, then the softer positional matchup.
 *  - Players with no weekly rank are treated as worst (bench), never fabricated.
 *
 * The engine takes a normalized input any platform can produce, so wiring a new
 * platform is pure data-plumbing.
 */

export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | string;

export interface OptimizerPlayer {
    sleeper_id: string;
    full_name: string;
    position: Position | null;
    /** This week's rank within the player's pool (flex rank for non-QB, qb rank
     *  for QB). Lower = better. null = unranked (sorts last). */
    rank: number | null;
    /** Tiebreakers only. */
    total: number | null;       // NFL team implied total (higher preferred)
    posMatchup: number | null;  // opponent rank vs position (higher = easier, preferred)
    /** Whether this player is CURRENTLY in the starting lineup. */
    isStarter: boolean;
    /**
     * True when this player's NFL game has already started (kickoff passed), so
     * they are IMMOVABLE this week: a locked starter keeps their slot (can't be
     * benched); a locked bench player can't be moved into the lineup. The
     * optimizer only shuffles NOT-locked players among the remaining slots.
     */
    locked?: boolean;
}

/** A single starting slot and which positions may fill it. */
export interface LineupSlot {
    slot: string;                 // display label, e.g. 'FLEX', 'SUPER_FLEX', 'RB'
    eligible: Set<Position>;      // positions allowed in this slot
}

export interface AssignedSlot {
    slot: string;
    player: OptimizerPlayer | null; // null = no eligible player to fill it
}

export interface LineupSwap {
    /** Player to move INTO the starting lineup. */
    startPlayer: OptimizerPlayer;
    /** Player to move OUT (to bench). null if filling an empty/illegal slot. */
    benchPlayer: OptimizerPlayer | null;
    slot: string;
    /** Rank improvement (benchPlayer.rank - startPlayer.rank); higher = bigger upgrade. */
    rankGain: number | null;
}

export interface OptimizerResult {
    optimal: AssignedSlot[];
    /** Swaps to get from the current lineup to optimal. Empty = already optimal. */
    swaps: LineupSwap[];
    isOptimal: boolean;
}

// ── Slot eligibility ─────────────────────────────────────────────────────────

const FLEX_RBWRTE = new Set(['RB', 'WR', 'TE']);
const FLEX_WRRB = new Set(['RB', 'WR']);
const FLEX_WRTE = new Set(['WR', 'TE']);
const SUPERFLEX = new Set(['QB', 'RB', 'WR', 'TE']);

/** Map a roster_positions token to its eligible position set (or null if it's a
 *  non-starting slot like BN/IR/TAXI). */
export function slotEligibility(token: string): Set<Position> | null {
    const t = token.toUpperCase().trim();
    switch (t) {
        case 'QB': return new Set(['QB']);
        case 'RB': return new Set(['RB']);
        case 'WR': return new Set(['WR']);
        case 'TE': return new Set(['TE']);
        case 'K': case 'PK': return new Set(['K']);
        case 'DEF': case 'DST': case 'D/ST': return new Set(['DEF']);
        case 'FLEX': case 'W/R/T': case 'WRT': case 'W_R_T': case 'W-R-T': return new Set(FLEX_RBWRTE);
        case 'WR/RB': case 'RB/WR': case 'W/R': case 'W-R': case 'WRRB_FLEX': return new Set(FLEX_WRRB);
        case 'WR/TE': case 'REC_FLEX': case 'W/T': case 'W-T': return new Set(FLEX_WRTE);
        case 'SUPER_FLEX': case 'SUPERFLEX': case 'SF': case 'Q': case 'Q/W/R/T': case 'W-R-T-Q': case 'QB/RB/WR/TE': return new Set(SUPERFLEX);
        case 'BN': case 'BE': case 'IR': case 'TAXI': case 'NA': return null; // non-starting
        default: return null; // unknown → treat as non-starting (safe)
    }
}

/** Build the ordered starting-slot list from a roster_positions array. */
export function buildSlots(rosterPositions: string[] | null | undefined): LineupSlot[] {
    if (!rosterPositions) return [];
    const slots: LineupSlot[] = [];
    for (const token of rosterPositions) {
        const eligible = slotEligibility(token);
        if (eligible) slots.push({ slot: token.toUpperCase(), eligible });
    }
    return slots;
}

// ── Core optimization ──────────────────────────────────────────────────────

/** Comparison: is A strictly better than B for a slot? Rank first (lower better),
 *  then total (higher), then posMatchup (higher = easier). Unranked sorts last. */
function betterThan(a: OptimizerPlayer, b: OptimizerPlayer): boolean {
    const ar = a.rank ?? Number.POSITIVE_INFINITY;
    const br = b.rank ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar < br;
    const at = a.total ?? -1, bt = b.total ?? -1;
    if (at !== bt) return at > bt;
    const am = a.posMatchup ?? -1, bm = b.posMatchup ?? -1;
    return am > bm;
}

/** Sort players best→worst for a given slot's eligible set. */
function candidatesFor(slot: LineupSlot, pool: OptimizerPlayer[]): OptimizerPlayer[] {
    return pool
        .filter(p => p.position != null && slot.eligible.has(p.position))
        .sort((a, b) => (betterThan(a, b) ? -1 : betterThan(b, a) ? 1 : 0));
}

/**
 * Compute the optimal legal lineup. Fills the MOST RESTRICTIVE slots first
 * (fewest eligible positions), so a scarce position (e.g. QB) isn't greedily
 * consumed by a superflex slot while a dedicated QB slot goes unfilled.
 */
export function optimizeLineup(players: OptimizerPlayer[], slots: LineupSlot[]): AssignedSlot[] {
    // Order slots by restrictiveness (eligible-set size asc), stable within ties.
    const order = slots
        .map((s, i) => ({ s, i }))
        .sort((a, b) => (a.s.eligible.size - b.s.eligible.size) || (a.i - b.i));

    const used = new Set<string>();
    const assignment = new Map<number, OptimizerPlayer | null>(); // original slot index → player

    // Locked players whose game already started are immovable this week:
    //  - a locked STARTER keeps a slot (can't be benched) → reserve one for them;
    //  - a locked BENCH player can't be moved into the lineup → exclude from pool.
    const lockedStarters = players.filter(p => p.locked && p.isStarter);
    // Pool of players the optimizer may freely assign (everyone not locked).
    const movablePool = players.filter(p => !p.locked);

    // 1. Reserve slots for locked starters first, most-restrictive slot first, so
    //    a locked QB claims a QB slot before a SUPER_FLEX. Each locked starter
    //    takes the most restrictive slot it's eligible for that is still open.
    const takenSlotIdx = new Set<number>();
    for (const lp of lockedStarters) {
        if (lp.position == null) continue;
        // Find the most restrictive open slot this locked starter is eligible for.
        const slotForLp = order.find(({ s, i }) =>
            !takenSlotIdx.has(i) && s.eligible.has(lp.position as Position),
        );
        if (slotForLp) {
            takenSlotIdx.add(slotForLp.i);
            assignment.set(slotForLp.i, lp);
            used.add(lp.sleeper_id);
        }
        // If no eligible slot is open, the locked starter can't be placed (rare:
        // illegal current lineup); they simply aren't reflected as a slot holder,
        // but they're still excluded from the movable pool so we never bench them.
    }

    // 2. Fill remaining slots from the movable pool (not-locked players only).
    for (const { s, i } of order) {
        if (takenSlotIdx.has(i)) continue; // reserved for a locked starter
        const cands = candidatesFor(s, movablePool).filter(p => !used.has(p.sleeper_id));
        const pick = cands[0] || null;
        if (pick) used.add(pick.sleeper_id);
        assignment.set(i, pick);
    }

    // Return in the ORIGINAL slot order for display.
    return slots.map((s, i) => ({ slot: s.slot, player: assignment.get(i) ?? null }));
}

/**
 * Full optimizer: optimal lineup + the swaps vs the current starters.
 * A swap surfaces when an optimal starter is NOT currently started.
 */
export function optimizeAndDiff(players: OptimizerPlayer[], slots: LineupSlot[]): OptimizerResult {
    const optimal = optimizeLineup(players, slots);
    const optimalIds = new Set(optimal.map(a => a.player?.sleeper_id).filter(Boolean) as string[]);
    const currentStarterIds = new Set(players.filter(p => p.isStarter).map(p => p.sleeper_id));

    // Players who SHOULD start but currently don't. A LOCKED player is never a
    // valid "should start" — their game already began, so we can't add them.
    const shouldStart = optimal
        .filter(a => a.player && !a.player.locked && !currentStarterIds.has(a.player.sleeper_id))
        .map(a => ({ slot: a.slot, player: a.player as OptimizerPlayer }));

    // Players currently starting who are NOT in the optimal lineup (bench
    // candidates). A LOCKED starter is never benched — their game already began,
    // so benching does nothing (points are locked in).
    const shouldBench = players.filter(p => p.isStarter && !p.locked && !optimalIds.has(p.sleeper_id));

    // Pair each "should start" with a "should bench" of the SAME slot eligibility
    // where possible; fall back to worst-ranked bench candidate.
    const swaps: LineupSwap[] = [];
    const benchPool = [...shouldBench];
    for (const ss of shouldStart) {
        const slotDef = slots.find(s => s.slot === ss.slot);
        // Prefer a currently-started player who is eligible for this same slot.
        let bIdx = benchPool.findIndex(b => b.position != null && slotDef?.eligible.has(b.position));
        if (bIdx === -1) bIdx = benchPool.length > 0 ? 0 : -1;
        const benchPlayer = bIdx >= 0 ? benchPool.splice(bIdx, 1)[0] : null;
        const rankGain = benchPlayer && benchPlayer.rank != null && ss.player.rank != null
            ? benchPlayer.rank - ss.player.rank
            : null;
        swaps.push({ startPlayer: ss.player, benchPlayer, slot: ss.slot, rankGain });
    }

    // Sort swaps by biggest rank upgrade first.
    swaps.sort((a, b) => (b.rankGain ?? 0) - (a.rankGain ?? 0));

    return { optimal, swaps, isOptimal: swaps.length === 0 };
}
