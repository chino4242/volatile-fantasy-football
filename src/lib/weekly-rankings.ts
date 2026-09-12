/**
 * Weekly-rankings lookup — feeds the lineup optimizer.
 *
 * Returns each requested player's weekly RANK + tiebreak context for a given
 * week (defaults to the latest uploaded week). A QB's signal comes from the 'qb'
 * list; everyone else from the 'flex' list. Players absent from the week's upload
 * come back with rank=null (the optimizer treats them as bench-worthy).
 */

import { db } from '@/db';
import { weeklyRankings } from '@/db/schema';
import { and, eq, desc, inArray } from 'drizzle-orm';

export interface WeeklyRankInfo {
    rank: number | null;
    total: number | null;
    posMatchup: number | null;
    kind: 'flex' | 'qb' | 'dst' | 'k' | null;
}

/** A weekly DST streaming ranking row (one per defense in the uploaded list). */
export interface WeeklyDstRank {
    sleeper_id: string;
    rank: number | null;
    tier: number | null;
    spread: number | null;
    opponent: string | null;
    team: string | null;
    name: string | null;
}

/** The most recent week that has any weekly_rankings rows, or null if none. */
export async function getLatestWeek(): Promise<number | null> {
    const row = await db
        .select({ week: weeklyRankings.week })
        .from(weeklyRankings)
        .orderBy(desc(weeklyRankings.week))
        .limit(1);
    return row[0]?.week ?? null;
}

function toNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

/**
 * Build a Map<sleeper_id → WeeklyRankInfo> for the given sleeper_ids and week.
 * A player present in BOTH lists (a QB could theoretically be in flex too) uses
 * the 'qb' entry when their position is QB — but the optimizer decides the pool
 * per slot, so we return whichever kind's row exists, preferring qb for QBs.
 * We simply return BOTH-aware info keyed by (sleeper_id): the caller passes the
 * player's position to pick the right kind via `rankForPosition`.
 */
export async function getWeeklyRanks(
    sleeperIds: string[],
    week?: number,
): Promise<{ week: number | null; byId: Map<string, { flex?: WeeklyRankInfo; qb?: WeeklyRankInfo; dst?: WeeklyRankInfo; k?: WeeklyRankInfo }> }> {
    const wk = week ?? (await getLatestWeek());
    const byId = new Map<string, { flex?: WeeklyRankInfo; qb?: WeeklyRankInfo; dst?: WeeklyRankInfo; k?: WeeklyRankInfo }>();
    if (wk == null || sleeperIds.length === 0) return { week: wk, byId };

    const rows = await db
        .select({
            sleeper_id: weeklyRankings.sleeper_id,
            kind: weeklyRankings.kind,
            rank: weeklyRankings.rank,
            total: weeklyRankings.total,
            pos_matchup: weeklyRankings.pos_matchup,
        })
        .from(weeklyRankings)
        .where(and(eq(weeklyRankings.week, wk), inArray(weeklyRankings.sleeper_id, sleeperIds)));

    for (const r of rows) {
        if (!r.sleeper_id) continue;
        const entry = byId.get(r.sleeper_id) || {};
        const info: WeeklyRankInfo = {
            rank: r.rank ?? null,
            total: toNum(r.total),
            posMatchup: r.pos_matchup ?? null,
            kind: (r.kind as 'flex' | 'qb' | 'dst' | 'k') ?? null,
        };
        if (r.kind === 'qb') entry.qb = info;
        else if (r.kind === 'dst') entry.dst = info;
        else if (r.kind === 'k') entry.k = info;
        else entry.flex = info;
        byId.set(r.sleeper_id, entry);
    }
    return { week: wk, byId };
}

/**
 * All DST streaming rankings for a week (the full uploaded list, not filtered to
 * a roster). Used to recommend the best available defense to stream per league.
 * Ordered by rank ascending (best first). Only rows that resolved to a DEF id.
 */
export async function getWeeklyDstRankings(week?: number): Promise<{ week: number | null; list: WeeklyDstRank[] }> {
    const wk = week ?? (await getLatestWeek());
    if (wk == null) return { week: wk, list: [] };
    const rows = await db
        .select({
            sleeper_id: weeklyRankings.sleeper_id,
            rank: weeklyRankings.rank,
            tier: weeklyRankings.tier,
            spread: weeklyRankings.spread,
            opponent: weeklyRankings.opponent,
            team: weeklyRankings.team,
            player_name: weeklyRankings.player_name,
        })
        .from(weeklyRankings)
        .where(and(eq(weeklyRankings.week, wk), eq(weeklyRankings.kind, 'dst')));

    const list: WeeklyDstRank[] = rows
        .filter(r => r.sleeper_id)
        .map(r => ({
            sleeper_id: r.sleeper_id as string,
            rank: r.rank ?? null,
            tier: r.tier ?? null,
            spread: toNum(r.spread),
            opponent: r.opponent ?? null,
            team: r.team ?? null,
            name: r.player_name ?? null,
        }))
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    return { week: wk, list };
}

/**
 * Resolve the correct weekly rank for a player given its position:
 *  - QB → the 'qb' list rank.
 *  - everyone else → the 'flex' list rank.
 * Falls back to whichever exists (a QB with only a flex row, etc.).
 */
export function rankForPosition(
    position: string | null,
    entry: { flex?: WeeklyRankInfo; qb?: WeeklyRankInfo; dst?: WeeklyRankInfo; k?: WeeklyRankInfo } | undefined,
): WeeklyRankInfo {
    const empty: WeeklyRankInfo = { rank: null, total: null, posMatchup: null, kind: null };
    if (!entry) return empty;
    if (position === 'QB') return entry.qb ?? entry.flex ?? empty;
    if (position === 'DEF' || position === 'DST') return entry.dst ?? empty;
    if (position === 'K' || position === 'PK') return entry.k ?? empty;
    return entry.flex ?? entry.qb ?? empty;
}



// ── Glue: build optimizer input from a roster + weekly ranks, run the engine ──

import { buildSlots, optimizeAndDiff, type OptimizerPlayer, type OptimizerResult } from './lineup-optimizer';

/** Minimal roster-player shape the optimizer glue needs (any platform can map to this). */
export interface RosterPlayerLite {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    is_starter: boolean;
}

export interface TeamOptimization extends OptimizerResult {
    week: number | null;
    hasWeeklyData: boolean; // false when no rankings exist for the week
}

/**
 * Compute the lineup optimization for one team. Platform-agnostic: caller passes
 * the roster (with is_starter) + the league's roster_positions. Returns the
 * optimal lineup, the swaps vs current, and which week drove it.
 */
export async function optimizeTeam(
    roster: RosterPlayerLite[],
    rosterPositions: string[] | null | undefined,
    week?: number,
): Promise<TeamOptimization> {
    const slots = buildSlots(rosterPositions);
    const ids = roster.map(r => r.sleeper_id);
    const { week: wk, byId } = await getWeeklyRanks(ids, week);

    const players: OptimizerPlayer[] = roster.map(r => {
        const info = rankForPosition(r.position, byId.get(r.sleeper_id));
        return {
            sleeper_id: r.sleeper_id,
            full_name: r.full_name,
            position: r.position,
            rank: info.rank,
            total: info.total,
            posMatchup: info.posMatchup,
            isStarter: r.is_starter,
        };
    });

    const result = optimizeAndDiff(players, slots);
    const hasWeeklyData = players.some(p => p.rank != null);
    return { ...result, week: wk, hasWeeklyData };
}
