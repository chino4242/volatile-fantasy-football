import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { importWeeklyData, importSeasonalRosters } = await import("@camfleety/nfl-data-js");
  const { db } = await import("../src/db/index.js");
  const { players, weeklyPlayerStats } = await import("../src/db/schema.js");
  const { eq, and } = await import("drizzle-orm");
  
  const season = 2024;
  console.log(`📊 Fetching NFL stats for ${season} season...`);
  
  // Load weekly data
  const weeklyData = await importWeeklyData([season]);
  console.log(`✓ Loaded ${weeklyData.length} player-week records`);
  
  // Load rosters for player ID mappings
  const rosters = await importSeasonalRosters([season]);
  console.log(`✓ Loaded ${rosters.length} roster entries`);
  
  // Create mapping from various IDs to sleeper_id
  const idMap = new Map<string, string>();
  rosters.forEach((p: any) => {
    if (p.sleeper_id) {
      if (p.gsis_id) idMap.set(p.gsis_id, p.sleeper_id);
      if (p.espn_id) idMap.set(String(p.espn_id), p.sleeper_id);
      if (p.yahoo_id) idMap.set(String(p.yahoo_id), p.sleeper_id);
    }
  });
  
  // Get all our players with their names
  const ourPlayers = await db.select({ 
    sleeper_id: players.sleeper_id,
    full_name: players.full_name,
    first_name: players.first_name,
    last_name: players.last_name
  }).from(players);
  
  // Create name-based lookup
  const nameMap = new Map<string, string>();
  ourPlayers.forEach(p => {
    if (p.full_name) {
      nameMap.set(p.full_name.toLowerCase(), p.sleeper_id);
    }
    if (p.first_name && p.last_name) {
      const shortName = `${p.first_name.charAt(0)}.${p.last_name}`.toLowerCase();
      nameMap.set(shortName, p.sleeper_id);
    }
  });
  
  console.log(`✓ Mapped ${nameMap.size} player names`);
  
  let imported = 0;
  let skipped = 0;
  let matched = 0;
  
  for (const stat of weeklyData) {
    // Try to match by player_name (e.g., "A.Rodgers")
    const sleeperId = nameMap.get((stat as any).player_name?.toLowerCase());
    
    if (!sleeperId) {
      skipped++;
      continue;
    }
    
    matched++;
    
    // Check if already exists
    const existing = await db.select()
      .from(weeklyPlayerStats)
      .where(and(
        eq(weeklyPlayerStats.gsis_id, (stat as any).player_id),
        eq(weeklyPlayerStats.season, (stat as any).season),
        eq(weeklyPlayerStats.week, (stat as any).week)
      ))
      .limit(1);
    
    const statData = {
      gsis_id: (stat as any).player_id,
      season: (stat as any).season,
      week: (stat as any).week,
      completions: (stat as any).completions || null,
      attempts: (stat as any).attempts || null,
      passing_yards: (stat as any).passing_yards || null,
      passing_tds: (stat as any).passing_tds || null,
      interceptions: (stat as any).interceptions || null,
      carries: (stat as any).carries || null,
      rushing_yards: (stat as any).rushing_yards || null,
      rushing_tds: (stat as any).rushing_tds || null,
      targets: (stat as any).targets || null,
      receptions: (stat as any).receptions || null,
      receiving_yards: (stat as any).receiving_yards || null,
      receiving_tds: (stat as any).receiving_tds || null,
      air_yards: (stat as any).receiving_air_yards || null,
      routes_run: (stat as any).routes || null,
      red_zone_targets: (stat as any).red_zone_targets || null,
      expected_fantasy_points: (stat as any).fantasy_points ? String((stat as any).fantasy_points) : null,
      updated_at: new Date(),
    };
    
    if (existing.length > 0) {
      await db.update(weeklyPlayerStats)
        .set(statData)
        .where(eq(weeklyPlayerStats.id, existing[0].id));
    } else {
      await db.insert(weeklyPlayerStats).values(statData);
    }
    
    imported++;
    
    if (imported % 100 === 0) {
      console.log(`  Processed ${imported} stats...`);
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Imported: ${imported}`);
  console.log(`   Skipped: ${skipped}`);
  
  process.exit(0);
}

main().catch(console.error);
