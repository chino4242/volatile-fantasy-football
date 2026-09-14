/**
 * Option A projection model — turn a positional RANK into a synthetic DK-scored
 * projection, since we don't have per-player point projections.
 *
 * Inputs available per player:
 *  - a positional rank (QB 1..25, flex/RB-WR-TE combined 1..100, DST 1..25)
 *  - the DK salary (from the CSV)
 *  - the implied team total (Vegas) — tiebreaker only, NOT part of the projection
 *
 * We map rank → projected DK (full-PPR) points via a decaying curve per pool,
 * calibrated to typical weekly DK scoring. These curves are the one modeling
 * assumption; they're named constants so they're easy to tune after seeing real
 * lineups. A player the site didn't rank has no projection → excluded (the user
 * chose "only the site's plays").
 */

import { cleanseName } from './nameUtils';
import type { DkCandidate } from './dk-optimizer';
import type { DkSalaryEntry } from './dk-salaries';

/**
 * Decaying rank→points curve. `top` = points at rank 1, `floor` = asymptotic
 * points for deep ranks, `k` = decay rate (higher = faster falloff). Calibrated
 * to full-PPR DK weekly scoring.
 */
interface Curve { top: number; floor: number; k: number; }

// QB: elite ~26, streamers ~15. Flex (combined RB/WR/TE PPR): elite ~24 down to
// ~6 by rank ~60. DST: ~10 down to ~4.
const CURVES: Record<'qb' | 'flex' | 'dst', Curve> = {
    qb: { top: 26, floor: 13, k: 0.06 },
    flex: { top: 24, floor: 5, k: 0.035 },
    dst: { top: 10, floor: 3, k: 0.10 },
};

/** Exponential decay: rank 1 → top, → floor as rank grows. */
function projFromRank(rank: number, c: Curve): number {
    const r = Math.max(1, rank);
    const v = c.floor + (c.top - c.floor) * Math.exp(-c.k * (r - 1));
    return Math.round(v * 100) / 100;
}

/** Which curve a DK position uses. RB/WR/TE all read the combined flex rank. */
function poolForPosition(pos: string): 'qb' | 'flex' | 'dst' {
    if (pos === 'QB') return 'qb';
    if (pos === 'DST') return 'dst';
    return 'flex';
}

/** A weekly rank row keyed for lookup (from the DB). */
export interface WeeklyRankRow {
    kind: 'flex' | 'qb' | 'dst' | 'k';
    rank: number | null;
    player_name: string | null;
    team: string | null;      // used for flex/qb (players' NFL team)
    sleeper_id: string | null; // used for DST → DEF_{ABBR}
    total: number | null;     // implied team total (tiebreaker)
    opponent: string | null;
}

export interface BuildPoolResult {
    pool: DkCandidate[];
    /** DK entries we couldn't map to a rank (excluded), for reporting. */
    unranked: { name: string; position: string; salary: number }[];
}

/**
 * Join DK salary entries to weekly rank rows and produce the optimizer pool.
 *  - QB / RB / WR / TE  → matched by cleansed name against flex/qb rows.
 *  - DST                → matched by team abbr against dst rows.
 * Unranked DK entries are excluded (only the site's plays are optimized).
 */
export function buildDkPool(entries: DkSalaryEntry[], weekly: WeeklyRankRow[]): BuildPoolResult {
    // Name → {rank,total} for flex + qb pools.
    const flexByName = new Map<string, WeeklyRankRow>();
    const qbByName = new Map<string, WeeklyRankRow>();
    const dstByTeam = new Map<string, WeeklyRankRow>();
    for (const r of weekly) {
        if (r.kind === 'flex' && r.player_name) flexByName.set(cleanseName(r.player_name), r);
        else if (r.kind === 'qb' && r.player_name) qbByName.set(cleanseName(r.player_name), r);
        else if (r.kind === 'dst') {
            // DST rows carry sleeper_id = DEF_{ABBR}; the `team` column is null.
            const abbr = (r.sleeper_id || '').match(/^DEF_([A-Z]{2,4})$/)?.[1];
            if (abbr) dstByTeam.set(abbr.toUpperCase(), r);
        }
    }

    const pool: DkCandidate[] = [];
    const unranked: BuildPoolResult['unranked'] = [];

    for (const e of entries) {
        let row: WeeklyRankRow | undefined;
        if (e.position === 'QB') row = qbByName.get(cleanseName(e.name));
        else if (e.position === 'DST') row = e.team ? dstByTeam.get(e.team.toUpperCase()) : undefined;
        else row = flexByName.get(cleanseName(e.name)); // RB/WR/TE → flex pool

        if (!row || row.rank == null) {
            unranked.push({ name: e.name, position: e.position, salary: e.salary });
            continue;
        }
        const projection = projFromRank(row.rank, CURVES[poolForPosition(e.position)]);
        pool.push({
            id: e.dkId || `${cleanseName(e.name)}:${e.team ?? ''}`,
            name: e.name,
            position: e.position,
            salary: e.salary,
            projection,
            team: e.team,
            teamTotal: row.total, // implied team total (tiebreaker only)
            opponent: e.opponent,
        });
    }

    return { pool, unranked };
}

export { projFromRank, CURVES };
