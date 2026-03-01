import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { importWeeklyData, importSeasonalRosters } = await import("@camfleety/nfl-data-js");
  const { db } = await import("../src/db/index.js");
  const { players, nflStats } = await import("../src/db/schema.js");
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
    const sleeperId = nameMap.get(stat.player_name?.toLowerCase());
    
    if (!sleeperId) {
      skipped++;
      continue;
    }
    
    matched++;
    
    // Check if already exists
    const existing = await db.select()
      .from(nflStats)
      .where(and(
        eq(nflStats.sleeper_id, sleeperId),
        eq(nflStats.season, stat.season),
        eq(nflStats.week, stat.week)
      ))
      .limit(1);
    
    const statData = {
      sleeper_id: sleeperId,
      season: stat.season,
      week: stat.week,
      completions: stat.completions || null,
      attempts: stat.attempts || null,
      passing_yards: stat.passing_yards || null,
      passing_tds: stat.passing_tds || null,
      interceptions: stat.interceptions || null,
      sacks: stat.sacks || null,
      sack_yards: stat.sack_yards || null,
      carries: stat.carries || null,
      rushing_yards: stat.rushing_yards || null,
      rushing_tds: stat.rushing_tds || null,
      targets: stat.targets || null,
      receptions: stat.receptions || null,
      receiving_yards: stat.receiving_yards || null,
      receiving_tds: stat.receiving_tds || null,
      target_share: stat.target_share ? String(stat.target_share) : null,
      air_yards_share: stat.air_yards_share ? String(stat.air_yards_share) : null,
      wopr: stat.wopr ? String(stat.wopr) : null,
      racr: stat.racr ? String(stat.racr) : null,
      fantasy_points: stat.fantasy_points ? String(stat.fantasy_points) : null,
      fantasy_points_ppr: stat.fantasy_points_ppr ? String(stat.fantasy_points_ppr) : null,
      updated_at: new Date(),
    };
    
    if (existing.length > 0) {
      await db.update(nflStats)
        .set(statData)
        .where(eq(nflStats.id, existing[0].id));
    } else {
      await db.insert(nflStats).values(statData);
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
