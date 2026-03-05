import { db } from '@/db';
import { leagues } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { leagueId, leagueType, keeperCount, platform } = body;

        if (!leagueId || !platform) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Upsert league settings
        await db
            .insert(leagues)
            .values({
                league_id: leagueId,
                platform,
                league_type: leagueType || 'dynasty',
                keeper_count: keeperCount || null,
            })
            .onConflictDoUpdate({
                target: leagues.league_id,
                set: {
                    league_type: leagueType || 'dynasty',
                    keeper_count: keeperCount || null,
                },
            });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving league settings:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
