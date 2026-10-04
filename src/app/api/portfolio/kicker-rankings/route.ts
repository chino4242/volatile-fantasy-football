import { NextResponse } from 'next/server';
import { getWeeklyKickerRankings } from '@/lib/weekly-rankings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/kicker-rankings
 * Returns the current-week kicker rankings from weekly_rankings (kind='k'),
 * uploaded via Admin → Weekly Rankings (K). Used by the Action Center to
 * recommend the best available kicker to stream in any league that starts a
 * kicker. Empty list if none uploaded. (Replaces the old Subvertadown scrape.)
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
