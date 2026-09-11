/**
 * NFL schedule lookup for the Game-Day Rooting Guide — groups games by day/slot.
 *
 * Uses `importSchedules` from @camfleety/nfl-data-js (same nflverse source the
 * stats ingestion uses). Keyed by the CURRENT NFL season (derived from the date:
 * a season spans Sep→Feb, so Jan/Feb belong to the prior year's season).
 *
 * Schedule team abbreviations differ slightly from our DB (e.g. schedule uses
 * "LA" for the Rams); we normalize to match `weekly_rankings`/`players` abbrs.
 */

import { cache, TTL } from './cache';
import { gameKeyFor } from './rooting-guide';

export interface ScheduledGame {
    gameKey: string;      // matches rooting-guide gameKeyFor(home, away)
    away: string;
    home: string;
    weekday: string;      // 'Thursday' | 'Sunday' | 'Monday' | ...
    gametime: string;     // 'HH:MM' ET, e.g. '13:00'
    /** Slot bucket for grouping (see slotFor). */
    slot: string;
    slotOrder: number;    // for sorting day sections
    kickoffSort: number;  // weekday index * 10000 + minutes, for intra/inter ordering
}

/** Normalize a schedule team abbr to our DB convention. */
const TEAM_ABBR_FIX: Record<string, string> = {
    LA: 'LAR',   // schedule uses LA for the Rams; we use LAR
    JAC: 'JAX',
    WSH: 'WAS',
    OAK: 'LV',
    SD: 'LAC',
    STL: 'LAR',
};
function fixAbbr(a: string): string {
    const up = (a || '').toUpperCase();
    return TEAM_ABBR_FIX[up] || up;
}

/** Current NFL season year: Sep–Dec → this year; Jan–Aug → prior year season
 *  is over, but the *upcoming* season is this year once we're past ~August. */
export function currentNflSeason(now = new Date()): number {
    const y = now.getFullYear();
    const m = now.getMonth(); // 0=Jan
    // Jan–Feb: still the season that started the previous calendar year.
    if (m <= 1) return y - 1;
    return y;
}

const WEEKDAY_ORDER: Record<string, number> = {
    Thursday: 0, Friday: 1, Saturday: 2, Sunday: 3, Monday: 4,
    Wednesday: -1, Tuesday: -2, // rare openers/holidays sort earliest
};

/** Bucket a game into a display slot from its weekday + kickoff time (ET). */
function slotFor(weekday: string, gametime: string): { slot: string; slotOrder: number } {
    const [hh, mm] = (gametime || '13:00').split(':').map(n => parseInt(n, 10));
    const mins = (hh || 0) * 60 + (mm || 0);
    switch (weekday) {
        case 'Thursday': return { slot: 'Thursday Night', slotOrder: 0 };
        case 'Friday': return { slot: 'Friday', slotOrder: 1 };
        case 'Saturday': return { slot: 'Saturday', slotOrder: 2 };
        case 'Sunday':
            if (mins < 15 * 60) return { slot: 'Sunday — Early', slotOrder: 3 };          // ~1:00 ET
            if (mins < 18 * 60 + 30) return { slot: 'Sunday — Afternoon', slotOrder: 4 }; // ~4:05/4:25 ET
            return { slot: 'Sunday Night', slotOrder: 5 };                                 // ~8:20 ET
        case 'Monday': return { slot: 'Monday Night', slotOrder: 6 };
        default: return { slot: weekday || 'Other', slotOrder: 7 };
    }
}

/**
 * Get a Map of gameKey → ScheduledGame for a given season+week. Cached.
 *
 * Data source: the nflverse `games.csv` served over HTTPS via GitHub raw. We do
 * NOT use `@camfleety/nfl-data-js`'s importSchedules here because that library
 * pulls the schedule from habitatring over plain HTTP (http://www.habitatring.com/games.csv),
 * which fails on Vercel (no cleartext egress) → every game silently fell into
 * the "Other" bucket. The GitHub raw mirror is the same file over HTTPS.
 */
export async function getWeekSchedule(week: number, season?: number): Promise<Map<string, ScheduledGame>> {
    const yr = season ?? currentNflSeason();
    const cacheKey = `nfl:schedule:${yr}:${week}`;
    const cached = cache.get<ScheduledGame[]>(cacheKey, TTL.LEAGUE_DATA);
    const build = (rows: ScheduledGame[]) => new Map(rows.map(g => [g.gameKey, g]));
    if (cached) return build(cached);

    try {
        const rows = await fetchScheduleRows();
        const out: ScheduledGame[] = [];
        for (const g of rows) {
            if (g.season !== yr || g.game_type !== 'REG' || g.week !== week) continue;
            const away = fixAbbr(g.away_team);
            const home = fixAbbr(g.home_team);
            const { slot, slotOrder } = slotFor(g.weekday, g.gametime);
            const wdIdx = WEEKDAY_ORDER[g.weekday] ?? 3;
            const [hh, mm] = (g.gametime || '13:00').split(':').map((n: string) => parseInt(n, 10));
            out.push({
                gameKey: gameKeyFor(home, away),
                away, home,
                weekday: g.weekday,
                gametime: g.gametime,
                slot, slotOrder,
                kickoffSort: (wdIdx + 3) * 10000 + (hh || 0) * 60 + (mm || 0),
            });
        }
        cache.set(cacheKey, out);
        return build(out);
    } catch (err) {
        console.error(`[nfl-schedule] failed to load schedule for ${yr} week ${week}:`, err);
        return new Map();
    }
}

const SCHEDULE_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';

interface RawScheduleRow {
    season: number;
    game_type: string;
    week: number;
    weekday: string;
    gametime: string;
    away_team: string;
    home_team: string;
}

/** Fetch + parse the nflverse games.csv (all seasons). Only the columns we need
 *  are extracted; values in those columns never contain commas, so a simple
 *  split is safe (no quoted-field handling required). */
async function fetchScheduleRows(): Promise<RawScheduleRow[]> {
    const res = await fetch(SCHEDULE_URL, {
        headers: { 'user-agent': 'volatile-fantasy-football/1.0' },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`schedule fetch ${res.status} ${res.statusText}`);
    const text = await res.text();
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const header = lines[0].split(',');
    const idx = (name: string) => header.indexOf(name);
    const iSeason = idx('season'), iType = idx('game_type'), iWeek = idx('week'),
        iWeekday = idx('weekday'), iGametime = idx('gametime'),
        iAway = idx('away_team'), iHome = idx('home_team');
    const out: RawScheduleRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const c = line.split(',');
        const season = parseInt(c[iSeason], 10);
        const week = parseInt(c[iWeek], 10);
        if (!Number.isFinite(season) || !Number.isFinite(week)) continue;
        out.push({
            season, week,
            game_type: c[iType] || '',
            weekday: c[iWeekday] || '',
            gametime: c[iGametime] || '',
            away_team: c[iAway] || '',
            home_team: c[iHome] || '',
        });
    }
    return out;
}
