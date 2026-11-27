/**
 * Replace-on-upload for VFF rankings (pure, no I/O).
 *
 * A rankings upload (1qb / sf / redraft / ros) is a full snapshot: a player who
 * had a rank before but is NOT in the new file is unranked now (injured, dropped,
 * cut). Without this, old ranks linger forever — e.g. a player injured in
 * September still showed an ROS rank in November.
 *
 * Guards stop a wrong or truncated file from wiping real ranks: clearing is
 * skipped (updates from the file still apply) when the file barely matched, or
 * when it covers far fewer players than were previously ranked.
 */

export type RankingsCategory = '1qb' | 'sf' | 'redraft' | 'ros';

/** Clearing needs at least this % of the file's rows to have matched a player. */
export const CLEAR_MIN_MATCH_RATE_PCT = 50;
/** Clearing needs the file to match at least this % of the previously ranked count. */
export const CLEAR_MIN_COVERAGE_PCT = 50;

export interface ClearPlanInput {
    /** sleeper_ids with a rank in this category BEFORE the upload. */
    previouslyRanked: string[];
    /** sleeper_ids matched to a row in the uploaded file. */
    matched: Set<string>;
    /** Total data rows in the file. */
    totalRows: number;
    /** Rows that matched a player (may exceed matched.size if a player repeats). */
    matchedCount: number;
}

export interface ClearPlan {
    toClear: string[];
    /** Why clearing was skipped, or null when it ran (even if nothing needed clearing). */
    skippedReason: string | null;
}

export function planClear(input: ClearPlanInput): ClearPlan {
    const { previouslyRanked, matched, totalRows, matchedCount } = input;
    const previous = [...new Set(previouslyRanked)];
    if (previous.length === 0) return { toClear: [], skippedReason: null };

    if (matchedCount === 0 || matched.size === 0) {
        return { toClear: [], skippedReason: 'Not cleared: no rows matched a player (check the file and column names).' };
    }
    const matchRate = totalRows > 0 ? (matchedCount / totalRows) * 100 : 0;
    if (matchRate < CLEAR_MIN_MATCH_RATE_PCT) {
        return {
            toClear: [],
            skippedReason: `Not cleared: match rate ${Math.round(matchRate)}% is below ${CLEAR_MIN_MATCH_RATE_PCT}%.`,
        };
    }
    const coverage = (matched.size / previous.length) * 100;
    if (coverage < CLEAR_MIN_COVERAGE_PCT) {
        return {
            toClear: [],
            skippedReason: `Not cleared: this file matched ${matched.size} players but ${previous.length} were previously ranked (${Math.round(coverage)}%, minimum ${CLEAR_MIN_COVERAGE_PCT}%). Looks like a partial file.`,
        };
    }
    return { toClear: previous.filter(id => !matched.has(id)), skippedReason: null };
}

/**
 * The `player_values` columns to null out for a category. Column names match
 * `src/db/schema.ts#playerValues`. Never includes FantasyCalc (fc_*) columns.
 */
export function clearFieldsFor(category: RankingsCategory): Record<string, null> {
    switch (category) {
        case '1qb':
            return { rank_1qb_overall: null, rank_1qb_pos: null, rank_1qb_tier: null, rank_1qb_updated_at: null };
        case 'sf':
            return { rank_sf_overall: null, rank_sf_pos: null, rank_sf_tier: null, rank_sf_updated_at: null };
        case 'redraft':
            return {
                redraft_rank_overall: null, redraft_rank_pos: null, redraft_rank_tier: null,
                redraft_auction_value: null, redraft_rank_updated_at: null,
            };
        case 'ros':
            return {
                rank_ros_overall: null, rank_ros_pos: null, rank_ros_tier: null,
                rank_ros_ppg: null, ros_sos: null, ros_next4_sos: null, bye_week: null,
                rank_ros_updated_at: null,
            };
        default:
            throw new Error(`Unknown rankings category: ${String(category)}`);
    }
}
