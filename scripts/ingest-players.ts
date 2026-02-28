import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

console.log("DB URL:", process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@") : "UNDEFINED");

// Dynamic imports will be used inside the function

const FANTASY_CALC_SF_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5";
const FANTASY_CALC_1QB_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=0.5";

export async function ingestPlayers() {
    console.log("--- Starting Player Ingestion ---");
    // Import DB after config
    const { db } = await import("../src/db");
    const { players, playerValues } = await import("../src/db/schema");
    const { sql } = await import("drizzle-orm");

    console.log(`Fetching Superflex data from: ${FANTASY_CALC_SF_URL}`);
    console.log(`Fetching 1QB data from: ${FANTASY_CALC_1QB_URL}`);

    try {
        // Fetch both SF and 1QB data
        const [sfResponse, qbResponse] = await Promise.all([
            fetch(FANTASY_CALC_SF_URL),
            fetch(FANTASY_CALC_1QB_URL)
        ]);

        if (!sfResponse.ok) {
            throw new Error(`Failed to fetch SF: ${sfResponse.statusText}`);
        }
        if (!qbResponse.ok) {
            throw new Error(`Failed to fetch 1QB: ${qbResponse.statusText}`);
        }

        const sfData = await sfResponse.json();
        const qbData = await qbResponse.json();
        
        console.log(`Fetched ${sfData.length} SF records and ${qbData.length} 1QB records. Processing...`);

        // Create map of 1QB values by sleeper_id
        const qbValueMap = new Map(
            qbData
                .filter((item: any) => item.player.sleeperId)
                .map((item: any) => [
                    String(item.player.sleeperId),
                    {
                        value: item.value,
                        rank: item.overallRank
                    }
                ])
        );

        const playersBatch = [];
        const valuesBatch = [];
        let skippedCount = 0;
        let picksCount = 0;

        for (const item of sfData) {
            const p = item.player;
            
            // Debug: log items without sleeperId to see pick format
            if (!p.sleeperId && p.name) {
                console.log(`No sleeperId: "${p.name}"`);
            }
            
            // Handle draft picks - FantasyCalc format is like "2026 Pick 1.01"
            // Convert to our format: FP_2026_1.01
            if (!p.sleeperId && p.name && p.name.match(/^\d{4} Pick \d+\.\d+$/)) {
                const match = p.name.match(/^(\d{4}) Pick (\d+)\.(\d+)$/);
                if (match) {
                    const [_, year, round, slot] = match;
                    const pickId = `FP_${year}_${round}.${slot}`;
                    
                    // Find matching 1QB pick value
                    const qbItem = qbData.find((qb: any) => qb.player.name === p.name);
                    
                    valuesBatch.push({
                        sleeper_id: pickId,
                        fc_value_sf: item.value,
                        fc_rank_sf: item.overallRank,
                        fc_value_1qb: qbItem?.value || null,
                        fc_rank_1qb: qbItem?.overallRank || null,
                        fc_value: item.value,
                        fc_rank: item.overallRank,
                        fc_trend_30_day: item.trend30Day,
                        redraft_value: item.redraftValue,
                        updated_at: new Date(),
                    });
                    
                    picksCount++;
                    continue;
                }
            }
            
            if (!p.sleeperId) {
                skippedCount++;
                continue;
            }

            const sleeperId = String(p.sleeperId);
            const qbValues = qbValueMap.get(sleeperId);

            playersBatch.push({
                sleeper_id: sleeperId,
                full_name: p.name,
                first_name: p.mflId ? p.name.split(" ")[0] : null,
                last_name: p.mflId ? p.name.split(" ").slice(1).join(" ") : null,
                position: p.position,
                team: p.maybeTeam,
                age: p.maybeAge ? Math.round(p.maybeAge) : null,
                status: "Active",
            });

            valuesBatch.push({
                sleeper_id: sleeperId,
                fc_value_sf: item.value,
                fc_rank_sf: item.overallRank,
                fc_value_1qb: qbValues?.value || null,
                fc_rank_1qb: qbValues?.rank || null,
                fc_value: item.value, // Legacy field (SF)
                fc_rank: item.overallRank,
                fc_trend_30_day: item.trend30Day,
                redraft_value: item.redraftValue,
                updated_at: new Date(),
            });

        }

        console.log(`Prepared ${playersBatch.length} players and ${picksCount} picks for batch insert...`);

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
                fc_value_sf: sql.raw("excluded.fc_value_sf"),
                fc_rank_sf: sql.raw("excluded.fc_rank_sf"),
                fc_value_1qb: sql.raw("excluded.fc_value_1qb"),
                fc_rank_1qb: sql.raw("excluded.fc_rank_1qb"),
                fc_value: sql.raw("excluded.fc_value"),
                fc_rank: sql.raw("excluded.fc_rank"),
                fc_trend_30_day: sql.raw("excluded.fc_trend_30_day"),
                redraft_value: sql.raw("excluded.redraft_value"),
                updated_at: new Date(),
            }
        });

        console.log("--- Ingestion Complete ---");
        console.log(`✅ Upserted Players: ${playersBatch.length}`);
        console.log(`✅ Upserted Picks: ${picksCount}`);
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
