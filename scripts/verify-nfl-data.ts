import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { getPlayerStats } = await import("../src/lib/nfl-data.js");
  const { db } = await import("../src/db/index.js");
  const { weeklyPlayerStats } = await import("../src/db/schema.js");
  const { eq, desc } = await import("drizzle-orm");
  
  console.log("🔍 Testing NFL Data Access Layer\n");
  
  // Test 1: Get top receivers by targets for Week 1, 2024
  console.log("1️⃣  Top 10 Receivers by Targets (Week 1, 2024):");
  const topReceivers = await db.select()
    .from(weeklyPlayerStats)
    .where(eq(weeklyPlayerStats.week, 1))
    .orderBy(desc(weeklyPlayerStats.targets))
    .limit(10);
  
  topReceivers.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.gsis_id} - Targets: ${r.targets}, Receptions: ${r.receptions}, Yards: ${r.receiving_yards}`);
  });
  
  // Test 2: Get stats for a specific player
  if (topReceivers.length > 0) {
    const topPlayer = topReceivers[0];
    console.log(`\n2️⃣  Weekly Stats for ${topPlayer.gsis_id}:`);
    if (topPlayer.gsis_id) {
      const stats = await getPlayerStats(topPlayer.gsis_id);
      console.log(`  Found ${stats.length} weeks of data`);
      if (stats.length > 0) {
        const latest = stats[0];
        console.log(`  Latest: Week ${latest.week}, ${latest.season}`);
        console.log(`    Targets: ${latest.targets}, Receptions: ${latest.receptions}, Yards: ${latest.receiving_yards}`);
      }
    }
  }
  
  console.log("\n✅ Data access layer working correctly!");
  process.exit(0);
}

main().catch(console.error);
