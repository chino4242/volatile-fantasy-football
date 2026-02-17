import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function verify() {
    const { db } = await import("../src/db");
    const { players, playerValues } = await import("../src/db/schema");
    const { sql, eq } = await import("drizzle-orm");

    console.log("--- Verifying DB Data ---");
    const count = await db.select({ count: sql`count(*)` }).from(players);
    console.log(`Total Players: ${count[0].count}`);

    const sample = await db.select().from(players).limit(3);
    console.log("Sample Players:", sample);

    const sampleValue = await db.select().from(playerValues).limit(1);
    console.log("Sample Value:", sampleValue);

    process.exit(0);
}

verify();
