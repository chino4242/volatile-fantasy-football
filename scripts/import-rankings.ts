import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config({ path: ".env.local" });

async function main() {
  // Dynamic imports after env is loaded
  const { db } = await import("../src/db/index.js");
  const { parseRankingsCSV, upsertRankingSource, importRankings } = await import("../src/lib/rankings-upload.js");
  
  const csvPath = process.argv[2];
  
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-rankings.ts <path-to-csv>");
    process.exit(1);
  }
  
  const fullPath = resolve(csvPath);
  console.log(`Reading CSV from: ${fullPath}`);
  
  const csvText = readFileSync(fullPath, "utf-8");
  const rankings = await parseRankingsCSV(csvText);
  
  console.log(`Parsed ${rankings.length} rankings`);
  
  // Create or update the ranking source
  const sourceId = await upsertRankingSource(
    "rp_2026",
    "RP 2026",
    "RP WR rankings for 2026"
  );
  
  console.log(`Source ID: ${sourceId}`);
  console.log("Importing rankings...");
  
  const result = await importRankings(sourceId, rankings);
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Matched: ${result.matched}`);
  console.log(`   Unmatched: ${result.unmatched.length}`);
  
  if (result.unmatched.length > 0) {
    console.log(`\n⚠️  Unmatched players:`);
    result.unmatched.forEach(name => console.log(`   - ${name}`));
  }
  
  process.exit(0);
}

main().catch(console.error);
