import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { draftPlans } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';

async function getUserId(request: NextRequest) {
    // Try Supabase auth first
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) return user.id;
    } catch {}

    // Fall back to username from header or query param (soft login)
    const username = request.headers.get('x-user-id') ||
        request.nextUrl.searchParams.get('user_id') || null;
    return username;
}

// GET — list all draft plans for a league
export async function GET(request: NextRequest) {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = request.nextUrl.searchParams.get('league_id');
    if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

    // Return all plans for this user + league
    const plans = await db
        .select()
        .from(draftPlans)
        .where(and(eq(draftPlans.user_id, userId), eq(draftPlans.league_id, leagueId)))
        .orderBy(desc(draftPlans.updated_at));

    return NextResponse.json({ plans });
}

// POST — create a new draft plan
export async function POST(request: NextRequest) {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { league_id, platform, name, keeper_ids, roster_targets, picks, tier_source, notes } = body;

    if (!league_id || !platform) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const [plan] = await db.insert(draftPlans).values({
        user_id: userId,
        league_id,
        platform,
        name: name || `Draft Plan`,
        keeper_ids: JSON.stringify(keeper_ids || []),
        roster_targets: JSON.stringify(roster_targets || {}),
        picks: JSON.stringify(picks || []),
        tier_source: tier_source || 'dynasty',
        notes: notes || null,
    }).returning();

    return NextResponse.json({ success: true, plan });
}

// PATCH — update an existing draft plan
export async function PATCH(request: NextRequest) {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { id, name, keeper_ids, roster_targets, picks, tier_source, notes } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.update(draftPlans)
        .set({
            ...(name !== undefined && { name }),
            ...(keeper_ids !== undefined && { keeper_ids: JSON.stringify(keeper_ids) }),
            ...(roster_targets !== undefined && { roster_targets: JSON.stringify(roster_targets) }),
            ...(picks !== undefined && { picks: JSON.stringify(picks) }),
            ...(tier_source !== undefined && { tier_source }),
            ...(notes !== undefined && { notes }),
            updated_at: new Date(),
        })
        .where(and(eq(draftPlans.id, id), eq(draftPlans.user_id, userId)));

    return NextResponse.json({ success: true });
}

// DELETE — remove a draft plan
export async function DELETE(request: NextRequest) {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.delete(draftPlans)
        .where(and(eq(draftPlans.id, id), eq(draftPlans.user_id, userId)));

    return NextResponse.json({ success: true });
}
