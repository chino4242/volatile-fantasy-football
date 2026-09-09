/**
 * Suggested Transactions Engine (Phase 1 — dynasty value based)
 *
 * Platform-agnostic. Compares available free agents against a team's roster
 * and suggests pickups (with a drop if the roster is full) that improve the
 * team's total dynasty value.
 *
 * Rules:
 * - If the roster has an open core spot, suggest a pure ADD (no drop).
 * - If the roster is full, pair EACH pickup with its own best drop: a
 *   same-position upgrade, or a genuine cross-position SURPLUS body.
 * - Never drop below your starting requirement at ANY position — dedicated
 *   starter slots are a hard floor, and the RB/WR/TE (and QB, in superflex)
 *   pools must retain enough bodies to fill their flex/superflex slots too.
 * - Dedupe drop targets so the same player isn't suggested many times.
 * - Only surface a swap when the free agent's value exceeds the drop
 *   candidate's value by at least `thresholdPct` (default 5%).
 *
 * Value lens: dynasty `fc_value` for now. Rest-of-season/win-now is a planned
 * secondary factor (flagging "helps this season but weakens you long term").
 * IR/taxi awareness is intentionally out of scope for Phase 1.
 */

export interface TxnPlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
}

export interface RosterConfig {
    /** Total core roster capacity (starters + bench), EXCLUDING IR/taxi slots. */
    coreCapacity: number;
    /** Set of positions that must be startable each week (e.g. QB, RB, WR, TE, PK, DST). */
    requiredStartPositions: Set<string>;
    /**
     * Minimum number of players you must KEEP at each position to still field a
     * legal starting lineup — i.e. the count of dedicated starting slots for
     * that position (flex slots are tracked separately, not attributed here).
     * Normalized to canonical position keys (QB/RB/WR/TE/PK/DST). Missing key = 0.
     */
    startingSlots: Record<string, number>;
    /** Number of flex slots (RB/WR/TE-eligible) — extra bodies the RB/WR/TE pool must cover. */
    flexSlots: number;
    /** Number of superflex slots (QB/RB/WR/TE-eligible). */
    superFlexSlots: number;
}

export interface TransactionSuggestion {
    type: 'add' | 'swap';
    addPlayer: TxnPlayer;
    dropPlayer: TxnPlayer | null; // null for pure adds
    valueGain: number;            // absolute dynasty value gained
    valueGainPct: number;         // % gain relative to drop candidate (0 for pure adds)
    reason: string;
}

/**
 * Positions that count toward filling a required starting slot.
 * FLEX-eligible positions can cover a FLEX requirement.
 */
const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);
const SUPERFLEX_ELIGIBLE = new Set(['QB', 'RB', 'WR', 'TE']);

/** Normalize a raw position/token to a canonical key. */
export function canonicalPos(pos: string | null | undefined): string {
    const p = (pos || '').toUpperCase().trim();
    if (p === 'K') return 'PK';
    if (p === 'DEF' || p === 'D' || p === 'D/ST' || p === 'DST') return 'DST';
    return p;
}

/**
 * Would dropping `candidate` from my roster leave me unable to field a legal
 * lineup at its position (dedicated slots) or in a flex pool it's needed for?
 * This is the general "don't drop below your starting requirement anywhere" guard.
 */
function wouldBreakLineup(
    candidate: TxnPlayer,
    myCountsByPos: Record<string, number>,
    config: RosterConfig,
): boolean {
    const pos = canonicalPos(candidate.position);
    const slots = config.startingSlots;

    // 1. Dedicated-slot floor: never drop below the number of dedicated starters.
    const dedicated = slots[pos] ?? 0;
    if ((myCountsByPos[pos] ?? 0) - 1 < dedicated) return true;

    // 2. Flex pool floor (RB/WR/TE): the pool must retain its dedicated starters
    //    plus the flex slots.
    if (FLEX_ELIGIBLE.has(pos) && config.flexSlots > 0) {
        const poolFloor = (slots.RB ?? 0) + (slots.WR ?? 0) + (slots.TE ?? 0) + config.flexSlots;
        const poolCount = (myCountsByPos.RB ?? 0) + (myCountsByPos.WR ?? 0) + (myCountsByPos.TE ?? 0);
        if (poolCount - 1 < poolFloor) return true;
    }

    // 3. Superflex pool floor (QB/RB/WR/TE).
    if (SUPERFLEX_ELIGIBLE.has(pos) && config.superFlexSlots > 0) {
        const poolFloor = (slots.QB ?? 0) + (slots.RB ?? 0) + (slots.WR ?? 0) + (slots.TE ?? 0)
            + config.flexSlots + config.superFlexSlots;
        const poolCount = (myCountsByPos.QB ?? 0) + (myCountsByPos.RB ?? 0) + (myCountsByPos.WR ?? 0) + (myCountsByPos.TE ?? 0);
        if (poolCount - 1 < poolFloor) return true;
    }

    return false;
}

