import { NextRequest, NextResponse } from "next/server";
import {
    getOpportunityLeaderboard,
    getLatestStatSeason,
    getAvailableStatWeeks,
    type StatsPositionGroup,
    type StatsMetric,
} from "@/lib/stats-queries";

export const dynamic = "force-dynamic";

const POSITIONS: StatsPositionGroup[] = ["FLEX", "RB", "WR", "TE", "QB"];
const METRICS: StatsMetric[] = [
    "opportunities", "targets", "carries", "receptions",
    "receiving_yards", "rushing_yards", "passing_yards", "passing_attempts",
    "target_share", "air_yards_share", "wopr", "fantasy_points_ppr",
];

/**
 * GET /api/stats/opportunities
 * Query params:
 *   season?  number   (default: latest season with stats)
 *   week?    number | 'cumulative'   (default: latest available week)
 *   position? FLEX|RB|WR|TE|QB       (default: FLEX)
 *   metric?  <one of METRICS>        (default: opportunities)
 *   limit?   number                  (default: 100)
 *
 * League-agnostic, NFL-wide opportunity/production leaderboard.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;

        const season = sp.get("season") ? Number(sp.get("season")) : await getLatestStatSeason();
        if (season == null) {
            return NextResponse.json({ error: "No player stats have been ingested yet." }, { status: 400 });
        }

        const weeks = await getAvailableStatWeeks(season);
        if (weeks.length === 0) {
            return NextResponse.json({ error: `No stats for the ${season} season yet.` }, { status: 400 });
        }

        const weekParam = sp.get("week");
        const week: number | "cumulative" =
            weekParam === "cumulative" ? "cumulative"
                : weekParam != null && Number.isFinite(Number(weekParam)) ? Number(weekParam)
                    : weeks[weeks.length - 1]; // default: latest available week

        const positionParam = (sp.get("position") || "FLEX").toUpperCase() as StatsPositionGroup;
        const position = POSITIONS.includes(positionParam) ? positionParam : "FLEX";

        const metricParam = (sp.get("metric") || "opportunities") as StatsMetric;
        const metric = METRICS.includes(metricParam) ? metricParam : "opportunities";

        const limit = sp.get("limit") ? Number(sp.get("limit")) : 100;

        const result = await getOpportunityLeaderboard({ season, week, position, metric, limit });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[stats/opportunities] error", err);
        return NextResponse.json({ error: "Failed to load opportunity leaderboard" }, { status: 500 });
    }
}
