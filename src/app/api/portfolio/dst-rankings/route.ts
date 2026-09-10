import { NextResponse } from 'next/server';
import { getWeeklyDstRankings } from '@/lib/weekly-rankings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/dst-rankings
 * Returns the current-week DST streaming rankings (the full uploaded list),
 * used by the Action Center to recommend the best available defense to stream
 * in redraft leagues. Empty list if none uploaded.
 */
export async function GET() {
    try {
        const { week, list } = await getWeeklyDstRankings();
        return NextResponse.json({ week, list });
    } catch (err) {
        console.error('[dst-rankings] error', err);
        return NextResponse.json({ week: null, list: [] });
    }
}
