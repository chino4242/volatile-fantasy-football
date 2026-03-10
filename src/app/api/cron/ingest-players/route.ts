import { NextResponse } from 'next/server';
import { ingestPlayers } from '../../../../../scripts/ingest-players';

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
