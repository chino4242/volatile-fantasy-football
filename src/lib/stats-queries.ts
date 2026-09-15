/**
 * Statistics section — query layer over `weekly_player_stats`.
 *
 * This is the first consumer of the per-week stats table. It powers a
 * league-agnostic, NFL-wide opportunity/production leaderboard. Two time modes:
 *   - single week  (`week: <n>`)
 *   - cumulative   (`week: 'cumulative'` → sum/aggregate across all played weeks
 *                   of the season)
 *
 * Rows are joined to `players` (by gsis_id) for name/position/team. Only
 * fantasy-relevant players have a gsis_id in `players`, so the leaderboard is
 * naturally scoped to fantasy-relevant skill players — which is what we want.
 *
 * IMPORTANT — only columns the ingester actually populates are exposed as
 * sortable metrics. snaps / routes_run / air_yards / red_zone_targets /
 * inside_five_rushes / expected_fantasy_points are NOT populated by nflreadpy
 * and are deliberately omitted.
 */

import { db } from '@/db';
import { sql } from 'drizzle-orm';

/** Position groups the leaderboard understands. FLEX = RB+WR+TE. */
export type StatsPositionGroup = 'FLEX' | 'RB' | 'WR' | 'TE' | 'QB';

/** Sortable metrics. `opportunities` is the headline volume metric:
 *  targets + carries for skill players (QBs also add pass attempts). */
export type StatsMetric =
    | 'opportunities'
    | 'targets'
    | 'carries'
    | 'receptions'
    | 'receiving_yards'
    | 'rushing_yards'
    | 'passing_yards'
    | 'passing_attempts'
    | 'target_share'
    | 'air_yards_share'
    | 'wopr'
    | 'fantasy_points_ppr';

export interface OpportunityRow {
    gsis_id: string;
    name: string;
    position: string;
    team: string | null;
    games: number;              // weeks with a row (1 for single-week)
    opportunities: number;      // targets + carries (+ pass attempts for QB)
    targets: number;
    carries: number;
    receptions: number;
    receiving_yards: number;
    rushing_yards: number;
    passing_yards: number;
    passing_attempts: number;
    target_share: number | null;    // averaged across weeks in cumulative mode
    air_yards_share: number | null; // averaged
    wopr: number | null;            // averaged
    fantasy_points_ppr: number;     // summed
}

export interface OpportunityQuery {
    season: number;
    /** A week number, or 'cumulative' to aggregate the whole season. */
    week: number | 'cumulative';
    position: StatsPositionGroup;
    metric: StatsMetric;
    /** NFL team abbreviation to filter to (player's current team), or null for all. */
    team?: string | null;
    limit?: number;
}

export interface OpportunityResult {
    season: number;
    week: number | 'cumulative';
    /** Weeks actually present in the data for this season (for the picker). */
    availableWeeks: number[];
    position: StatsPositionGroup;
    metric: StatsMetric;
    team: string | null;
    rows: OpportunityRow[];
}

const POSITION_FILTER: Record<StatsPositionGroup, string[]> = {
    FLEX: ['RB', 'WR', 'TE'],
    RB: ['RB'],
    WR: ['WR'],
    TE: ['TE'],
    QB: ['QB'],
};

/** The weeks that have any stats rows for a season (ascending). */
export async function getAvailableStatWeeks(season: number): Promise<number[]> {
    const res = await db.execute(sql`
        SELECT DISTINCT week FROM weekly_player_stats
        WHERE season = ${season} ORDER BY week ASC`);
    const rows = (res as unknown as { rows?: { week: number }[] }).rows ?? (res as unknown as { week: number }[]);
    return rows.map(r => Number(r.week)).filter(Number.isFinite);
}

/** The most recent season that has any stats, or null. */
export async function getLatestStatSeason(): Promise<number | null> {
    const res = await db.execute(sql`
        SELECT MAX(season) AS season FROM weekly_player_stats`);
    const rows = (res as unknown as { rows?: { season: number | null }[] }).rows ?? (res as unknown as { season: number | null }[]);
    const s = rows[0]?.season;
    return s == null ? null : Number(s);
}

/**
 * NFL team abbreviations that have at least one fantasy-relevant player with
 * stats this season (for the team dropdown). Sorted alphabetically.
 */
export async function getAvailableTeams(season: number): Promise<string[]> {
    const res = await db.execute(sql`
        SELECT DISTINCT p.team AS team
        FROM weekly_player_stats w
        JOIN players p ON p.gsis_id = w.gsis_id
        WHERE w.season = ${season} AND p.team IS NOT NULL AND p.team <> ''
        ORDER BY p.team ASC`);
    const rows = (res as unknown as { rows?: { team: string | null }[] }).rows ?? (res as unknown as { team: string | null }[]);
    return rows.map(r => r.team).filter((t): t is string => !!t);
}

