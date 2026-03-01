import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/index.js");
  const { rankingSources } = await import("../src/db/schema.js");
  const { eq } = await import("drizzle-orm");
  
  // Update the existing source
  await db.update(rankingSources)
    .set({
      name: "rp_2026",
      display_name: "RP 2026",
      description: "RP WR rankings for 2026",
      updated_at: new Date()
    })
    .where(eq(rankingSources.name, "reception_perception_2026"));
  
  console.log("✅ Updated ranking source to 'RP 2026'");
  
  process.exit(0);
}

main().catch(console.error);
