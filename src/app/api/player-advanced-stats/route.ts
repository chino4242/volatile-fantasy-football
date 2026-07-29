import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { playerAdvancedStats } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { detectBreakout, detectRegression, getAdvancedStatsBoost, type PlayerAdvStats } from '@/lib/advanced-stats';

export async function GET(request: NextRequest) {
    const sleeperId = request.nextUrl.searchParams.get('sleeper_id');
    const gsis = request.nextUrl.searchParams.get('gsis_id');
    const season = request.nextUrl.searchParams.get('season');

    if (!sleeperId && !gsis) {
        return NextResponse.json({ error: 'sleeper_id or gsis_id required' }, { status: 400 });
    }

    try {
        let whereClause;
        if (sleeperId) {
            whereClause = season
                ? and(eq(playerAdvancedStats.sleeper_id, sleeperId), eq(playerAdvancedStats.season, parseInt(season)))
                : eq(playerAdvancedStats.sleeper_id, sleeperId);
        } else {
            whereClause = season
                ? and(eq(playerAdvancedStats.gsis_id, gsis!), eq(playerAdvancedStats.season, parseInt(season)))
                : eq(playerAdvancedStats.gsis_id, gsis!);
        }

        const stats = await db
            .select()
            .from(playerAdvancedStats)
            .where(whereClause)
            .orderBy(desc(playerAdvancedStats.season))
            .limit(3); // Last 3 seasons

        // Compute breakout detection (compare most recent vs previous)
        let breakout = null;
        let regression = null;
        let scoringBoost = null;

        if (stats.length >= 1) {
            const current = stats[0] as unknown as PlayerAdvStats;
            const previous = stats.length >= 2 ? stats[1] as unknown as PlayerAdvStats : null;
            
            breakout = detectBreakout(current, previous);
            regression = detectRegression(current);
            scoringBoost = getAdvancedStatsBoost(current);
        }

        return NextResponse.json({ stats, breakout, regression, scoringBoost });
    } catch (error) {
        console.error('Error fetching advanced stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
