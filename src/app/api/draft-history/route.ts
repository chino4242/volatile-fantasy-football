import { db } from '@/db';
import { draftHistory } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { leagueId, userId, platform, mode, draftData, planId } = await request.json();
        if (!leagueId || !userId || !platform || !mode || !draftData) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        await db.insert(draftHistory).values({
            league_id: leagueId,
            user_id: userId,
            platform,
            mode,
            draft_data: draftData,
            plan_id: planId || null,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving draft history:', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const leagueId = searchParams.get('leagueId');
        const userId = searchParams.get('userId');
        if (!leagueId || !userId) {
            return NextResponse.json({ error: 'Missing leagueId or userId' }, { status: 400 });
        }
        const results = await db.select()
            .from(draftHistory)
            .where(and(eq(draftHistory.league_id, leagueId), eq(draftHistory.user_id, userId)))
            .orderBy(desc(draftHistory.created_at))
            .limit(20);
        return NextResponse.json(results);
    } catch (error) {
        console.error('Error fetching draft history:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}
