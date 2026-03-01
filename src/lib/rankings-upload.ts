import { db } from "@/db";
import { players, rankingSources, customRankings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface RankingRow {
  rank: number;
  playerName: string;
  notes?: string;
  signal?: string;
}

export async function parseRankingsCSV(csvText: string): Promise<RankingRow[]> {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split('\t').map(h => h.trim());
  
  const rankIdx = headers.findIndex(h => h.toLowerCase() === 'rank');
  const playerIdx = headers.findIndex(h => h.toLowerCase() === 'player');
  const notesIdx = headers.findIndex(h => h.toLowerCase() === 'notes');
  const signalIdx = headers.findIndex(h => h.toLowerCase().includes('buy/sell'));
  
  return lines.slice(1).map(line => {
    const cols = line.split('\t').map(c => c.trim());
    return {
      rank: parseInt(cols[rankIdx]),
      playerName: cols[playerIdx],
      notes: notesIdx >= 0 ? cols[notesIdx] : undefined,
      signal: signalIdx >= 0 ? cols[signalIdx] : undefined,
    };
  }).filter(row => row.rank && row.playerName);
}

export async function matchPlayerByName(playerName: string): Promise<string | null> {
  const normalized = playerName.toLowerCase().trim();
  
  // Try exact match first
  const exact = await db.select({ sleeper_id: players.sleeper_id })
    .from(players)
    .where(eq(players.full_name, playerName))
    .limit(1);
  
  if (exact.length > 0) return exact[0].sleeper_id;
  
  // Try case-insensitive match
  const allPlayers = await db.select({
    sleeper_id: players.sleeper_id,
    full_name: players.full_name,
  }).from(players);
  
  const match = allPlayers.find(p => 
    p.full_name.toLowerCase() === normalized
  );
  
  return match?.sleeper_id || null;
}

export async function upsertRankingSource(name: string, displayName: string, description?: string) {
  const existing = await db.select()
    .from(rankingSources)
    .where(eq(rankingSources.name, name))
    .limit(1);
  
  if (existing.length > 0) {
    await db.update(rankingSources)
      .set({ 
        display_name: displayName, 
        description,
        updated_at: new Date() 
      })
      .where(eq(rankingSources.id, existing[0].id));
    return existing[0].id;
  }
  
  const [source] = await db.insert(rankingSources)
    .values({ name, display_name: displayName, description })
    .returning({ id: rankingSources.id });
  
  return source.id;
}

export async function importRankings(
  sourceId: string,
  rankings: RankingRow[]
): Promise<{ matched: number; unmatched: string[] }> {
  const unmatched: string[] = [];
  let matched = 0;
  
  for (const row of rankings) {
    const sleeperId = await matchPlayerByName(row.playerName);
    
    if (!sleeperId) {
      unmatched.push(row.playerName);
      continue;
    }
    
    const existing = await db.select()
      .from(customRankings)
      .where(and(
        eq(customRankings.source_id, sourceId),
        eq(customRankings.sleeper_id, sleeperId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(customRankings)
        .set({
          rank: row.rank,
          notes: row.notes,
          signal: row.signal,
          updated_at: new Date(),
        })
        .where(eq(customRankings.id, existing[0].id));
    } else {
      await db.insert(customRankings)
        .values({
          source_id: sourceId,
          sleeper_id: sleeperId,
          rank: row.rank,
          notes: row.notes,
          signal: row.signal,
        });
    }
    
    matched++;
  }
  
  return { matched, unmatched };
}
