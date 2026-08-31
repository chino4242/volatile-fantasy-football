/**
 * Suggested Transactions Engine (Phase 1 — dynasty value based)
 *
 * Platform-agnostic. Compares available free agents against a team's roster
 * and suggests pickups (with a drop if the roster is full) that improve the
 * team's total dynasty value.
 *
 * Rules:
 * - If the roster has an open core spot, suggest a pure ADD (no drop).
 * - If the roster is full, pair the pickup with the lowest-value drop candidate.
 * - Never drop the LAST player at a required starting position (e.g. your only
 *   DST or K), since you must be able to field a legal lineup.
 * - Only surface a suggestion when the free agent's value exceeds the drop
 *   candidate's value by at least `thresholdPct` (default 5%).
 * - Pure adds (open spot) surface whenever the free agent has meaningful value.
 *
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
 * FLEX-eligible positions can cover a FLEX requirement, but for Phase 1 we
 * only protect the LAST player at a hard required position.
 */
const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);

/**
 * Determine which of my players are "protected" from being dropped because they
 * are the last player I have at a required starting position.
 */
function computeProtectedIds(myPlayers: TxnPlayer[], config: RosterConfig): Set<string> {
    const protectedIds = new Set<string>();

    // Count players per position
    const byPosition = new Map<string, TxnPlayer[]>();
    for (const p of myPlayers) {
        const pos = p.position || 'UNK';
        if (!byPosition.has(pos)) byPosition.set(pos, []);
        byPosition.get(pos)!.push(p);
    }

    // For each required start position, if I have exactly one player there, protect them.
    for (const reqPos of config.requiredStartPositions) {
        // Normalize common aliases
        const positionsToCheck = reqPos === 'FLEX'
            ? [] // FLEX is covered by RB/WR/TE depth — don't protect a single flex player
            : [reqPos, ...positionAliases(reqPos)];

        for (const pos of positionsToCheck) {
            const playersAtPos = byPosition.get(pos) || [];
            if (playersAtPos.length === 1) {
                protectedIds.add(playersAtPos[0].sleeper_id);
            }
        }
    }

    return protectedIds;
}

function positionAliases(pos: string): string[] {
    if (pos === 'PK' || pos === 'K') return ['PK', 'K'];
    if (pos === 'DST' || pos === 'DEF' || pos === 'D') return ['DST', 'DEF', 'D'];
    return [];
}

/**
 * Find the best drop candidate: the lowest dynasty value player who is NOT protected.
 */
function findDropCandidate(myPlayers: TxnPlayer[], protectedIds: Set<string>): TxnPlayer | null {
    const droppable = myPlayers
        .filter(p => !protectedIds.has(p.sleeper_id))
        .filter(p => p.position !== 'PICK') // never drop picks via this tool
        .sort((a, b) => (a.fc_value || 0) - (b.fc_value || 0));
    return droppable[0] || null;
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

    const protectedIds = computeProtectedIds(corePlayers, config);

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

    // --- Swaps: for remaining FAs, pair with the best drop candidate ---
    // Recompute the drop candidate each time we conceptually add a player, but for
    // Phase 1 we keep it simple: compare each remaining FA against the current worst
    // droppable player. We show the top swap opportunities.
    const dropCandidate = findDropCandidate(corePlayers, protectedIds);

    if (dropCandidate) {
        const dropVal = dropCandidate.fc_value || 0;
        for (; faIdx < sortedFAs.length; faIdx++) {
            const fa = sortedFAs[faIdx];
            const faVal = fa.fc_value || 0;
            if (faVal <= 0) break;

            const gain = faVal - dropVal;
            const gainPct = dropVal > 0 ? (gain / dropVal) * 100 : (faVal > 0 ? Infinity : 0);

            // Only surface meaningful upgrades
            if (gainPct < thresholdPct) continue;

            suggestions.push({
                type: 'swap',
                addPlayer: fa,
                dropPlayer: dropCandidate,
                valueGain: gain,
                valueGainPct: gainPct === Infinity ? 100 : gainPct,
                reason: `Upgrade over ${dropCandidate.full_name} (+${gain.toLocaleString()} value, ${Math.round(gainPct)}%)`,
            });
        }
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

    // Required start positions = the non-bench, non-reserve, non-flex slots
    const requiredStartPositions = new Set<string>();
    for (const pos of rosterPositions) {
        if (pos === 'BN' || pos === 'IR' || pos === 'TAXI' || pos === 'BE' || pos === 'INJURED_RESERVE') continue;
        if (pos === 'FLEX' || pos === 'SUPER_FLEX' || pos === 'REC_FLEX' || pos === 'WRRB_FLEX' || pos === 'WRT') continue;
        requiredStartPositions.add(pos);
    }

    return { coreCapacity, requiredStartPositions };
}

/**
 * Build a RosterConfig from a starter-slot object (Fleaflicker shape).
 * `total` is the full roster size (starters + bench, excludes IR/reserve).
 * Required start positions are the hard positions with >= 1 starter slot.
 */
export function buildRosterConfigFromSlots(
    slots: { QB: number; RB: number; WR: number; TE: number; FLEX?: number; total?: number } | null | undefined,
): RosterConfig | null {
    if (!slots) return null;

    const requiredStartPositions = new Set<string>();
    if (slots.QB > 0) requiredStartPositions.add('QB');
    if (slots.RB > 0) requiredStartPositions.add('RB');
    if (slots.WR > 0) requiredStartPositions.add('WR');
    if (slots.TE > 0) requiredStartPositions.add('TE');
    // Note: FLEX is intentionally not a hard-protected position.

    // Core capacity: prefer explicit total, else estimate starters + a standard bench
    const starters = slots.QB + slots.RB + slots.WR + slots.TE + (slots.FLEX || 0);
    const coreCapacity = typeof slots.total === 'number' && slots.total > 0
        ? slots.total
        : starters + 6; // fallback bench estimate

    return { coreCapacity, requiredStartPositions };
}
