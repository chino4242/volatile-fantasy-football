import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, podClaims } from '@/db/schema';
import { desc, eq, or } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pod-claims?review=1
 *   Lists claims that need a human eyeball — fuzzy matches (a guessed link) and
 *   unmatched names (no link). Newest first. Each row carries the verbatim quote
 *   so the reviewer can confirm the guess makes sense.
 *
 * GET /api/admin/pod-claims?player=<partial name>
 *   Player search for the "Fix" flow: returns up to 20 matching players.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const playerQuery = (searchParams.get('player') || '').trim();
        if (playerQuery) {
            const q = cleanseName(playerQuery);
            const all = await db
                .select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team })
                .from(players);
            const matches = all
                .filter(p => p.full_name && cleanseName(p.full_name).includes(q))
                .slice(0, 20);
            return NextResponse.json({ players: matches });
        }

        // Review list: fuzzy (needs verification) + none (needs a home).
        const rows = await db
            .select()
            .from(podClaims)
            .where(or(eq(podClaims.match_method, 'fuzzy'), eq(podClaims.match_method, 'none')))
            .orderBy(desc(podClaims.created_at))
            .limit(200);

        return NextResponse.json({
            claims: rows.map(r => ({
                id: r.id,
                player_name: r.player_name,      // what the podcast said
                matched_name: r.matched_name,    // what we linked to (fuzzy) or null
                sleeper_id: r.sleeper_id,
                match_method: r.match_method,
                show: r.show,
                week: r.week,
                signal_type: r.signal_type,
                direction: r.direction,
                conviction: r.conviction,
                quote: r.quote,
            })),
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('[pod-claims GET] error', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/admin/pod-claims
 *   body: { id: string, action: 'confirm' } — keep the current fuzzy link, mark it human-verified.
 *   body: { id: string, action: 'fix', sleeper_id: string } — relink to a chosen player.
 *   body: { id: string, action: 'unmatch' } — drop the link (sleeper_id = null, method = 'none').
 *
 * Lets you verify/correct fuzzy guesses after upload without re-running extraction.
 */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const id: string = (body?.id || '').trim();
        const action: string = (body?.action || '').trim();
        if (!id) return NextResponse.json({ error: 'Missing claim id' }, { status: 400 });

        const existing = await db.select().from(podClaims).where(eq(podClaims.id, id)).limit(1);
        if (existing.length === 0) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

        if (action === 'confirm') {
            // Keep the link; promote 'fuzzy' → 'confirmed' so it stops showing in review.
            await db.update(podClaims).set({ match_method: 'confirmed' }).where(eq(podClaims.id, id));
            return NextResponse.json({ success: true, id, match_method: 'confirmed' });
        }

        if (action === 'fix') {
            const sleeperId: string = (body?.sleeper_id || '').trim();
            if (!sleeperId) return NextResponse.json({ error: 'fix requires sleeper_id' }, { status: 400 });
            const p = await db.select({ full_name: players.full_name }).from(players).where(eq(players.sleeper_id, sleeperId)).limit(1);
            if (p.length === 0) return NextResponse.json({ error: 'Unknown sleeper_id' }, { status: 400 });
            await db.update(podClaims)
                .set({ sleeper_id: sleeperId, matched_name: p[0].full_name, match_method: 'confirmed' })
                .where(eq(podClaims.id, id));
            return NextResponse.json({ success: true, id, sleeper_id: sleeperId, matched_name: p[0].full_name, match_method: 'confirmed' });
        }

        if (action === 'unmatch') {
            await db.update(podClaims)
                .set({ sleeper_id: null, matched_name: null, match_method: 'none' })
                .where(eq(podClaims.id, id));
            return NextResponse.json({ success: true, id, sleeper_id: null, match_method: 'none' });
        }

        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('[pod-claims PATCH] error', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
