/**
 * Ingest Late Round 2026 Draft Guide player signals from PDF.
 *
 * Usage: npx tsx scripts/ingest-late-round-signals.ts [path-to-pdf]
 * Default: 2026-draft-guide.pdf in project root
 *
 * Extracts "Players to Target", "Players to Avoid", and "Late-Round Dart Throws"
 * sections with confidence levels (1-10). Maps to signal system:
 * - Target + confidence 7-10 → "Super Buy"
 * - Target + confidence 4-6 → "Buy"
 * - Target + confidence 1-3 → "Buy" (lower conviction)
 * - Avoid + confidence 7-10 → "Super Sell"
 * - Avoid + confidence 4-6 → "Sell"
 * - Avoid + confidence 1-3 → "Hold" (mild avoid)
 * - Dart Throw + confidence 7-10 → "Super Buy"
 * - Dart Throw + confidence 4-6 → "Buy"
 * - Dart Throw + confidence 1-3 → "Buy"
 *
 * Updates the existing "Late Round 2026" source's signal field on matched players.
 */
import * as dotenv from "dotenv";
import { resolve } from "path";
import { execSync } from "child_process";

dotenv.config({ path: ".env.local" });

interface PlayerSignal {
  name: string;
  position: string;
  team: string;
  confidence: number;
  section: "target" | "avoid" | "dart";
  signal: string;
}

function mapSignal(section: "target" | "avoid" | "dart", confidence: number): string {
  if (section === "target") {
    return confidence >= 7 ? "Super Buy" : "Buy";
  } else if (section === "avoid") {
    if (confidence >= 7) return "Super Sell";
    if (confidence >= 4) return "Sell";
    return "Hold";
  } else {
    // Dart throws are all speculative buys
    return confidence >= 7 ? "Super Buy" : "Buy";
  }
}

