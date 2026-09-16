import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, podClaims } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';
import { extractClaimsFromTranscript, resolveClaims } from '@/lib/pod-claims';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // LLM extraction can take a while

/**
 * POST /api/admin/upload-transcript
 *   body: { text: string, show: string, week: number }
 *
 * Runs LLM extraction over a pasted podcast transcript → player-claim atoms,
 * name-matches to sleeper_id, and writes them to pod_claims. Re-uploading the
 * same (show, week) replaces that set (idempotent per show+week).
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const text: string = body?.text || '';
        const show: string = (body?.show || '').trim();
        const week: number | null = body?.week != null ? Number(body.week) : null;

        if (!text.trim()) return NextResponse.json({ error: 'Missing transcript text' }, { status: 400 });
        if (!show) return NextResponse.json({ error: 'Missing show name' }, { status: 400 });
        if (week == null || week < 1 || week > 25) return NextResponse.json({ error: 'week must be 1-25' }, { status: 400 });
        if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI extraction not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 });

        // Extract claim atoms via the LLM.
        const extracted = await extractClaimsFromTranscript(text);
        if (extracted.length === 0) {
            return NextResponse.json({ error: 'No player claims could be extracted from this transcript.' }, { status: 400 });
        }

        // Build name → sleeper_id map (exact) + a matchable list (for fuzzy).
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
        const nameToId = new Map<string, string>();
        const playersList: { sleeper_id: string; full_name: string }[] = [];
        for (const p of allPlayers) {
            if (p.full_name) { nameToId.set(cleanseName(p.full_name), p.sleeper_id); playersList.push({ sleeper_id: p.sleeper_id, full_name: p.full_name }); }
        }

        const rows = resolveClaims(extracted, show, week, nameToId, playersList);
        const unmatched = rows.filter(r => r.matchMethod === 'none').map(r => r.player_name);
        const fuzzy = rows.filter(r => r.matchMethod === 'fuzzy').map(r => `${r.player_name} → ${r.matchedName}`);

        // Strip the match metadata before insert (DB shape only).
        const insertRows = rows.map(({ matchMethod, matchedName, ...row }) => { void matchMethod; void matchedName; return row; });

        // Replace this (show, week) set, then insert.
        await db.delete(podClaims).where(and(eq(podClaims.show, show), eq(podClaims.week, week)));
        for (let i = 0; i < insertRows.length; i += 500) {
            await db.insert(podClaims).values(insertRows.slice(i, i + 500));
        }

        const byDirection = rows.reduce((acc, r) => { acc[r.direction] = (acc[r.direction] || 0) + 1; return acc; }, {} as Record<string, number>);
        return NextResponse.json({
            success: true,
            show,
            week,
            claims: rows.length,
            matched: rows.length - unmatched.length,
            fuzzyMatched: fuzzy.length,
            unmatched: unmatched.length,
            byDirection,
            fuzzyMatches: fuzzy.slice(0, 50),
            unmatchedNames: unmatched.slice(0, 50),
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal server error';
        console.error('[upload-transcript] error', error);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
