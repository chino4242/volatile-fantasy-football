/**
 * Value-based waiver recommender (pure, no I/O).
 *
 * The weekly-lineup engine (waiver-upgrades.ts) only surfaces free agents with a
 * top-~100 THIS-WEEK rank — which is almost always empty in deep dynasty leagues
 * where the good weekly plays are rostered. This engine answers the question that
 * actually drives waiver/drop decisions there: "of everyone AVAILABLE, whose
 * rest-of-season / dynasty VALUE beats a droppable player on my roster — and who
 * do I drop for him?"
 *
 * Value lens (composite "player score", higher = better):
 *   - PRIMARY: rest-of-season value (ROS overall rank → score; PPG as a nudge).
 *   - dynasty/market value (fc_value), normalized, blended in.
 *   - weekly rank: a small BONUS when the player is also a strong play this week
 *     (a factor, not the decider — matches how dynasty managers actually think).
 * Positional need scales an add up when you're thin at its slot.
 *
 * Each recommended add is paired with the best GUARDED drop: the lowest
 * keep-value legal (surplus) roster player, classified safe / caution / block via
 * the shared blendedKeepValue (so we never tell you to drop someone valuable).
 */

import {
    blendedKeepValue,
    rosKeepScore,
    marketKeepScore,
    KEEP_SCALE,
    type PortfolioPlayer,
} from './portfolio';
import {
    canonicalPos,
    wouldBreakLineup,
    countByPosition,
    type TxnPlayer,
    type RosterConfig,
} from './transaction-suggestions';

/** A roster/FA player enriched with the signals this engine reads. */
export interface WaiverValuePlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    rosRank: number | null;
    rosPosRank: number | null;
    rosPpg: number | null;
    rosSos: number | null;
    byeWeek: number | null;
    /** This week's start/sit rank (flex/qb pool). Optional bonus signal. */
    weeklyRank: number | null;
}

export type DropTier = 'safe' | 'caution' | 'block';

export interface WaiverValueRec {
    add: WaiverValuePlayer;
    drop: WaiverValuePlayer | null;   // null when there's an open roster spot
    type: 'add' | 'swap';
    tier: DropTier;                   // drop-side guardrail (safe for pure adds)
    /** Composite value the add brings (higher = better). */
    addScore: number;
    /** The drop's keep-value we'd surrender (0..1000; null for pure add). */
    dropKeepValue: number | null;
    /** add value − drop keep-value (the net gain that justified the swap). */
    gain: number;
    /** Short human reasons, e.g. ["ROS #46 RB20", "22% target share upside", "thin at RB"]. */
    reasons: string[];
    /** True when the add is a strong THIS-WEEK play too (weekly-rank bonus fired). */
    strongThisWeek: boolean;
}

const VALUED = new Set(['QB', 'RB', 'WR', 'TE']);

/**
 * Composite player score on the shared 0..1000 keep-scale, so adds and drops are
 * directly comparable. ROS is primary; market value blended (max of the two, like
 * the drop guardrail); a small weekly-rank bonus nudges strong current plays up.
 */
function playerScore(p: WaiverValuePlayer): { score: number; strongThisWeek: boolean } {
    const ros = rosKeepScore(p as unknown as PortfolioPlayer);
    const mkt = marketKeepScore(p as unknown as PortfolioPlayer);
    let score = Math.max(ros ?? 0, mkt ?? 0);
    // Weekly bonus: a top-24 flex / top-12 QB play this week gets a small lift so,
    // among similar-value adds, the one who also helps NOW ranks higher. Capped so
    // it can't outweigh a real ROS/value edge.
    let strongThisWeek = false;
    if (p.weeklyRank != null) {
        const bonus = Math.max(0, 30 - p.weeklyRank); // rank 1 → +29, rank 30 → 0
        if (p.weeklyRank <= 24) strongThisWeek = true;
        score += bonus;
    }
    return { score, strongThisWeek };
}

/** PPG-aware reason bits for an add. */
function addReasons(p: WaiverValuePlayer, need: boolean): string[] {
    const r: string[] = [];
    if (p.rosRank != null) r.push(`ROS #${p.rosRank}${p.rosPosRank != null ? ` (${canonicalPos(p.position)}${p.rosPosRank})` : ''}`);
    if (p.rosPpg != null) r.push(`${p.rosPpg.toFixed(1)} ROS PPG`);
    if (p.weeklyRank != null && p.weeklyRank <= 24) r.push(`#${p.weeklyRank} play this week`);
    if (need) r.push(`thin at ${canonicalPos(p.position)}`);
    if (p.fc_value != null && r.length === 0) r.push(`value ${p.fc_value.toLocaleString()}`);
    return r;
}

