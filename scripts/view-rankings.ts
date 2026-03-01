import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db/index.js");
  const { getCustomRankings, getActiveSources } = await import("../src/lib/custom-rankings.js");
  
  console.log("📊 Active Ranking Sources:\n");
  const sources = await getActiveSources();
  sources.forEach(s => {
    console.log(`  • ${s.display_name} (${s.name})`);
    if (s.description) console.log(`    ${s.description}`);
  });
  
  console.log("\n🏈 Sample Rankings:\n");
  const rankings = await getCustomRankings();
  
  rankings.slice(0, 10).forEach(r => {
    console.log(`  ${r.rank}. ${r.sleeper_id}`);
    if (r.signal) console.log(`     Signal: ${r.signal}`);
    if (r.notes) console.log(`     Notes: ${r.notes.substring(0, 60)}...`);
  });
  
  console.log(`\n✅ Total rankings imported: ${rankings.length}`);
  process.exit(0);
}

main().catch(console.error);
