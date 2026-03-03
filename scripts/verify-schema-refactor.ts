import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function verifySchemaRefactor() {
  console.log("--- Verifying Schema Refactor ---\n");

  // Check if fantasy_leagues table exists
  const fantasyLeaguesCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'fantasy_leagues'
    );
  `);
  console.log("fantasy_leagues table exists:", (fantasyLeaguesCheck as any).rows[0].exists);

  // Check if weekly_roster_snapshots table exists
  const weeklySnapshotsCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'weekly_roster_snapshots'
    );
  `);
  console.log("weekly_roster_snapshots table exists:", (weeklySnapshotsCheck as any).rows[0].exists);

  // Get columns of weekly_roster_snapshots
  if ((weeklySnapshotsCheck as any).rows[0].exists) {
    const columns = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'weekly_roster_snapshots'
      ORDER BY ordinal_position;
    `);
    console.log("\nweekly_roster_snapshots columns:");
    console.log((columns as any).rows);

    // Check constraints
    const constraints = await db.execute(sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'weekly_roster_snapshots';
    `);
    console.log("\nweekly_roster_snapshots constraints:");
    console.log((constraints as any).rows);
  }

  await client.end();
}

verifySchemaRefactor().catch(console.error);