/** Count my players per canonical position (excluding picks). */
function countByPosition(players: TxnPlayer[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of players) {
        if (p.position === 'PICK') continue;
        const pos = canonicalPos(p.position);
        counts[pos] = (counts[pos] ?? 0) + 1;
    }
    return counts;
}


/**
 * Find the best drop candidate to pair with a specific incoming free agent.
 * Prefers a same-position upgrade drop when it's near the cheapest body,
 * otherwise the lowest-value legal (surplus) drop anywhere (cross-position OK).
 * Never returns a player whose drop would break the lineup.
 */
function findDropForAdd(
    add: TxnPlayer,
    myPlayers: TxnPlayer[],
    myCountsByPos: Record<string, number>,
    config: RosterConfig,
): TxnPlayer | null {
    const legalDroppable = myPlayers
        .filter(p => p.position !== 'PICK')
        .filter(p => !wouldBreakLineup(p, myCountsByPos, config))
        .sort((a, b) => (a.fc_value || 0) - (b.fc_value || 0));

    if (legalDroppable.length === 0) return null;

    const addPos = canonicalPos(add.position);
    const lowest = legalDroppable[0];

    // Prefer a same-position drop the add clearly upgrades.
    const samePos = legalDroppable.find(
        p => canonicalPos(p.position) === addPos && (add.fc_value || 0) > (p.fc_value || 0),
    );
    if (samePos) {
        if (samePos.sleeper_id === lowest.sleeper_id) return samePos;
        const sameVal = samePos.fc_value || 0;
        const lowVal = lowest.fc_value || 0;
        if (lowVal <= 0 || sameVal <= lowVal * 1.2) return samePos;
    }
    return lowest;
}

export interface SuggestionOptions {
    thresholdPct?: number;   // default 5 (%)
    minAddValue?: number;    // minimum FA value to consider (filters noise), default 0
    maxSuggestions?: number; // cap the list, default 25
    /**
     * Actual number of players on the core roster, if known independently of
     * the `myPlayers` list. Use this when some rostered players couldn't be
     * matched to the player DB (so myPlayers undercounts the true roster).
     * Falls back to counting non-pick players in `myPlayers`.
     */
    actualCoreCount?: number;
}

/**
 * Generate suggested transactions.
 */
export function generateTransactionSuggestions(
    myPlayers: TxnPlayer[],
    freeAgents: TxnPlayer[],
    config: RosterConfig,
    options: SuggestionOptions = {},
): TransactionSuggestion[] {
    const thresholdPct = options.thresholdPct ?? 5;
    const minAddValue = options.minAddValue ?? 0;
    const maxSuggestions = options.maxSuggestions ?? 25;

    // Real players only (exclude picks) for capacity counting
    const corePlayers = myPlayers.filter(p => p.position !== 'PICK');
    // Use the true roster count if provided (handles players that couldn't be
    // matched to the DB and are therefore missing from myPlayers).
    const effectiveCoreCount = Math.max(
        options.actualCoreCount ?? 0,
        corePlayers.length,
    );
    const openSpots = Math.max(0, config.coreCapacity - effectiveCoreCount);

    const myCountsByPos = countByPosition(corePlayers);

    // Sort free agents by value descending
    const sortedFAs = [...freeAgents]
        .filter(fa => (fa.fc_value || 0) >= minAddValue)
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    const suggestions: TransactionSuggestion[] = [];

    // --- Pure adds when open spots exist ---
    // We simulate filling open spots with the top FAs (they don't require a drop).
    let remainingOpenSpots = openSpots;
    let faIdx = 0;

    for (; faIdx < sortedFAs.length && remainingOpenSpots > 0; faIdx++) {
        const fa = sortedFAs[faIdx];
        const faVal = fa.fc_value || 0;
        if (faVal <= 0) break; // no value beyond this point
        suggestions.push({
            type: 'add',
            addPlayer: fa,
            dropPlayer: null,
            valueGain: faVal,
            valueGainPct: 0,
            reason: `Open roster spot — add for free (${faVal.toLocaleString()} value)`,
        });
        remainingOpenSpots--;
    }

    // --- Swaps: pair each remaining FA with the best sensible drop for THAT add ---
    // Each add gets its own drop (same-position upgrade or a genuine cross-position
    // surplus), respecting the "don't drop below your starting requirement" guard.
    // We dedupe so the same drop target isn't shown many times: once a drop has
    // been suggested a couple times we stop reusing it, keeping the list varied.
    const dropUseCount = new Map<string, number>();
    const MAX_REUSE_PER_DROP = 2;

    for (; faIdx < sortedFAs.length; faIdx++) {
        const fa = sortedFAs[faIdx];
        const faVal = fa.fc_value || 0;
        if (faVal <= 0) break;

        const drop = findDropForAdd(fa, corePlayers, myCountsByPos, config);
        if (!drop) continue; // nothing legal to drop → no swap

        const dropVal = drop.fc_value || 0;
        const gain = faVal - dropVal;
        const gainPct = dropVal > 0 ? (gain / dropVal) * 100 : (faVal > 0 ? Infinity : 0);

        // Only surface meaningful upgrades.
        if (gainPct < thresholdPct) continue;

        // Dedupe: don't spam the same drop target.
        const used = dropUseCount.get(drop.sleeper_id) ?? 0;
        if (used >= MAX_REUSE_PER_DROP) continue;
        dropUseCount.set(drop.sleeper_id, used + 1);

        const samePos = canonicalPos(drop.position) === canonicalPos(fa.position);
        suggestions.push({
            type: 'swap',
            addPlayer: fa,
            dropPlayer: drop,
            valueGain: gain,
            valueGainPct: gainPct === Infinity ? 100 : gainPct,
            reason: samePos
                ? `Upgrade at ${canonicalPos(fa.position)} over ${drop.full_name} (+${gain.toLocaleString()}, ${Math.round(gainPct)}%)`
                : `Add ${fa.full_name}; drop surplus ${drop.full_name} (${canonicalPos(drop.position)}) for +${gain.toLocaleString()} value`,
        });
    }

    // Sort: pure adds first (by value), then swaps by value gain
    suggestions.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'add' ? -1 : 1;
        return b.valueGain - a.valueGain;
    });

    return suggestions.slice(0, maxSuggestions);
}

