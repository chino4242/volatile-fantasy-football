import { NextResponse } from 'next/server';
import { db } from '@/db';
import { players, playerTransactions, playerTags } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';
import { parseTransactionsFeed } from '@/lib/transactions-parser';

/**
 * POST /api/admin/upload-transactions
 *   body: { text: string, week?: number }
 *
 * Parses the "N Transactions" feed → player_transactions (buy/sell/add + note).
 * buy/sell also upsert player_tags so they boost the portfolio FA sweep.
 * Re-uploading a given week replaces that week's transactions.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const text: string = body?.text || '';
        const week: number | null = body?.week != null ? Number(body.week) : null;
        if (!text.trim()) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

        const parsed = parseTransactionsFeed(text);
        if (parsed.length === 0) return NextResponse.json({ error: 'No transactions parsed. Expected lines like "Add <Player>" / "Buy <Player>" / "Sell <Player>".' }, { status: 400 });

        // Name → sleeper_id (skill players by cleanseName; DEF by DEF_{ABBR}).
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
        const byName = new Map<string, string>();
        const defByAbbr = new Map<string, string>();
        for (const p of allPlayers) {
            if (p.full_name) byName.set(cleanseName(p.full_name), p.sleeper_id);
            const m = p.sleeper_id.match(/^DEF_([A-Z]{2,4})$/);
            if (m) defByAbbr.set(m[1], p.sleeper_id);
        }

        const resolveId = (t: { playerName: string; isDefense: boolean }): string | null => {
            if (t.isDefense) {
                const abbr = t.playerName.replace(/\s+DST$/i, '').trim().toUpperCase();
                return defByAbbr.get(abbr) || null;
            }
            return byName.get(cleanseName(t.playerName)) || null;
        };

        // Replace this week's rows (only if a week is provided; else append).
        if (week != null) {
            await db.delete(playerTransactions).where(eq(playerTransactions.week, week));
        }

        const unmatched: string[] = [];
        let buySell = 0;
        for (const t of parsed) {
            const sleeperId = resolveId(t);
            if (!sleeperId) unmatched.push(t.playerName);

            await db.insert(playerTransactions).values({
                sleeper_id: sleeperId,
                player_name: t.playerName,
                action: t.action,
                note: t.note || null,
                week,
            });

            // buy/sell → mirror into the global tag board (feeds the FA sweep).
            if (sleeperId && (t.action === 'buy' || t.action === 'sell')) {
                buySell++;
                await db.insert(playerTags)
                    .values({ sleeper_id: sleeperId, tag: t.action, note: t.note?.slice(0, 500) || null })
                    .onConflictDoUpdate({ target: playerTags.sleeper_id, set: { tag: t.action, note: t.note?.slice(0, 500) || null, updated_at: new Date() } });
            }
        }

        const counts = parsed.reduce((acc, t) => { acc[t.action] = (acc[t.action] || 0) + 1; return acc; }, {} as Record<string, number>);
        return NextResponse.json({
            success: true,
            week,
            parsed: parsed.length,
            counts,
            taggedBuySell: buySell,
            unmatched: unmatched.length,
            unmatchedNames: unmatched,
        });
    } catch (error: any) {
        console.error('[upload-transactions] error', error?.stack || error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