function extractSignalsFromPDF(filePath: string): PlayerSignal[] {
  // Use Python to extract text since pypdf is already installed
  const script = `
import json, re, sys
from pypdf import PdfReader

reader = PdfReader("${filePath}")
entries = []
section = "unknown"

for i in range(206, min(266, len(reader.pages))):
    text = reader.pages[i].extract_text() or ""
    
    # Detect section transitions (handle optional trailing space before newline)
    if re.search(r'PLAYERS\\s*\\nTO TARGET', text):
        section = "target"
    if re.search(r'PLAYERS\\s*\\nTO AVOID', text):
        section = "avoid"
    if re.search(r'LATE-ROUND\\s*\\nDART THROWS', text):
        section = "dart"
    
    if section == "unknown":
        if i >= 209:
            section = "target"
        else:
            continue
    
    # Find player entries by splitting on "Confidence Level: N" and looking backwards
    segments = re.split(r'(Confidence Level:\\s*\\d+)', text)
    
    for idx in range(1, len(segments), 2):
        conf_match = re.search(r'Confidence Level:\\s*(\\d+)', segments[idx])
        if not conf_match:
            continue
        confidence = int(conf_match.group(1))
        
        # Look in the preceding segment for "Name, POS, Team"
        preceding = segments[idx - 1]
        
        # Match: "Name, POS, Team" where team ends before newline or "Added"
        player_matches = list(re.finditer(
            r'([A-Z][a-zA-Z\\'\\u2019\\.\\-]+(?:\\s+[A-Za-z\\'\\u2019\\.\\-]+){0,3}),\\s*(QB|RB|WR|TE),\\s*([A-Z][a-z]+(?:\\s+[A-Za-z0-9]+)*?)\\s*(?:\\n|Added|\\(Added|$)',
            preceding
        ))
        
        if player_matches:
            m = player_matches[-1]  # Take the last (closest to confidence level)
            name = m.group(1).strip()
            position = m.group(2)
            team = m.group(3).strip()
            
            # Clean leading junk from name (sentence fragments ending with period)
            if '.' in name:
                parts = name.rsplit('.', 1)
                if len(parts) == 2 and parts[1].strip():
                    name = parts[1].strip()
            
            # Skip if name looks wrong
            if len(name) > 35 or len(name.split()) > 4 or not name:
                continue
            if not name[0].isupper():
                continue
            
            entries.append({
                "name": name,
                "position": position,
                "team": team,
                "confidence": confidence,
                "section": section,
            })

# Deduplicate by name (keep first occurrence)
seen = set()
unique = []
for e in entries:
    key = e["name"].lower()
    if key not in seen:
        seen.add(key)
        unique.append(e)

print(json.dumps(unique))
`;

  const result = execSync(`python3 -c '${script.replace(/'/g, "'\\''")}'`, {
    cwd: resolve("."),
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  const raw = JSON.parse(result) as Array<{
    name: string;
    position: string;
    team: string;
    confidence: number;
    section: "target" | "avoid" | "dart";
  }>;

  return raw.map((entry) => ({
    ...entry,
    signal: mapSignal(entry.section, entry.confidence),
  }));
}

async function main() {
  const filePath = resolve(process.argv[2] || "2026-draft-guide.pdf");
  console.log(`📋 Extracting player signals from: ${filePath}`);

  const signals = extractSignalsFromPDF(filePath);
  console.log(`  Extracted ${signals.length} player signals`);

  const targets = signals.filter((s) => s.section === "target");
  const avoids = signals.filter((s) => s.section === "avoid");
  const darts = signals.filter((s) => s.section === "dart");
  console.log(`    Targets: ${targets.length} | Avoids: ${avoids.length} | Dart Throws: ${darts.length}`);

  // Import into database
  const { db } = await import("../src/db/index.js");
  const { players, rankingSources, customRankings } = await import("../src/db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  // Find the existing "Late Round 2026" source (created by the rankings script)
  const sourceName = "late_round_2026";
  const existingSource = await db
    .select()
    .from(rankingSources)
    .where(eq(rankingSources.name, sourceName))
    .limit(1);

  if (existingSource.length === 0) {
    console.error(`\n❌ Source "${sourceName}" not found. Run ingest-late-round-rankings.ts first.`);
    process.exit(1);
  }

  const sourceId = existingSource[0].id;
  console.log(`\n  Using source: ${existingSource[0].display_name} (${sourceId})`);

  // Get all players for matching
  const allPlayers = await db
    .select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
    .from(players);

  const playerMap = new Map<string, string>();
  for (const p of allPlayers) {
    playerMap.set(p.full_name.toLowerCase(), p.sleeper_id);
    // Also index with normalized apostrophes
    const normalized = p.full_name.toLowerCase().replace(/\u2019/g, "'");
    if (normalized !== p.full_name.toLowerCase()) {
      playerMap.set(normalized, p.sleeper_id);
    }
  }

  // Common name variations
  const aliases: Record<string, string> = {
    "von achane": "de'von achane",
    "de'von achane": "de'von achane",
    "jk dobbins": "j.k. dobbins",
    "dk metcalf": "d.k. metcalf",
    "dj moore": "d.j. moore",
    "aj brown": "a.j. brown",
    "wan'dale robinson": "wan'dale robinson",
    "nick singleton": "nicholas singleton",
  };

  let updated = 0;
  let inserted = 0;
  const unmatched: string[] = [];

  for (const signal of signals) {
    // Normalize curly apostrophe to straight apostrophe for matching
    const normalizedName = signal.name.replace(/\u2019/g, "'");
    let sleeperId = playerMap.get(normalizedName.toLowerCase());

    // Try alias
    if (!sleeperId) {
      const alias = aliases[normalizedName.toLowerCase()];
      if (alias) {
        sleeperId = playerMap.get(alias);
      }
    }

    // Try fuzzy: first + last name match
    if (!sleeperId) {
      const parts = normalizedName.toLowerCase().split(" ");
      if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts[parts.length - 1];
        const match = allPlayers.find(
          (p) =>
            p.full_name.toLowerCase().startsWith(firstName) &&
            p.full_name.toLowerCase().includes(lastName)
        );
        if (match) sleeperId = match.sleeper_id;
      }
    }

    if (!sleeperId) {
      unmatched.push(`${signal.name} (${signal.position}, ${signal.team})`);
      continue;
    }

    // Check if player already has a ranking entry from the XLSX import
    const existingRanking = await db
      .select()
      .from(customRankings)
      .where(and(eq(customRankings.source_id, sourceId), eq(customRankings.sleeper_id, sleeperId)))
      .limit(1);

    const sectionLabel = signal.section === "target" ? "Target" : signal.section === "avoid" ? "Avoid" : "Dart Throw";
    const signalNote = `${sectionLabel} (Confidence: ${signal.confidence}/10)`;

    if (existingRanking.length > 0) {
      // Update existing entry with signal
      const currentNotes = existingRanking[0].notes || "";
      const updatedNotes = currentNotes ? `${currentNotes} | ${signalNote}` : signalNote;

      await db
        .update(customRankings)
        .set({
          signal: signal.signal,
          notes: updatedNotes,
          updated_at: new Date(),
        })
        .where(eq(customRankings.id, existingRanking[0].id));
      updated++;
    } else {
      // Insert new entry (player wasn't in top 250 but has a signal)
      await db.insert(customRankings).values({
        source_id: sourceId,
        sleeper_id: sleeperId,
        rank: null,
        notes: signalNote,
        signal: signal.signal,
      });
      inserted++;
    }
  }

  console.log(`\n✅ Signals import complete!`);
  console.log(`   Updated existing rankings: ${updated}`);
  console.log(`   New entries (not in top 250): ${inserted}`);

  if (unmatched.length > 0) {
    console.log(`\n⚠️  Unmatched players (${unmatched.length}):`);
    unmatched.forEach((name) => console.log(`   - ${name}`));
  }

  // Summary
  console.log(`\n📊 Signal distribution:`);
  const signalCounts: Record<string, number> = {};
  for (const s of signals) {
    signalCounts[s.signal] = (signalCounts[s.signal] || 0) + 1;
  }
  Object.entries(signalCounts)
    .sort()
    .forEach(([sig, count]) => console.log(`   ${sig}: ${count}`));

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
