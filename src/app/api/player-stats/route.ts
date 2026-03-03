import { db } from "@/db";
import { players, weeklyPlayerStats } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sleeperId = searchParams.get("sleeperId");

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
      message: "No NFL stats available for this player"
    });
  }

  // Get 2024 weekly stats
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
      air_yards: weeklyPlayerStats.air_yards,
      routes_run: weeklyPlayerStats.routes_run,
      red_zone_targets: weeklyPlayerStats.red_zone_targets,
    })
    .from(weeklyPlayerStats)
    .where(
      and(
        eq(weeklyPlayerStats.gsis_id, player[0].gsis_id),
        eq(weeklyPlayerStats.season, 2024)
      )
    )
    .orderBy(weeklyPlayerStats.week);

  return NextResponse.json({
    player: player[0],
    stats,
  });
}
