import { db } from "@/db";
import { players, weeklyPlayerStats } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sleeperId = searchParams.get("sleeperId");
  const season = parseInt(searchParams.get("season") || "2024");

  if (!sleeperId) {
    return NextResponse.json({ error: "sleeperId required" }, { status: 400 });
  }

  // Get player info
  const player = await db
    .select({
      sleeper_id: players.sleeper_id,
      gsis_id: players.gsis_id,
      full_name: players.full_name,
      position: players.position,
      team: players.team,
    })
    .from(players)
    .where(eq(players.sleeper_id, sleeperId))
    .limit(1);

  if (player.length === 0) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  // If no gsis_id, return player info with empty stats
  if (!player[0].gsis_id) {
    return NextResponse.json({
      player: player[0],
      stats: [],
      season,
      message: "No NFL stats available for this player"
    });
  }

  // Get weekly stats for selected season
  const stats = await db
    .select({
      week: weeklyPlayerStats.week,
      targets: weeklyPlayerStats.targets,
      receptions: weeklyPlayerStats.receptions,
      receiving_yards: weeklyPlayerStats.receiving_yards,
      receiving_tds: weeklyPlayerStats.receiving_tds,
      carries: weeklyPlayerStats.carries,
      rushing_yards: weeklyPlayerStats.rushing_yards,
      rushing_tds: weeklyPlayerStats.rushing_tds,
      completions: weeklyPlayerStats.completions,
      attempts: weeklyPlayerStats.attempts,
      passing_yards: weeklyPlayerStats.passing_yards,
      passing_tds: weeklyPlayerStats.passing_tds,
      interceptions: weeklyPlayerStats.interceptions,
      // Advanced metrics from nfl_data_py
      target_share: weeklyPlayerStats.target_share,
      air_yards_share: weeklyPlayerStats.air_yards_share,
      wopr: weeklyPlayerStats.wopr,
      racr: weeklyPlayerStats.racr,
      fantasy_points: weeklyPlayerStats.fantasy_points,
      fantasy_points_ppr: weeklyPlayerStats.fantasy_points_ppr,
    })
    .from(weeklyPlayerStats)
    .where(
      and(
        eq(weeklyPlayerStats.gsis_id, player[0].gsis_id),
        eq(weeklyPlayerStats.season, season)
      )
    )
    .orderBy(weeklyPlayerStats.week);

  return NextResponse.json({
    player: player[0],
    stats,
    season,
  });
}
