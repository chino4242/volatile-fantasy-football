import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { importWeeklyData } = await import("@camfleety/nfl-data-js");
  const { db } = await import("../src/db/index.js");
  const { players } = await import("../src/db/schema.js");
  const { eq } = await import("drizzle-orm");

  console.log("📊 Linking players to NFL stats via gsis_id...\n");

  // Fetch weekly data to get player_id (gsis_id) mappings
  const weeklyData = await importWeeklyData([2024]);
  console.log(`✓ Loaded ${weeklyData.length} weekly records`);

  // Extract unique player mappings
  const playerMap = new Map<string, string>(); // player_name -> gsis_id
  weeklyData.forEach((stat: any) => {
    if (stat.player_name && stat.player_id) {
      playerMap.set(stat.player_name.toLowerCase(), stat.player_id);
    }
  });

  console.log(`✓ Found ${playerMap.size} unique players in NFL data\n`);

  // Get all players from our database
  const allPlayers = await db.select().from(players);
  console.log(`✓ Found ${allPlayers.length} players in database\n`);

  let updated = 0;
  let notFound = 0;
  let alreadyHasGsis = 0;
  let duplicates = 0;

  for (const player of allPlayers) {
    // Skip if already has gsis_id
    if (player.gsis_id) {
      alreadyHasGsis++;
      continue;
    }

    // Try to match by name variations
    const namesToTry = [
      player.full_name?.toLowerCase(),
      `${player.first_name?.charAt(0)}.${player.last_name}`.toLowerCase(),
      `${player.first_name} ${player.last_name}`.toLowerCase(),
    ].filter(Boolean);

    let gsisId: string | undefined;
    for (const name of namesToTry) {
      if (playerMap.has(name)) {
        gsisId = playerMap.get(name);
        break;
      }
    }

    if (gsisId) {
      try {
        await db.update(players)
          .set({ 
            gsis_id: gsisId,
            updated_at: new Date()
          })
          .where(eq(players.sleeper_id, player.sleeper_id));
        
        updated++;
        if (updated % 50 === 0) {
          console.log(`  Updated ${updated} players...`);
        }
      } catch (error: any) {
        if (error.cause?.code === '23505') {
          // Duplicate key - this gsis_id is already assigned to another player
          duplicates++;
        } else {
          throw error;
        }
      }
    } else {
      notFound++;
    }
  }

  console.log(`\n✅ Update complete!`);
  console.log(`   Already had gsis_id: ${alreadyHasGsis}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Duplicates (skipped): ${duplicates}`);
  console.log(`   Not found in NFL data: ${notFound}`);
  console.log(`\n💡 ${updated} players now have NFL stats available!`);

  process.exit(0);
}

main().catch(console.error);
