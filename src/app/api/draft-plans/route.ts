import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { draftPlans } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
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

// GET — get draft plan for a league
export async function GET(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leagueId = request.nextUrl.searchParams.get('league_id');
    if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 });

    const [plan] = await db
        .select()
        .from(draftPlans)
        .where(and(eq(draftPlans.user_id, userId), eq(draftPlans.league_id, leagueId)))
        .limit(1);

    return NextResponse.json({ plan: plan || null });
}

// POST — create or update draft plan
export async function POST(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { league_id, platform, keeper_ids, roster_targets, picks, tier_source, notes } = body;

    if (!league_id || !platform) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upsert: check if plan exists for this user+league
    const [existing] = await db
        .select({ id: draftPlans.id })
        .from(draftPlans)
        .where(and(eq(draftPlans.user_id, userId), eq(draftPlans.league_id, league_id)))
        .limit(1);

    if (existing) {
        // Update
        await db.update(draftPlans)
            .set({
                keeper_ids: JSON.stringify(keeper_ids || []),
                roster_targets: JSON.stringify(roster_targets || {}),
                picks: JSON.stringify(picks || []),
                tier_source: tier_source || 'dynasty',
                notes: notes || null,
                updated_at: new Date(),
            })
            .where(eq(draftPlans.id, existing.id));
        return NextResponse.json({ success: true, id: existing.id });
    } else {
        // Create
        const [plan] = await db.insert(draftPlans).values({
            user_id: userId,
            league_id,
            platform,
            keeper_ids: JSON.stringify(keeper_ids || []),
            roster_targets: JSON.stringify(roster_targets || {}),
            picks: JSON.stringify(picks || []),
            tier_source: tier_source || 'dynasty',
            notes: notes || null,
        }).returning();
        return NextResponse.json({ success: true, id: plan.id });
    }
}

// DELETE — remove draft plan
export async function DELETE(request: NextRequest) {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await db.delete(draftPlans)
        .where(and(eq(draftPlans.id, id), eq(draftPlans.user_id, userId)));

    return NextResponse.json({ success: true });
}
