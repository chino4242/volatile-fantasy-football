import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tradeScenarios } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

async function getUserId() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        return user?.id || null;
    } catch {
        return null;
    }
}

// GET — list trade scenarios for a league
export async function GET(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = request.nextUrl.searchParams.get('league_id');
    if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

    const scenarios = await db
        .select()
        .from(tradeScenarios)
        .where(and(eq(tradeScenarios.user_id, userId), eq(tradeScenarios.league_id, leagueId)))
        .orderBy(desc(tradeScenarios.updated_at));

    return NextResponse.json({ scenarios });
}

// POST — create a new trade scenario
export async function POST(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { league_id, platform, my_assets, their_assets, target_team_name, target_team_id, my_value, their_value, notes } = body;

    if (!league_id || !platform || !my_assets || !their_assets) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const [scenario] = await db.insert(tradeScenarios).values({
        user_id: userId,
        league_id,
        platform,
        status: 'exploring',
        my_assets: JSON.stringify(my_assets),
        their_assets: JSON.stringify(their_assets),
        target_team_name: target_team_name || null,
        target_team_id: target_team_id || null,
        my_value_at_save: my_value || null,
        their_value_at_save: their_value || null,
        notes: notes || null,
    }).returning();

    return NextResponse.json({ scenario });
}

// PATCH — update a trade scenario (status, notes)
export async function PATCH(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, status, notes, my_assets, their_assets, my_value, their_value } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updateData: any = { updated_at: new Date() };
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (my_assets) updateData.my_assets = JSON.stringify(my_assets);
    if (their_assets) updateData.their_assets = JSON.stringify(their_assets);
    if (my_value !== undefined) updateData.my_value_at_save = my_value;
    if (their_value !== undefined) updateData.their_value_at_save = their_value;

    await db.update(tradeScenarios)
        .set(updateData)
        .where(and(eq(tradeScenarios.id, id), eq(tradeScenarios.user_id, userId)));

    return NextResponse.json({ success: true });
}

// DELETE — remove a trade scenario
export async function DELETE(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.delete(tradeScenarios)
        .where(and(eq(tradeScenarios.id, id), eq(tradeScenarios.user_id, userId)));

    return NextResponse.json({ success: true });
}
