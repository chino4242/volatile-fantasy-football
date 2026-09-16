import { NextResponse } from 'next/server';
import { db } from '@/db';
import { podClaims } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { aggregatePlayerClaims, type PodClaim } from '@/lib/pod-claims';

export const dynamic = 'force-dynamic';

/**
 * GET /api/player-pods?sleeper_id=<id>
 *
 * The "what are the pods saying" feed for ONE player. Returns the two-tier
 * summary (volume/direction/heat + a graduated buy/sell lean) plus the raw
 * claims with verbatim quotes (the trust receipt), so the player-modal Pods tab
 * can show the takeaway AND let the user read the actual words.
 *
 * Only human-trusted links surface here: exact, fuzzy, and confirmed matches.
 * Rows still awaiting review as a wrong-looking fuzzy guess are fine — they were
 * linked to THIS sleeper_id, so they belong; the admin review surface is where
 * bad links get corrected.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const sleeperId = (searchParams.get('sleeper_id') || '').trim();
        if (!sleeperId) return NextResponse.json({ error: 'Missing sleeper_id' }, { status: 400 });

        const rows = await db.select().from(podClaims).where(eq(podClaims.sleeper_id, sleeperId));

        const claims: PodClaim[] = rows.map(r => ({
            sleeper_id: r.sleeper_id,
            player_name: r.player_name,
            show: r.show,
            week: r.week,
            signal_type: r.signal_type as PodClaim['signal_type'],
            direction: r.direction as PodClaim['direction'],
            conviction: r.conviction,
            quote: r.quote,
        }));

        const summary = aggregatePlayerClaims(claims);

        // Display order: most recent week first, then loudest conviction.
        const displayClaims = rows
            .map(r => ({
                show: r.show,
                week: r.week,
                signal_type: r.signal_type,
                direction: r.direction,
                conviction: r.conviction,
                quote: r.quote,
            }))
            .sort((a, b) => (b.week - a.week) || (b.conviction - a.conviction));

        return NextResponse.json({ sleeper_id: sleeperId, summary, claims: displayClaims });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('[player-pods] error', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