function tierFor(keepValue: number | null): DropTier {
    if (keepValue == null) return 'safe';
    if (keepValue >= KEEP_SCALE.BLOCK) return 'block';
    if (keepValue >= KEEP_SCALE.CAUTION) return 'caution';
    return 'safe';
}

export interface WaiverValueOptions {
    /** Min add-score advantage over the drop to surface a swap (keep-scale points). */
    minGain?: number;
    /** Max recommendations to return. */
    limit?: number;
    /** True roster size when some players couldn't be matched (open-spot detection). */
    actualCoreCount?: number;
}

/**
 * Recommend value-based adds (each with a guarded drop) for one team.
 */
export function recommendWaiverValue(
    myPlayers: WaiverValuePlayer[],
    freeAgents: WaiverValuePlayer[],
    config: RosterConfig | null,
    options: WaiverValueOptions = {},
): WaiverValueRec[] {
    const minGain = options.minGain ?? 40; // ~ a caution-worthy edge
    const limit = options.limit ?? 20;

    const roster = myPlayers.filter(p => VALUED.has(canonicalPos(p.position)));
    const fas = freeAgents.filter(p => VALUED.has(canonicalPos(p.position)));
    if (fas.length === 0) return [];

    // Score everyone once.
    const scoreOf = new Map<string, number>();
    for (const p of [...roster, ...fas]) scoreOf.set(p.sleeper_id, playerScore(p).score);
    const keepOf = (p: WaiverValuePlayer) => blendedKeepValue(p as unknown as PortfolioPlayer);

    // Positional need: do I have fewer than my starting requirement at a position?
    const counts = config ? countByPosition(roster as unknown as TxnPlayer[]) : {};
    const needAt = (pos: string): boolean => {
        if (!config) return false;
        const need = config.startingSlots[canonicalPos(pos)] ?? 0;
        return (counts[canonicalPos(pos)] ?? 0) < need;
    };

    // Open core spot? (roster smaller than capacity → pure adds allowed)
    const rosterCount = Math.max(options.actualCoreCount ?? 0, roster.length);
    const openSpot = config ? rosterCount < config.coreCapacity : false;

    // Precompute the droppable roster players sorted by keep-value ascending
    // (worst-to-keep first), excluding those that would break the lineup.
    const droppable = roster
        .map(p => ({ p, keep: keepOf(p) ?? 0 }))
        .filter(({ p }) => !(config && wouldBreakLineup(p as unknown as TxnPlayer, counts, config)))
        .sort((a, b) => a.keep - b.keep);

    const recs: WaiverValueRec[] = [];
    const usedDrops = new Set<string>();

    // Consider FAs from best score down.
    const rankedFAs = [...fas].sort((a, b) => (scoreOf.get(b.sleeper_id) ?? 0) - (scoreOf.get(a.sleeper_id) ?? 0));

    for (const fa of rankedFAs) {
        if (recs.length >= limit) break;
        const addScore = scoreOf.get(fa.sleeper_id) ?? 0;
        const need = needAt(fa.position || '');
        const { strongThisWeek } = playerScore(fa);

        // Open spot → pure add, but only for a FA with REAL value (a ranked ROS
        // asset or a non-trivial market value) — not just any warm body.
        const hasRealValue = fa.rosRank != null || (fa.fc_value ?? 0) >= 500;
        if (openSpot && hasRealValue) {
            recs.push({
                add: fa, drop: null, type: 'add', tier: 'safe',
                addScore, dropKeepValue: null, gain: addScore,
                reasons: addReasons(fa, need), strongThisWeek,
            });
            continue;
        }

        // Otherwise find the best (lowest keep-value) legal drop not already used.
        const candidate = droppable.find(d => !usedDrops.has(d.p.sleeper_id));
        if (!candidate) continue;
        const gain = addScore - candidate.keep;
        // Surface when the add clearly beats the worst keepable body — OR when we're
        // positionally thin (need) and the add is a real ROS/value asset.
        const worthIt = gain >= minGain || (need && addScore >= KEEP_SCALE.CAUTION - 100);
        if (!worthIt) continue;

        usedDrops.add(candidate.p.sleeper_id);
        recs.push({
            add: fa, drop: candidate.p, type: 'swap', tier: tierFor(candidate.keep),
            addScore, dropKeepValue: candidate.keep, gain,
            reasons: addReasons(fa, need), strongThisWeek,
        });
    }

    // Best gains first.
    return recs.sort((a, b) => b.gain - a.gain).slice(0, limit);
}
