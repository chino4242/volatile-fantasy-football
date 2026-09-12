/**
 * Weekly kicker rankings scraped from Subvertadown's "Subvertacuck" page.
 *
 * The page publishes a ranked kicker list (player, NFL team, weekly matchup,
 * and a projected score) that auto-advances the NFL week. We scrape it, bridge
 * each name to a sleeper_id (kickers are seeded into `players` by
 * scripts/ingest-kickers.ts), and expose a ranked list the Action Center uses to
 * recommend streaming the best available kicker — mirroring the DST streaming
 * feature. Read-only, cached with a short TTL (we don't hammer the source), and
 * HTTP-only (Vercel-safe).
 */

import { load } from 'cheerio';
import { cache, TTL } from './cache';
import { db } from '@/db';
import { players, weeklyRankings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { cleanseName } from './nameUtils';

const SOURCE_URL = 'https://subvertadown.com/subvertacuck';

/** NFL team abbr fixes → our DB convention (mirrors nfl-schedule/nfl-live). */
const TEAM_ABBR_FIX: Record<string, string> = {
    JAC: 'JAX', LA: 'LAR', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR',
};
function fixAbbr(a: string): string {
    const up = (a || '').toUpperCase().trim();
    return TEAM_ABBR_FIX[up] || up;
}

export interface KickerRank {
    /** Matched sleeper_id (from the seeded kicker players), or null if unmatched. */
    sleeper_id: string | null;
    /** Player name as published. */
    name: string;
    /** Kicker's NFL team abbr (our convention). */
    team: string | null;
    /** Opponent NFL team abbr this week (our convention). */
    opponent: string | null;
    /** 1-based rank (list order). */
    rank: number;
    /** Projected score from the source (higher = better). */
    score: number | null;
}

export interface KickerRankings {
    week: number | null;
    list: KickerRank[];
}

/** Parse the Subvertadown HTML into ranked kicker rows (before name→id bridge). */
export function parseKickerHtml(html: string): { week: number | null; rows: Omit<KickerRank, 'sleeper_id'>[] } {
    const $ = load(html);

    // Week: a header cell like "Wk 1".
    let week: number | null = null;
    $('th').each((_, el) => {
        const m = $(el).text().match(/Wk\s+(\d+)/i);
        if (m) week = parseInt(m[1], 10);
    });

    const rows: Omit<KickerRank, 'sleeper_id'>[] = [];
    $('tr.sub-table-row').each((i, el) => {
        const row = $(el);
        // Kicker's team is encoded in the row id: id="row-LAC".
        const idTeam = (row.attr('id') || '').replace(/^row-/, '');

        // First cell = player name (take the first non-empty text node / the
        // leading text before nested profile blocks).
        const cells = row.find('td');
        const nameCell = cells.first();
        // The name appears multiple times (visible + profile popup); the first
        // trimmed text line is the display name.
        const name = (nameCell.text().split('\n').map(s => s.trim()).find(Boolean) || '').trim();

        // Opponent: the matchup cell holds "{TEAM} vs./@  {OPP}". Pull all abbr
        // tokens and take the one that isn't the kicker's team.
        const rowText = row.text().replace(/\s+/g, ' ').trim();
        const away = / @ /.test(rowText); // '@' = away game (context only)
        // Score: the last decimal number in the row (e.g. "10.0").
        const scoreMatches = rowText.match(/\b(\d+\.\d)\b/g);
        const score = scoreMatches && scoreMatches.length ? parseFloat(scoreMatches[scoreMatches.length - 1]) : null;

        // Opponent abbr: find 2-4 letter uppercase tokens in the matchup that
        // aren't the kicker's team. The matchup cell text is like "LAC vs. ARI".
        const matchupCell = cells.eq(1);
        const abbrs = (matchupCell.text().match(/\b[A-Z]{2,4}\b/g) || []).map(fixAbbr);
        const team = fixAbbr(idTeam);
        const opponent = abbrs.find(a => a !== team) ?? null;

        if (!name) return;
        rows.push({ name, team: team || null, opponent, rank: i + 1, score });
        void away;
    });

    return { week, rows };
}

/** Fetch + parse + name-bridge the current weekly kicker rankings. Cached. */
export async function getWeeklyKickerRankings(): Promise<KickerRankings> {
    const cacheKey = 'kicker:subvertadown';
    const cached = cache.get<KickerRankings>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    try {
        const res = await fetch(SOURCE_URL, {
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; volatile-fantasy-football/1.0)' },
            cache: 'no-store',
        });
        if (!res.ok) return { week: null, list: [] };
        const html = await res.text();
        const { week, rows } = parseKickerHtml(html);
        if (rows.length === 0) return { week: null, list: [] };

        // Bridge names → sleeper_id via the seeded kicker rows.
        const kickerRows = await db
            .select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
            .from(players)
            .where(eq(players.position, 'K'));
        const idByName = new Map<string, string>();
        for (const k of kickerRows) if (k.full_name) idByName.set(cleanseName(k.full_name), k.sleeper_id);

        const list: KickerRank[] = rows.map(r => ({
            ...r,
            sleeper_id: idByName.get(cleanseName(r.name)) ?? null,
        }));

        const result: KickerRankings = { week, list };
        cache.set(cacheKey, result);
        // Write-through: keep weekly_rankings (kind='k') in sync so the lineup
        // optimizer can rank kickers for start/sit. Throttled by the cache TTL
        // (we only reach here on a cache miss). Best-effort — never block reads.
        void persistKickerRankings(result).catch(err =>
            console.error('[kicker-rankings] persist failed:', err));
        return result;
    } catch (err) {
        console.error('[kicker-rankings] scrape failed:', err);
        return { week: null, list: [] };
    }
}

/**
 * Persist the scraped kicker rankings into weekly_rankings (kind='k') so the
 * lineup optimizer can rank kickers for start/sit — same table/shape the
 * flex/qb/dst weekly ranks use. Replaces the week's kicker rows (delete +
 * insert). Only matched rows (real sleeper_id) are written. No-op if week is
 * unknown or there are no matched kickers.
 */
export async function persistKickerRankings(data: KickerRankings): Promise<void> {
    const { week, list } = data;
    if (week == null) return;
    const matched = list.filter(k => k.sleeper_id);
    if (matched.length === 0) return;

    await db.delete(weeklyRankings).where(and(eq(weeklyRankings.week, week), eq(weeklyRankings.kind, 'k')));
    await db.insert(weeklyRankings).values(matched.map(k => ({
        sleeper_id: k.sleeper_id as string,
        week,
        kind: 'k' as const,
        rank: k.rank,
        position: 'K',
        team: k.team,
        opponent: k.opponent,
        total: k.score != null ? String(k.score) : null, // decimal column
        player_name: k.name,
    })));
}
