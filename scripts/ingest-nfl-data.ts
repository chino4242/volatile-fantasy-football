import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { importWeeklyData, importSeasonalRosters } = await import("@camfleety/nfl-data-js");
  const { db } = await import("../src/db/index.js");
  const { players, weeklyPlayerStats } = await import("../src/db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  // NOTE: Currently using 2024 data (most recent complete season available)
  // When 2025 data is published by nflverse, update to: const seasons = [2024, 2025];
  const seasons = [2024];
  console.log(`📊 Ingesting NFL data for seasons: ${seasons.join(", ")}`);

  // Step 1: Ingest Rosters (upsert into players table)
  console.log("\n1️⃣  Fetching rosters...");
  const rosters = await importSeasonalRosters(seasons);
  console.log(`✓ Loaded ${rosters.length} roster entries`);

  let playersUpserted = 0;
  for (const player of rosters) {
    if (!(player as any).gsis_id) continue;

    await db.insert(players)
      .values({
        sleeper_id: (player as any).sleeper_id || (player as any).gsis_id,
        gsis_id: (player as any).gsis_id,
        full_name: (player as any).player_name || `${(player as any).first_name || ""} ${(player as any).last_name || ""}`.trim(),
        first_name: (player as any).first_name,
        last_name: (player as any).last_name,
        position: (player as any).position,
        team: (player as any).recent_team,
        rookie_year: (player as any).rookie_year,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: players.gsis_id,
        set: {
          sleeper_id: (player as any).sleeper_id || (player as any).gsis_id,
          full_name: (player as any).player_name || `${(player as any).first_name || ""} ${(player as any).last_name || ""}`.trim(),
          first_name: (player as any).first_name,
          last_name: (player as any).last_name,
          position: (player as any).position,
          team: (player as any).recent_team,
          rookie_year: (player as any).rookie_year,
          updated_at: new Date(),
        },
      });

    playersUpserted++;
    if (playersUpserted % 100 === 0) {
      console.log(`  Upserted ${playersUpserted} players...`);
    }
  }
  console.log(`✅ Upserted ${playersUpserted} players`);

  // Step 2: Ingest Weekly Stats (upsert into weeklyPlayerStats)
  console.log("\n2️⃣  Fetching weekly stats...");
  const weeklyData = await importWeeklyData(seasons);
  console.log(`✓ Loaded ${weeklyData.length} player-week records`);

  let statsUpserted = 0;
  for (const stat of weeklyData) {
    if (!(stat as any).player_id) continue;

    await db.insert(weeklyPlayerStats)
      .values({
        gsis_id: (stat as any).player_id,
        season: (stat as any).season,
        week: (stat as any).week,
        targets: (stat as any).targets,
        air_yards: (stat as any).receiving_air_yards,
        routes_run: (stat as any).routes,
        snaps: (stat as any).offense_snaps,
        red_zone_targets: (stat as any).red_zone_targets,
        inside_five_rushes: (stat as any).inside_five_rushes,
        receptions: (stat as any).receptions,
        receiving_yards: (stat as any).receiving_yards,
        receiving_tds: (stat as any).receiving_tds,
        carries: (stat as any).carries,
        rushing_yards: (stat as any).rushing_yards,
        rushing_tds: (stat as any).rushing_tds,
        completions: (stat as any).completions,
        attempts: (stat as any).attempts,
        passing_yards: (stat as any).passing_yards,
        passing_tds: (stat as any).passing_tds,
        interceptions: (stat as any).interceptions,
        expected_fantasy_points: (stat as any).fantasy_points ? String((stat as any).fantasy_points) : null,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [weeklyPlayerStats.gsis_id, weeklyPlayerStats.season, weeklyPlayerStats.week],
        set: {
          targets: (stat as any).targets,
          air_yards: (stat as any).receiving_air_yards,
          routes_run: (stat as any).routes,
          snaps: (stat as any).offense_snaps,
          red_zone_targets: (stat as any).red_zone_targets,
          inside_five_rushes: (stat as any).inside_five_rushes,
          receptions: (stat as any).receptions,
          receiving_yards: (stat as any).receiving_yards,
          receiving_tds: (stat as any).receiving_tds,
          carries: (stat as any).carries,
          rushing_yards: (stat as any).rushing_yards,
          rushing_tds: (stat as any).rushing_tds,
          completions: (stat as any).completions,
          attempts: (stat as any).attempts,
          passing_yards: (stat as any).passing_yards,
          passing_tds: (stat as any).passing_tds,
          interceptions: (stat as any).interceptions,
          expected_fantasy_points: (stat as any).fantasy_points ? String((stat as any).fantasy_points) : null,
          updated_at: new Date(),
        },
      });

    statsUpserted++;
    if (statsUpserted % 500 === 0) {
      console.log(`  Upserted ${statsUpserted} stats...`);
    }
  }
  console.log(`✅ Upserted ${statsUpserted} weekly stats`);

  console.log("\n🎉 Ingestion complete!");
  process.exit(0);
}

main().catch(console.error);
