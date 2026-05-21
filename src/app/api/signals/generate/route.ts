import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userRankings, userSignals, userLeagues, playerValues, players } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { league_id } = await request.json();

  try {
    // 1. Get user's rankings
    const rankings = await db.select({
      sleeper_id: userRankings.sleeper_id,
      rank: userRankings.rank,
      position_rank: userRankings.position_rank,
      tier: userRankings.tier,
    }).from(userRankings).where(eq(userRankings.user_id, user.id));

    if (!rankings.length) return NextResponse.json({ error: 'No rankings uploaded yet' }, { status: 400 });

    // 2. Get market values
    const market = await db.select({
      sleeper_id: playerValues.sleeper_id,
      fc_rank_sf: playerValues.fc_rank_sf,
      fc_rank_1qb: playerValues.fc_rank_1qb,
      fc_position_rank_sf: playerValues.fc_position_rank_sf,
      fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
    }).from(playerValues);

    const marketMap = new Map(market.map(m => [m.sleeper_id, m]));

    // 3. Get league context (if provided)
    let leagueData: any = null;
    let scoringFormat = 'sf';
    if (league_id) {
      const [league] = await db.select().from(userLeagues).where(and(eq(userLeagues.id, league_id), eq(userLeagues.user_id, user.id)));
      if (league) {
        leagueData = league.roster_data;
        scoringFormat = league.scoring_format || 'sf';
      }
    }

    // 4. Generate signals
    const signals: any[] = [];
    for (const r of rankings) {
      if (!r.sleeper_id || !r.rank) continue;
      const m = marketMap.get(r.sleeper_id);
      if (!m) continue;

      const marketRank = scoringFormat === 'sf' ? m.fc_rank_sf : m.fc_rank_1qb;
      if (!marketRank) continue;

      const delta = r.rank - marketRank; // positive = you rank lower (SELL), negative = you rank higher (BUY)

      let signal: string;
      if (delta < -3) signal = 'BUY';
      else if (delta > 3) signal = 'SELL';
      else signal = 'HOLD';

      // Find owner in league
      let ownerName: string | null = null;
      let ownerRosterId: string | null = null;
      if (leagueData?.rosters) {
        for (const roster of leagueData.rosters) {
          if (roster.players?.includes(r.sleeper_id)) {
            ownerName = roster.owner_name;
            ownerRosterId = String(roster.roster_id);
            break;
          }
        }
      }

      signals.push({
        user_id: user.id,
        league_id: league_id || null,
        sleeper_id: r.sleeper_id,
        signal,
        delta,
        owner_name: ownerName,
        owner_roster_id: ownerRosterId,
        generated_at: new Date(),
      });
    }

    // 5. Clear old signals and insert new
    if (league_id) {
      await db.delete(userSignals).where(and(eq(userSignals.user_id, user.id), eq(userSignals.league_id, league_id)));
    } else {
      await db.delete(userSignals).where(eq(userSignals.user_id, user.id));
    }

    for (const s of signals) {
      await db.insert(userSignals).values(s);
    }

    const buys = signals.filter(s => s.signal === 'BUY');
    const sells = signals.filter(s => s.signal === 'SELL');

    return NextResponse.json({
      success: true,
      total: signals.length,
      buys: buys.length,
      sells: sells.length,
      holds: signals.length - buys.length - sells.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
