import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

console.log("DB URL:", process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@") : "UNDEFINED");

// Dynamic imports will be used inside the function

const FANTASY_CALC_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5";

export async function ingestPlayers() {
    console.log("--- Starting Player Ingestion ---");
    // Import DB after config
    const { db } = await import("../src/db");
    const { players, playerValues } = await import("../src/db/schema");
    const { sql } = await import("drizzle-orm");

    console.log(`Fetching data from: ${FANTASY_CALC_URL}`);

    try {
        const response = await fetch(FANTASY_CALC_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        const data = await response.json();
        console.log(`Fetched ${data.length} records. Processing...`);

        const playersBatch = [];
        const valuesBatch = [];
        let skippedCount = 0;

        for (const item of data) {
            const p = item.player;
            if (!p.sleeperId) {
                skippedCount++;
                continue;
            }

            playersBatch.push({
                sleeper_id: String(p.sleeperId),
                full_name: p.name,
                first_name: p.mflId ? p.name.split(" ")[0] : null,
                last_name: p.mflId ? p.name.split(" ").slice(1).join(" ") : null,
                position: p.position,
                team: p.maybeTeam,
                age: p.maybeAge ? Math.round(p.maybeAge) : null,
                status: "Active",
            });

            valuesBatch.push({
                sleeper_id: String(p.sleeperId),
                fc_value: item.value,
                fc_rank: item.overallRank,
                fc_trend_30_day: item.trend30Day,
                redraft_value: item.redraftValue,
                updated_at: new Date(),
            });

        }

        console.log(`Prepared ${playersBatch.length} records for batch insert...`);

        // 1. Batch Upsert Players
        await db.insert(players).values(playersBatch).onConflictDoUpdate({
            target: players.sleeper_id,
            set: {
                full_name: sql.raw("excluded.full_name"),
                position: sql.raw("excluded.position"),
                team: sql.raw("excluded.team"),
                age: sql.raw("excluded.age"),
                updated_at: new Date(),
            }
        });

        // 2. Batch Upsert Values
        await db.insert(playerValues).values(valuesBatch).onConflictDoUpdate({
            target: playerValues.sleeper_id,
            set: {
                fc_value: sql.raw("excluded.fc_value"),
                fc_rank: sql.raw("excluded.fc_rank"),
                fc_trend_30_day: sql.raw("excluded.fc_trend_30_day"),
                redraft_value: sql.raw("excluded.redraft_value"),
                updated_at: new Date(),
            }
        });

        console.log("--- Ingestion Complete ---");
        console.log(`✅ Upserted: ${playersBatch.length}`);
        console.log(`⚠️  Skipped (No Sleeper ID): ${skippedCount}`);

    } catch (error) {
        console.error("!!! Error during ingestion !!!", error);
        process.exit(1);
    }
}

// Only run automatically if executed directly via Node/TSX
if (import.meta.url === `file://${process.argv[1]}`) {
    ingestPlayers();
}
