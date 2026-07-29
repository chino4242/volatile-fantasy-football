import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { playerAdvancedStats } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

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

        return NextResponse.json({ stats });
    } catch (error) {
        console.error('Error fetching advanced stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
