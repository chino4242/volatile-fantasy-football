/**
 * Ingest Late Round 2026 Draft Guide rankings, tiers, and market scores from XLSX.
 *
 * Usage: npx tsx scripts/ingest-late-round-rankings.ts [path-to-xlsx]
 * Default: RankingsTiersMarketScore_2026.xlsx in project root
 *
 * This creates a "Late Round 2026" custom ranking source and imports:
 * - Overall rank (1-250)
 * - Position rank
 * - Tier (1-35)
 * - Market Score (0-100 scale, per position)
 *
 * The tier is stored in the `notes` field as "Tier X | Market Score: Y"
 * so it's visible in the UI alongside the rank.
 */
import * as dotenv from "dotenv";
import { resolve } from "path";
import { readFile, utils } from "xlsx";

dotenv.config({ path: ".env.local" });

interface RankingEntry {
  overall: number;
  player: string;
  position: string;
  posRank: number;
  tier: number;
  marketScore?: number;
}

async function parseXLSX(filePath: string): Promise<RankingEntry[]> {
  const workbook = readFile(filePath);

  const entries: RankingEntry[] = [];

  // Parse "Rankings and Tiers" sheet
  const rankingsSheet = workbook.Sheets["Rankings and Tiers"];
  if (!rankingsSheet) {
    throw new Error('Sheet "Rankings and Tiers" not found in workbook');
  }

  const rankingsData = utils.sheet_to_json<{
    Overall: number;
    Player: string;
    Position: string;
    "Pos Rank": number;
    Tier: number;
  }>(rankingsSheet);

  for (const row of rankingsData) {
    const overall = parseInt(String(row.Overall));
    const player = String(row.Player || "").trim();
    const position = String(row.Position || "").trim();
    const posRank = parseInt(String(row["Pos Rank"]));
    const tier = parseInt(String(row.Tier));

    if (overall && player && position) {
      entries.push({ overall, player, position, posRank, tier });
    }
  }

  // Parse "Market Score" sheet and merge scores into entries
  const marketSheet = workbook.Sheets["Market Score"];
  if (marketSheet) {
    const marketScores = new Map<string, number>();

    // Parse raw rows (skip first 2 header rows)
    const rawData = utils.sheet_to_json(marketSheet, {
      header: 1,
      defval: null,
    }) as unknown as Array<Array<unknown>>;

    for (let rowIdx = 2; rowIdx < rawData.length; rowIdx++) {
      const row = rawData[rowIdx];
      if (!row) continue;

      // QB: cols 0-3, RB: cols 5-8, WR: cols 10-13, TE: cols 15-18
      const groups = [
        { nameCol: 1, scoreCol: 3 },
        { nameCol: 6, scoreCol: 8 },
        { nameCol: 11, scoreCol: 13 },
        { nameCol: 16, scoreCol: 18 },
      ];

      for (const group of groups) {
        const name = String(row[group.nameCol] || "").trim();
        const scoreVal = row[group.scoreCol];
        const score = parseFloat(String(scoreVal || ""));
        if (name && !isNaN(score)) {
          marketScores.set(name.toLowerCase(), Math.round(score * 10) / 10);
        }
      }
    }

    // Merge market scores into ranking entries
    for (const entry of entries) {
      const score = marketScores.get(entry.player.toLowerCase());
      if (score !== undefined) {
        entry.marketScore = score;
      }
    }

    console.log(`  Market scores matched: ${entries.filter((e) => e.marketScore !== undefined).length}/${marketScores.size} available`);
  }

  return entries;
}

