import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { players, userRankings, userSources } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { source_id, rankings } = await request.json();
  if (!rankings?.length) return NextResponse.json({ error: 'Rankings required' }, { status: 400 });

  try {
    // Fetch all players for matching
    const allPlayers = await db.select({
      sleeper_id: players.sleeper_id,
      full_name: players.full_name,
      position: players.position,
    }).from(players);

    // Build name lookup (lowercase → player)
    const nameMap = new Map<string, typeof allPlayers[0]>();
    for (const p of allPlayers) {
      nameMap.set(p.full_name.toLowerCase(), p);
      // Also index by last name for partial matches
      const parts = p.full_name.split(' ');
      if (parts.length >= 2) {
        nameMap.set(parts.slice(1).join(' ').toLowerCase(), p);
      }
    }

    const matched: any[] = [];
    const unmatched: string[] = [];

    for (const entry of rankings) {
      const name = (entry.name || '').trim();
      if (!name) continue;

      // Try exact match first
      let player = nameMap.get(name.toLowerCase());

      // Try common variations
      if (!player) {
        const normalized = name.toLowerCase()
          .replace(/\bjr\.?\b/gi, '').replace(/\bsr\.?\b/gi, '')
          .replace(/\biii\b/gi, '').replace(/\bii\b/gi, '')
          .replace(/['']/g, "'").trim();
        player = nameMap.get(normalized);
      }

      // Try fuzzy: find best match by character overlap
      if (!player) {
        const target = name.toLowerCase();
        let bestScore = 0;
        let bestMatch: typeof allPlayers[0] | null = null;
        for (const p of allPlayers) {
          const candidate = p.full_name.toLowerCase();
          // Simple similarity: shared characters / max length
          const shared = [...new Set<string>(target.split(''))].filter(c => candidate.includes(c)).length;
          const score = shared / Math.max(target.length, candidate.length);
          if (score > bestScore && score > 0.7) {
            bestScore = score;
            bestMatch = p;
          }
        }
        if (bestMatch) player = bestMatch;
      }

      if (player) {
        matched.push({
          user_id: user.id,
          source_id: source_id || null,
          sleeper_id: player.sleeper_id,
          rank: entry.rank || null,
          position_rank: entry.position_rank || null,
          tier: entry.tier || null,
          notes: entry.notes || null,
          confidence: player.full_name.toLowerCase() === name.toLowerCase() ? '1.00' : '0.80',
        });
      } else {
        unmatched.push(name);
      }
    }

    // Upsert matched rankings
    for (const r of matched) {
      await db.insert(userRankings).values(r).onConflictDoUpdate({
        target: [userRankings.user_id, userRankings.sleeper_id] as any,
        set: { rank: r.rank, position_rank: r.position_rank, tier: r.tier, notes: r.notes, source_id: r.source_id, confidence: r.confidence },
      });
    }

    // Update source status
    if (source_id) {
      await db.update(userSources).set({ status: 'matched', player_count: matched.length }).where(eq(userSources.id, source_id));
    }

    return NextResponse.json({
      success: true,
      matched: matched.length,
      unmatched,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
