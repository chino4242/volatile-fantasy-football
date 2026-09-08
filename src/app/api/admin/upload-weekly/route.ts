import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, weeklyRankings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';

/**
 * POST /api/admin/upload-weekly   (multipart form)
 *   file: CSV of weekly rankings
 *   kind: 'flex' | 'qb'
 *   week: integer
 *
 * CSV columns (Flex example): Rank, FLEX, Team, Opponent, Total, Pos, Matchup
 *   - FLEX/QB column = player name
 *   - Matchup = opponent's rank vs the player's position (pos_matchup)
 * Weekly + disposable: replaces all rows for (week, kind) on each upload.
 */

function splitLine(line: string): string[] {
    // Prefer comma; fall back to tab or 2+ spaces (the source is tabular text).
    if (line.includes(',')) {
        const fields: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') inQ = !inQ;
            else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        fields.push(cur.trim());
        return fields;
    }
    if (line.includes('\t')) return line.split('\t').map(s => s.trim());
    return line.split(/\s{2,}/).map(s => s.trim());
}

function toInt(v: any): number | null {
    if (v == null) return null;
    const m = String(v).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
}
function toNum(v: any): string | null {
    if (v == null || String(v).trim() === '') return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? String(n) : null;
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const kind = String(formData.get('kind') || '');
        const week = toInt(formData.get('week'));

        if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
        if (kind !== 'flex' && kind !== 'qb') return NextResponse.json({ error: "kind must be 'flex' or 'qb'" }, { status: 400 });
        if (week == null || week < 1 || week > 25) return NextResponse.json({ error: 'week must be 1-25' }, { status: 400 });

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return NextResponse.json({ error: 'No data rows found' }, { status: 400 });

        const headers = splitLine(lines[0].replace(/^\uFEFF/, '')).map(h => h.toLowerCase());
        // Locate columns by header name (tolerant of the "FLEX"/"QB" player column).
        const idx = (...names: string[]) => { for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; } return -1; };
        const cRank = idx('rank');
        const cPlayer = idx('flex', 'qb', 'quarterback', 'player', 'name', 'running back', 'wide receiver', 'tight end');
        const cTeam = idx('team');
        const cOpp = idx('opponent', 'opp');
        const cTotal = idx('total');
        const cPos = idx('pos', 'position');
        const cMatchup = idx('matchup', 'pos matchup');

        if (cPlayer === -1) return NextResponse.json({ error: `Could not find a player column. Detected headers: [${headers.join(', ')}]. Expected one of: FLEX, QB, Quarterback, Player, Name.` }, { status: 400 });

        // Player name → sleeper_id.
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
        const byName = new Map<string, string>();
        for (const p of allPlayers) if (p.full_name) byName.set(cleanseName(p.full_name), p.sleeper_id);

        const rows: typeof weeklyRankings.$inferInsert[] = [];
        const unmatched: string[] = [];
        const seen = new Set<string>();
        for (const line of lines.slice(1)) {
            const f = splitLine(line);
            const name = cPlayer >= 0 ? f[cPlayer] : null;
            if (!name) continue;
            const sleeperId = byName.get(cleanseName(name)) || null;
            if (!sleeperId) { unmatched.push(name); }
            // Dedupe within the file by sleeper_id (skip dupes; keep first/best rank).
            const dedupeKey = sleeperId || `name:${cleanseName(name)}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            rows.push({
                sleeper_id: sleeperId,
                week,
                kind,
                rank: cRank >= 0 ? toInt(f[cRank]) : null,
                position: cPos >= 0 ? (f[cPos] || null) : (kind === 'qb' ? 'QB' : null),
                team: cTeam >= 0 ? (f[cTeam] || null) : null,
                opponent: cOpp >= 0 ? (f[cOpp] || null) : null,
                total: cTotal >= 0 ? toNum(f[cTotal]) : null,
                pos_matchup: cMatchup >= 0 ? toInt(f[cMatchup]) : null,
                player_name: name,
            });
        }

        // Replace this (week, kind) set.
        await db.delete(weeklyRankings).where(and(eq(weeklyRankings.week, week), eq(weeklyRankings.kind, kind)));
        for (let i = 0; i < rows.length; i += 500) {
            await db.insert(weeklyRankings).values(rows.slice(i, i + 500));
        }

        return NextResponse.json({
            success: true, week, kind,
            totalRows: rows.length,
            matched: rows.length - unmatched.length,
            unmatched: unmatched.length,
            unmatchedNames: unmatched.slice(0, 50),
        });
    } catch (error: any) {
        console.error('[upload-weekly] error', error?.stack || error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
