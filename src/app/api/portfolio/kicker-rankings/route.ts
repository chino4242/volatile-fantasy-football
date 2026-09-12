import { NextResponse } from 'next/server';
import { getWeeklyKickerRankings } from '@/lib/kicker-rankings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/kicker-rankings
 * Returns the current-week kicker rankings (scraped from Subvertadown), used by
 * the Action Center to recommend the best available kicker to stream in any
 * league that starts a kicker. Cached upstream; empty list on failure.
 */
export async function GET() {
    try {
        const { week, list } = await getWeeklyKickerRankings();
        return NextResponse.json({ week, list });
    } catch (err) {
        console.error('[kicker-rankings] error', err);
        return NextResponse.json({ week: null, list: [] });
    }
}
