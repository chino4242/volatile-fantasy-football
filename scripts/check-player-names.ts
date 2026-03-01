import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/index.js");
  const { players } = await import("../src/db/schema.js");
  const { like } = await import("drizzle-orm");
  
  const names = ["Justin Jefferson", "Garrett Wilson", "Emeka Egbuka", "Rome Odunze", "Travis Hunter", "Parker Washington", "Mike Evans"];
  
  for (const name of names) {
    const results = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
      .from(players)
      .where(like(players.full_name, `%${name}%`))
      .limit(3);
    
    console.log(`\n"${name}":`);
    if (results.length === 0) {
      console.log("  ❌ NOT FOUND");
    } else {
      results.forEach(r => console.log(`  ✓ ${r.full_name} (${r.sleeper_id})`));
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
