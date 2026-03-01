import { db } from "@/db";
import { customRankings, rankingSources } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface CustomRanking {
  sleeper_id: string;
  rank: number;
  notes: string | null;
  signal: string | null;
  source_name: string;
  source_display_name: string;
}

export async function getCustomRankings(sourceId?: string): Promise<CustomRanking[]> {
  const baseQuery = db
    .select({
      sleeper_id: customRankings.sleeper_id,
      rank: customRankings.rank,
      notes: customRankings.notes,
      signal: customRankings.signal,
      source_name: rankingSources.name,
      source_display_name: rankingSources.display_name,
    })
    .from(customRankings)
    .innerJoin(rankingSources, eq(customRankings.source_id, rankingSources.id));
  
  const results = sourceId
    ? await baseQuery.where(and(
        eq(rankingSources.is_active, true),
        eq(customRankings.source_id, sourceId)
      ))
    : await baseQuery.where(eq(rankingSources.is_active, true));
  
  return results as CustomRanking[];
}

export async function getActiveSources() {
  return await db
    .select({
      id: rankingSources.id,
      name: rankingSources.name,
      display_name: rankingSources.display_name,
      description: rankingSources.description,
    })
    .from(rankingSources)
    .where(eq(rankingSources.is_active, true));
}

export function buildCustomRankingsMap(rankings: CustomRanking[]): Map<string, CustomRanking[]> {
  const map = new Map<string, CustomRanking[]>();
  
  for (const ranking of rankings) {
    const existing = map.get(ranking.sleeper_id) || [];
    existing.push(ranking);
    map.set(ranking.sleeper_id, existing);
  }
  
  return map;
}