/**
 * Parse a roster_positions array (from DB or platform API) into a RosterConfig.
 * Excludes IR/TAXI slots from core capacity.
 */
export function buildRosterConfig(rosterPositions: string[] | null | undefined): RosterConfig | null {
    if (!rosterPositions || rosterPositions.length === 0) return null;

    const nonReserve = rosterPositions.filter(
        pos => pos !== 'IR' && pos !== 'TAXI' && pos !== 'INJURED_RESERVE'
    );
    const coreCapacity = nonReserve.length;

    // Dedicated starting slots per canonical position, plus flex/superflex counts.
    const startingSlots: Record<string, number> = {};
    let flexSlots = 0;
    let superFlexSlots = 0;
    const requiredStartPositions = new Set<string>();

    for (const raw of rosterPositions) {
        const pos = raw.toUpperCase().trim();
        if (pos === 'BN' || pos === 'BE' || pos === 'IR' || pos === 'TAXI' || pos === 'INJURED_RESERVE') continue;
        if (pos === 'SUPER_FLEX' || pos === 'SUPERFLEX' || pos === 'SF' || pos === 'Q/W/R/T' || pos === 'QB/RB/WR/TE') {
            superFlexSlots++;
            continue;
        }
        if (pos === 'FLEX' || pos === 'W/R/T' || pos === 'WRT' || pos === 'WRRB_FLEX' || pos === 'REC_FLEX' || pos === 'WR/RB' || pos === 'RB/WR' || pos === 'WR/TE') {
            flexSlots++;
            continue;
        }
        const canon = canonicalPos(pos);
        startingSlots[canon] = (startingSlots[canon] ?? 0) + 1;
        requiredStartPositions.add(canon);
    }

    return { coreCapacity, requiredStartPositions, startingSlots, flexSlots, superFlexSlots };
}

/**
 * Build a RosterConfig from a starter-slot object (Fleaflicker shape).
 * `total` is the full roster size (starters + bench, excludes IR/reserve).
 * Required start positions are the hard positions with >= 1 starter slot.
 */
export function buildRosterConfigFromSlots(
    slots: { QB: number; RB: number; WR: number; TE: number; FLEX?: number; DST?: number; PK?: number; total?: number } | null | undefined,
): RosterConfig | null {
    if (!slots) return null;

    const startingSlots: Record<string, number> = {};
    const requiredStartPositions = new Set<string>();
    if (slots.QB > 0) { startingSlots.QB = slots.QB; requiredStartPositions.add('QB'); }
    if (slots.RB > 0) { startingSlots.RB = slots.RB; requiredStartPositions.add('RB'); }
    if (slots.WR > 0) { startingSlots.WR = slots.WR; requiredStartPositions.add('WR'); }
    if (slots.TE > 0) { startingSlots.TE = slots.TE; requiredStartPositions.add('TE'); }
    if ((slots.DST ?? 0) > 0) { startingSlots.DST = slots.DST!; requiredStartPositions.add('DST'); }
    if ((slots.PK ?? 0) > 0) { startingSlots.PK = slots.PK!; requiredStartPositions.add('PK'); }
    const flexSlots = slots.FLEX || 0;

    // Core capacity: prefer explicit total, else estimate starters + a standard bench
    const starters = slots.QB + slots.RB + slots.WR + slots.TE + flexSlots + (slots.DST ?? 0) + (slots.PK ?? 0);
    const coreCapacity = typeof slots.total === 'number' && slots.total > 0
        ? slots.total
        : starters + 6; // fallback bench estimate

    return { coreCapacity, requiredStartPositions, startingSlots, flexSlots, superFlexSlots: 0 };
}
