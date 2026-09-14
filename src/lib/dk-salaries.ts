/**
 * Parse a DraftKings NFL Classic salary CSV export.
 *
 * Standard DK export columns:
 *   Position, Name + ID, Name, ID, Roster Position, Salary, Game Info, TeamAbbrev, AvgPointsPerGame
 *
 * We extract the fields the optimizer needs (name, position, salary, team, and
 * the opponent parsed from Game Info). Defenses come through as Position=DST
 * with the team name in Name; we key those by TeamAbbrev.
 *
 * Pure parser — no I/O. Tolerant of quoting and column-order variation.
 */

import type { DkPosition } from './dk-optimizer';

export interface DkSalaryEntry {
    dkId: string | null;
    name: string;
    position: DkPosition;
    salary: number;
    team: string | null;      // TeamAbbrev (our convention after fix)
    opponent: string | null;  // parsed from Game Info
    avgPoints: number | null; // DK AvgPointsPerGame (season avg; weak proxy only)
}

/** DK abbr fixes → our DB convention (mirrors nfl-schedule/nfl-live). */
const TEAM_ABBR_FIX: Record<string, string> = {
    JAC: 'JAX', LA: 'LAR', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR',
};
function fixAbbr(a: string | null | undefined): string | null {
    if (!a) return null;
    const up = a.toUpperCase().trim();
    return TEAM_ABBR_FIX[up] || up || null;
}

/** Split a CSV line respecting double-quoted fields (DK quotes "Name, Jr."). */
function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
            else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
            out.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map(s => s.trim());
}

const VALID_POS = new Set<DkPosition>(['QB', 'RB', 'WR', 'TE', 'DST']);

/**
 * Parse Game Info like "PHI@DAL 09/07/2025 08:20PM ET" → the two team abbrs,
 * so we can derive a player's opponent from their own TeamAbbrev.
 */
function parseGameTeams(gameInfo: string): [string, string] | null {
    const m = (gameInfo || '').match(/\b([A-Z]{2,4})\s*@\s*([A-Z]{2,4})\b/);
    if (!m) return null;
    return [m[1], m[2]];
}

export interface DkParseResult {
    entries: DkSalaryEntry[];
    /** Rows we couldn't use (bad position, missing salary, etc.), for reporting. */
    skipped: number;
}

export function parseDkSalariesCsv(csv: string): DkParseResult {
    const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { entries: [], skipped: 0 };

    const header = splitCsvLine(lines[0]).map(h => h.toLowerCase());
    const col = (name: string) => header.indexOf(name.toLowerCase());
    const iPos = col('position');
    const iName = col('name');
    const iSalary = col('salary');
    const iGame = col('game info');
    const iTeam = col('teamabbrev');
    const iId = col('id');
    const iAvg = col('avgpointspergame');

    // If the header isn't a recognizable DK export, bail cleanly.
    if (iPos === -1 || iName === -1 || iSalary === -1) return { entries: [], skipped: lines.length - 1 };

    const entries: DkSalaryEntry[] = [];
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
        const c = splitCsvLine(lines[i]);
        const posRaw = (c[iPos] || '').toUpperCase();
        const position = (posRaw === 'D' || posRaw === 'DEF' || posRaw === 'D/ST') ? 'DST' : posRaw;
        if (!VALID_POS.has(position as DkPosition)) { skipped++; continue; }
        const salary = parseInt((c[iSalary] || '').replace(/[^0-9]/g, ''), 10);
        if (!Number.isFinite(salary) || salary <= 0) { skipped++; continue; }
        const name = c[iName] || '';
        if (!name) { skipped++; continue; }

        const team = fixAbbr(iTeam !== -1 ? c[iTeam] : null);
        let opponent: string | null = null;
        if (iGame !== -1 && team) {
            const pair = parseGameTeams(c[iGame]);
            if (pair) {
                const [a, b] = pair.map(fixAbbr);
                opponent = a === team ? b : a;
            }
        }
        const avgRaw = iAvg !== -1 ? parseFloat(c[iAvg]) : NaN;

        entries.push({
            dkId: iId !== -1 ? (c[iId] || null) : null,
            name,
            position: position as DkPosition,
            salary,
            team,
            opponent,
            avgPoints: Number.isFinite(avgRaw) ? avgRaw : null,
        });
    }
    return { entries, skipped };
}
