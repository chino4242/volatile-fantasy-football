import { NextResponse } from 'next/server';
import { ingestPlayers } from '../../../../scripts/ingest-players';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    console.log('[MANUAL] Starting player ingestion...');
    await ingestPlayers();
    console.log('[MANUAL] Player ingestion completed successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Player data ingested successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MANUAL] Player ingestion failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
