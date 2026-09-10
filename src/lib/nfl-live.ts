/**
 * Live NFL game-state from ESPN's public scoreboard — the UNIFORM live layer for
 * the For & Against page. Unlike per-platform fantasy points (Sleeper/FF only),
 * this covers every real NFL game the same way, so even Yahoo/MyFFPC games show
 * live score/quarter/clock.
 *
 * Public, unauthenticated, HTTP-only (Vercel-safe). Polled with a short LIVE TTL.
 * Keyed by the same gameKey the rooting-guide engine uses (sorted team pair).
 */

import { cache, TTL } from './cache';
import { gameKeyFor } from './rooting-guide';

const ESPN_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/** ESPN abbr → our DB convention (mirrors nfl-schedule's fixAbbr). */
const TEAM_ABBR_FIX: Record<string, string> = {
    LA: 'LAR', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR',
};
function fixAbbr(a: string): string {
    const up = (a || '').toUpperCase();
    return TEAM_ABBR_FIX[up] || up;
}

export interface LiveGameState {
    /** 'pre' | 'in' | 'post' */
    state: 'pre' | 'in' | 'post';
    /** Home/away abbrs (normalized) + scores. */
    home: string;
    away: string;
    homeScore: number | null;
    awayScore: number | null;
    /** Quarter (1-4, 5=OT) when in-progress. */
    period: number | null;
    /** Display clock, e.g. "10:32". */
    clock: string | null;
    /** Short status, e.g. "Final", "Q3 10:32", "Sun 1:00 PM". */
    shortLabel: string;
}

/** Fetch the current NFL scoreboard and index it by rooting-guide gameKey. */
export async function getLiveGameStates(): Promise<Map<string, LiveGameState>> {
    const cacheKey = 'nfl:live:scoreboard';
    const cached = cache.get<Map<string, LiveGameState>>(cacheKey, TTL.LIVE);
    if (cached) return cached;

    const out = new Map<string, LiveGameState>();
    try {
        const res = await fetch(ESPN_SCOREBOARD, { headers: { 'user-agent': 'Mozilla/5.0' }, cache: 'no-store' });
        if (!res.ok) return out;
        const j: any = await res.json();
        for (const ev of j?.events || []) {
            const comp = ev?.competitions?.[0];
            if (!comp) continue;
            const competitors = comp.competitors || [];
            const homeC = competitors.find((c: any) => c.homeAway === 'home');
            const awayC = competitors.find((c: any) => c.homeAway === 'away');
            const home = fixAbbr(homeC?.team?.abbreviation || '');
            const away = fixAbbr(awayC?.team?.abbreviation || '');
            if (!home || !away) continue;

            const st = ev?.status?.type?.state; // 'pre' | 'in' | 'post'
            const state: LiveGameState['state'] = st === 'in' ? 'in' : st === 'post' ? 'post' : 'pre';
            const period = typeof ev?.status?.period === 'number' ? ev.status.period : null;
            const clock = ev?.status?.displayClock || null;
            const homeScore = numOrNull(homeC?.score);
            const awayScore = numOrNull(awayC?.score);

            const shortLabel = labelFor(state, period, clock, ev?.status?.type?.shortDetail);

            const gs: LiveGameState = { state, home, away, homeScore, awayScore, period, clock, shortLabel };
            // Index by the sorted team-pair key so it lines up with RootingGame.gameKey.
            out.set(gameKeyFor(home, away), gs);
        }
        cache.set(cacheKey, out);
    } catch { /* network/parse error → empty */ }
    return out;
}

function numOrNull(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
}

function labelFor(state: 'pre' | 'in' | 'post', period: number | null, clock: string | null, fallback?: string): string {
    if (state === 'post') return 'Final';
    if (state === 'in') {
        const q = period == null ? '' : period > 4 ? 'OT' : `Q${period}`;
        return [q, clock].filter(Boolean).join(' ') || (fallback || 'Live');
    }
    return fallback || 'Scheduled';
}
