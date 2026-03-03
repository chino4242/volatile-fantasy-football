import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/index.js");
  const { sql } = await import("drizzle-orm");
  
  console.log("📊 Creating v_receiver_opportunity view...");
  
  await db.execute(sql`
    CREATE OR REPLACE VIEW v_receiver_opportunity AS
    SELECT 
      wps.gsis_id,
      wps.season,
      wps.week,
      wps.targets,
      wps.air_yards,
      CASE 
        WHEN tt.total_targets > 0 
        THEN wps.targets::decimal / tt.total_targets 
        ELSE 0 
      END as target_share,
      CASE 
        WHEN tt.total_air_yards > 0 
        THEN wps.air_yards::decimal / tt.total_air_yards 
        ELSE 0 
      END as air_yard_share,
      CASE 
        WHEN tt.total_targets > 0 AND tt.total_air_yards > 0 
        THEN (1.5 * (wps.targets::decimal / tt.total_targets)) + 
             (0.7 * (wps.air_yards::decimal / tt.total_air_yards))
        ELSE 0 
      END as wopr
    FROM weekly_player_stats wps
    LEFT JOIN (
      SELECT 
        season,
        week,
        SUM(targets) as total_targets,
        SUM(air_yards) as total_air_yards
      FROM weekly_player_stats
      GROUP BY season, week
    ) tt ON tt.season = wps.season AND tt.week = wps.week
  `);
  
  console.log("✅ View created successfully!");
  process.exit(0);
}

main().catch(console.error);
