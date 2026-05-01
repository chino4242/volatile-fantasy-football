import { NextResponse } from 'next/server';
import { ingestPlayers } from '../../../../../scripts/ingest-players';
import { db } from '@/db';
import { playerValues, valueSnapshots } from '@/db/schema';
import { sql } from 'drizzle-orm';

export const maxDuration = 60; // 60 seconds timeout for cron job

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[CRON] Starting player ingestion...');
    await ingestPlayers();
    console.log('[CRON] Player ingestion completed successfully');

    // Weekly value snapshot (check if we already have one this week)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const recent = await db.select({ id: valueSnapshots.id }).from(valueSnapshots).where(sql`${valueSnapshots.snapshot_date} > ${weekAgo}`).limit(1);
    if (recent.length === 0) {
      await db.execute(sql`INSERT INTO value_snapshots (sleeper_id, fc_value_sf, fc_value_1qb, fc_rank_sf, fc_rank_1qb, snapshot_date)
        SELECT sleeper_id, fc_value_sf, fc_value_1qb, fc_rank_sf, fc_rank_1qb, NOW()
        FROM player_values WHERE fc_value_sf IS NOT NULL OR fc_value_1qb IS NOT NULL`);
      console.log('[CRON] Weekly value snapshot taken');
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Player data ingested successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[CRON] Player ingestion failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
