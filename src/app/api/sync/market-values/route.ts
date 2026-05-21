import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, playerValues } from '@/db/schema';
import { sql } from 'drizzle-orm';

const FC_SF_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5";
const FC_1QB_URL = "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=0.5";

export async function GET(request: Request) {
  // Verify cron secret
  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [sfRes, qbRes] = await Promise.all([fetch(FC_SF_URL), fetch(FC_1QB_URL)]);
    if (!sfRes.ok || !qbRes.ok) return NextResponse.json({ error: 'FantasyCalc API failed' }, { status: 502 });

    const sfData = await sfRes.json();
    const qbData = await qbRes.json();

    const qbMap = new Map(qbData.filter((i: any) => i.player.sleeperId).map((i: any) => [String(i.player.sleeperId), i]));

    let updated = 0;
    for (const item of sfData) {
      const p = item.player;
      const sleeperId = p.sleeperId ? String(p.sleeperId) : null;
      if (!sleeperId) continue;

      const qbItem = qbMap.get(sleeperId) as any;

      await db.insert(playerValues).values({
        sleeper_id: sleeperId,
        fc_value_sf: item.value,
        fc_rank_sf: item.overallRank,
        fc_position_rank_sf: item.positionRank,
        fc_value_1qb: qbItem?.value || null,
        fc_rank_1qb: qbItem?.overallRank || null,
        fc_position_rank_1qb: qbItem?.positionRank || null,
        fc_value: item.value,
        fc_rank: item.overallRank,
        fc_trend_30_day: item.trend30Day,
        fc_combined_value: item.combinedValue,
        fc_trade_frequency: item.maybeTradeFrequency,
        redraft_value: item.redraftValue,
        updated_at: new Date(),
      }).onConflictDoUpdate({
        target: playerValues.sleeper_id,
        set: {
          fc_value_sf: item.value,
          fc_rank_sf: item.overallRank,
          fc_position_rank_sf: item.positionRank,
          fc_value_1qb: qbItem?.value || null,
          fc_rank_1qb: qbItem?.overallRank || null,
          fc_position_rank_1qb: qbItem?.positionRank || null,
          fc_value: item.value,
          fc_rank: item.overallRank,
          fc_trend_30_day: item.trend30Day,
          fc_combined_value: item.combinedValue,
          fc_trade_frequency: item.maybeTradeFrequency,
          redraft_value: item.redraftValue,
          updated_at: new Date(),
        },
      });
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
