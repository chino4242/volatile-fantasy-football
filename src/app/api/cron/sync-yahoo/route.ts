import { NextResponse } from 'next/server';
import { syncAllYahooLeagues } from '../../../../../scripts/sync-yahoo';

export const maxDuration = 60;

/**
 * Yahoo league sync cron. Uses fetch + cheerio against YAHOO_COOKIE, so it runs
 * fine on Vercel serverless (no browser). Requires YAHOO_COOKIE and
 * YAHOO_LEAGUE_IDS to be set in the Vercel environment.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('[CRON] Starting Yahoo league sync...');
        const results = await syncAllYahooLeagues();
        console.log('[CRON] Yahoo sync completed:', results);
        return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('[CRON] Yahoo sync failed:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