/** SQL expression that maps a metric name to its aggregate expression. */
function metricOrderExpr(metric: StatsMetric): ReturnType<typeof sql> {
    switch (metric) {
        case 'opportunities': return sql`opportunities`;
        case 'targets': return sql`targets`;
        case 'carries': return sql`carries`;
        case 'receptions': return sql`receptions`;
        case 'receiving_yards': return sql`receiving_yards`;
        case 'rushing_yards': return sql`rushing_yards`;
        case 'passing_yards': return sql`passing_yards`;
        case 'passing_attempts': return sql`passing_attempts`;
        case 'target_share': return sql`target_share`;
        case 'air_yards_share': return sql`air_yards_share`;
        case 'wopr': return sql`wopr`;
        case 'fantasy_points_ppr': return sql`fantasy_points_ppr`;
    }
}

/**
 * Opportunity/production leaderboard. Aggregates per player across the selected
 * time window (single week or whole season), joins names/positions, sorts by the
 * requested metric desc, and returns the top `limit` rows.
 */
export async function getOpportunityLeaderboard(q: OpportunityQuery): Promise<OpportunityResult> {
    const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
    const positions = POSITION_FILTER[q.position];
    const availableWeeks = await getAvailableStatWeeks(q.season);

    // Week filter fragment: one week, or all weeks (cumulative).
    const weekFilter = q.week === 'cumulative'
        ? sql`w.season = ${q.season}`
        : sql`w.season = ${q.season} AND w.week = ${q.week}`;

    // Optional team filter (player's current team).
    const team = q.team && q.team.trim() ? q.team.trim().toUpperCase() : null;
    const teamFilter = team ? sql` AND UPPER(p.team) = ${team}` : sql``;

    const orderExpr = metricOrderExpr(q.metric);

    // Volume stats (targets/carries/receptions/yards/attempts/ppr) are SUMMED
    // across weeks. Rate stats (shares, wopr) are AVERAGED. In single-week mode
    // both reduce to the single value. `opportunities` = targets + carries +
    // (pass attempts, which are ~0 for non-QBs).
    const res = await db.execute(sql`
        SELECT
            w.gsis_id                                   AS gsis_id,
            p.full_name                                 AS name,
            p.position                                  AS position,
            p.team                                      AS team,
            COUNT(*)                                    AS games,
            COALESCE(SUM(w.targets), 0)
              + COALESCE(SUM(w.carries), 0)
              + COALESCE(SUM(w.attempts), 0)            AS opportunities,
            COALESCE(SUM(w.targets), 0)                 AS targets,
            COALESCE(SUM(w.carries), 0)                 AS carries,
            COALESCE(SUM(w.receptions), 0)              AS receptions,
            COALESCE(SUM(w.receiving_yards), 0)         AS receiving_yards,
            COALESCE(SUM(w.rushing_yards), 0)           AS rushing_yards,
            COALESCE(SUM(w.passing_yards), 0)           AS passing_yards,
            COALESCE(SUM(w.attempts), 0)                AS passing_attempts,
            AVG(w.target_share)                         AS target_share,
            AVG(w.air_yards_share)                      AS air_yards_share,
            AVG(w.wopr)                                 AS wopr,
            COALESCE(SUM(w.fantasy_points_ppr), 0)      AS fantasy_points_ppr
        FROM weekly_player_stats w
        JOIN players p ON p.gsis_id = w.gsis_id
        WHERE ${weekFilter}
          AND p.position IN (${sql.join(positions.map(pos => sql`${pos}`), sql`, `)})${teamFilter}
        GROUP BY w.gsis_id, p.full_name, p.position, p.team
        ORDER BY ${orderExpr} DESC NULLS LAST
        LIMIT ${limit}`);

    const raw = (res as unknown as { rows?: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[]);

    const num = (v: unknown): number => (v == null ? 0 : Number(v));
    const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

    const rows: OpportunityRow[] = raw.map(r => ({
        gsis_id: String(r.gsis_id),
        name: String(r.name),
        position: String(r.position),
        team: r.team == null ? null : String(r.team),
        games: num(r.games),
        opportunities: num(r.opportunities),
        targets: num(r.targets),
        carries: num(r.carries),
        receptions: num(r.receptions),
        receiving_yards: num(r.receiving_yards),
        rushing_yards: num(r.rushing_yards),
        passing_yards: num(r.passing_yards),
        passing_attempts: num(r.passing_attempts),
        target_share: numOrNull(r.target_share),
        air_yards_share: numOrNull(r.air_yards_share),
        wopr: numOrNull(r.wopr),
        fantasy_points_ppr: num(r.fantasy_points_ppr),
    }));

    return {
        season: q.season,
        week: q.week,
        availableWeeks,
        position: q.position,
        metric: q.metric,
        team,
        rows,
    };
}