async function main() {
  const filePath = resolve(process.argv[2] || "RankingsTiersMarketScore_2026.xlsx");
  console.log(`📊 Ingesting Late Round rankings from: ${filePath}`);

  const entries = await parseXLSX(filePath);
  console.log(`  Parsed ${entries.length} ranked players`);
  console.log(`  Tiers: 1-${Math.max(...entries.map((e) => e.tier))}`);
  console.log(`  Positions: ${Array.from(new Set(entries.map((e) => e.position))).join(", ")}`);

  // Import into database
  const { db } = await import("../src/db/index.js");
  const { players, rankingSources, customRankings } = await import("../src/db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  // Create or update the ranking source
  const sourceName = "late_round_2026";
  const sourceDisplayName = "Late Round 2026";
  const sourceDescription = "Late Round Fantasy Football 2026 Draft Guide - Rankings, Tiers, and Market Scores (1QB, Half-PPR)";

  let sourceId: string;
  const existing = await db
    .select()
    .from(rankingSources)
    .where(eq(rankingSources.name, sourceName))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(rankingSources)
      .set({ display_name: sourceDisplayName, description: sourceDescription, updated_at: new Date() })
      .where(eq(rankingSources.id, existing[0].id));
    sourceId = existing[0].id;
    console.log(`\n  Updated existing source: ${sourceDisplayName} (${sourceId})`);
  } else {
    const [source] = await db
      .insert(rankingSources)
      .values({ name: sourceName, display_name: sourceDisplayName, description: sourceDescription })
      .returning({ id: rankingSources.id });
    sourceId = source.id;
    console.log(`\n  Created new source: ${sourceDisplayName} (${sourceId})`);
  }

  // Clear existing rankings for this source (full replace)
  await db.delete(customRankings).where(eq(customRankings.source_id, sourceId));
  console.log(`  Cleared old rankings for source`);

  // Match players and insert
  const allPlayers = await db
    .select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
    .from(players);

  const playerMap = new Map<string, string>();
  for (const p of allPlayers) {
    playerMap.set(p.full_name.toLowerCase(), p.sleeper_id);
  }

  // Nickname/alias mapping for common mismatches
  const aliases: Record<string, string> = {
    "gabriel davis": "gabe davis",
    "hollywood brown": "marquise brown",
    "scotty miller": "scott miller",
    "robbie anderson": "robby anderson",
    "nick westbrook-ikhine": "nick westbrook",
    "joshua palmer": "josh palmer",
    "aj brown": "a.j. brown",
    "jk dobbins": "j.k. dobbins",
    "cj stroud": "c.j. stroud",
    "tj hockenson": "t.j. hockenson",
    "dj moore": "d.j. moore",
    "dk metcalf": "d.k. metcalf",
    "nick singleton": "nicholas singleton",
  };

  let matched = 0;
  const unmatched: string[] = [];
  const insertValues: Array<{
    source_id: string;
    sleeper_id: string;
    rank: number;
    notes: string;
    signal: string | null;
  }> = [];

  for (const entry of entries) {
    let sleeperId = playerMap.get(entry.player.toLowerCase());

    // Try alias lookup
    if (!sleeperId) {
      const alias = aliases[entry.player.toLowerCase()];
      if (alias) {
        sleeperId = playerMap.get(alias);
      }
    }

    // Try partial match (last name + position)
    if (!sleeperId) {
      const parts = entry.player.toLowerCase().split(" ");
      const lastName = parts[parts.length - 1];
      const match = allPlayers.find(
        (p) =>
          p.full_name.toLowerCase().includes(lastName) &&
          p.full_name.toLowerCase().startsWith(parts[0])
      );
      if (match) {
        sleeperId = match.sleeper_id;
      }
    }

    if (!sleeperId) {
      unmatched.push(`${entry.player} (${entry.position}, #${entry.overall})`);
      continue;
    }

    // Build notes string with tier and market score
    let notes = `Tier ${entry.tier} | ${entry.position} ${entry.posRank}`;
    if (entry.marketScore !== undefined) {
      notes += ` | Market Score: ${entry.marketScore}`;
    }

    insertValues.push({
      source_id: sourceId,
      sleeper_id: sleeperId,
      rank: entry.overall,
      notes,
      signal: null, // Signals come from the PDF script
    });

    matched++;
  }

  // Batch insert
  if (insertValues.length > 0) {
    // Insert in chunks to avoid parameter limits
    const chunkSize = 50;
    for (let i = 0; i < insertValues.length; i += chunkSize) {
      const chunk = insertValues.slice(i, i + chunkSize);
      await db.insert(customRankings).values(chunk);
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Matched: ${matched}/${entries.length}`);
  console.log(`   With Market Scores: ${entries.filter((e) => e.marketScore !== undefined).length}`);

  if (unmatched.length > 0) {
    console.log(`\n⚠️  Unmatched players (${unmatched.length}):`);
    unmatched.forEach((name) => console.log(`   - ${name}`));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
