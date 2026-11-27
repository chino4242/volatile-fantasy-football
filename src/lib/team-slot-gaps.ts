/**
 * Team-page slot gaps — server helper (DB access lives here so `slot-gaps.ts`
 * stays pure and unit-testable).
 *
 * Modeled on `getTeamWaiverUpgrades`, but built to answer "is there a better free
 * agent for each starting slot?" without the blind spots of the value-capped list
 * the team pages build. Candidates are the union of:
 *   1. the page's own free-agent list (top ~300 by FantasyCalc value),
 *   2. unrostered kickers from the uploaded kicker ranking (K has no FC value),
 *   3. unrostered players that are RANKED THIS WEEK (flex/qb lists) but may have
 *      little or no dynasty value — the "good weekly play I never see" case.
 * ROS fields are fetched here for every candidate and roster player in one query,
 * so the pages don't each have to select them.
 *
 * Does NOT change `getTeamWaiverUpgrades` behavior or output.
 */

import { db } from '@/db';
import { players, playerValues, weeklyRankings } from '@/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getLatestWeek, getWeeklyKickerRankings, getWeeklyRanks } from './weekly-rankings';
import { toPortfolioPlayer, type UpgradeSourcePlayer } from './team-waiver-upgrades';
import { findWaiverUpgrades } from './waiver-upgrades';
import { computeSlotGaps, dedupeById, type SlotGap } from './slot-gaps';
import { blendedKeepValue, KEEP_SCALE, type PortfolioLeagueType, type PortfolioTeam } from './portfolio';

/** Max extra weekly-ranked, unrostered players added beyond the page's FA list. */
export const WEEKLY_CANDIDATE_LIMIT = 150;

export interface TeamSlotGapsResult {
    gaps: SlotGap[];
    /** The week the weekly ranks are for (null when none uploaded). */
    week: number | null;
    /** True when any roster/free-agent player carries a weekly rank. */
    hasWeeklyData: boolean;
}

export interface TeamSlotGapsOptions {
    coreCapacity?: number;
    startedTeams?: Set<string>;
    /** sleeper_ids rostered by ANY team in the league (decides availability). */
    rosteredInLeague?: Set<string>;
}

function num(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

/** Unrostered players ranked this week in the flex/qb lists (best first). */
async function weeklyRankedCandidates(
    week: number,
    rostered: Set<string>,
): Promise<UpgradeSourcePlayer[]> {
    const rows = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
        })
        .from(weeklyRankings)
        .innerJoin(players, eq(players.sleeper_id, weeklyRankings.sleeper_id))
        .where(and(
            eq(weeklyRankings.week, week),
            inArray(weeklyRankings.kind, ['flex', 'qb']),
            inArray(players.position, ['QB', 'RB', 'WR', 'TE']),
        ))
        .orderBy(asc(weeklyRankings.rank))
        .limit(WEEKLY_CANDIDATE_LIMIT * 3); // headroom: many top-ranked players are rostered

    const out: UpgradeSourcePlayer[] = [];
    for (const r of rows) {
        if (!r.sleeper_id || rostered.has(r.sleeper_id)) continue;
        out.push({
            sleeper_id: r.sleeper_id, full_name: r.full_name, position: r.position,
            team: r.team, fc_value: null,
        });
        if (out.length >= WEEKLY_CANDIDATE_LIMIT) break;
    }
    return out;
}

type RosInfo = Pick<UpgradeSourcePlayer,
    'rank_ros_overall' | 'rank_ros_pos' | 'rank_ros_ppg' | 'ros_sos' | 'ros_next4_sos' | 'bye_week'>;

async function rosByIds(ids: string[]): Promise<Map<string, RosInfo>> {
    const out = new Map<string, RosInfo>();
    if (ids.length === 0) return out;
    const rows = await db
        .select({
            sleeper_id: playerValues.sleeper_id,
            rank_ros_overall: playerValues.rank_ros_overall,
            rank_ros_pos: playerValues.rank_ros_pos,
            rank_ros_ppg: playerValues.rank_ros_ppg,
            ros_sos: playerValues.ros_sos,
            ros_next4_sos: playerValues.ros_next4_sos,
            bye_week: playerValues.bye_week,
        })
        .from(playerValues)
        .where(inArray(playerValues.sleeper_id, ids));
    for (const r of rows) {
        out.set(r.sleeper_id, {
            rank_ros_overall: r.rank_ros_overall,
            rank_ros_pos: r.rank_ros_pos,
            rank_ros_ppg: num(r.rank_ros_ppg),
            ros_sos: r.ros_sos,
            ros_next4_sos: r.ros_next4_sos,
            bye_week: r.bye_week,
        });
    }
    return out;
}

export async function getTeamSlotGaps(
    myPlayers: UpgradeSourcePlayer[],
    freeAgents: UpgradeSourcePlayer[],
    rosterPositions: string[] | null | undefined,
    leagueType: PortfolioLeagueType,
    opts: TeamSlotGapsOptions = {},
): Promise<TeamSlotGapsResult> {
    const empty: TeamSlotGapsResult = { gaps: [], week: null, hasWeeklyData: false };
    if (!rosterPositions || rosterPositions.length === 0) return empty;

    const rostered = opts.rosteredInLeague ?? new Set<string>();
    const startsKicker = rosterPositions.some(t => {
        const u = (t || '').toUpperCase();
        return u === 'K' || u === 'PK';
    });

    // Candidate sources 2 + 3 are best-effort: a failure just narrows the pool.
    const kickerFAs: UpgradeSourcePlayer[] = [];
    if (startsKicker) {
        try {
            const kr = await getWeeklyKickerRankings();
            for (const k of kr.list) {
                if (!k.sleeper_id || rostered.has(k.sleeper_id)) continue;
                kickerFAs.push({
                    sleeper_id: k.sleeper_id, full_name: k.name ?? k.sleeper_id, position: 'K',
                    team: k.team, fc_value: null,
                });
            }
        } catch { /* skip kicker FAs on failure */ }
    }

    let weekly: UpgradeSourcePlayer[] = [];
    let latestWeek: number | null = null;
    try {
        latestWeek = await getLatestWeek();
        if (latestWeek != null) weekly = await weeklyRankedCandidates(latestWeek, rostered);
    } catch { /* skip weekly-ranked candidates on failure */ }

    const allFas = dedupeById([...freeAgents, ...kickerFAs, ...weekly])
        .filter(p => !rostered.has(p.sleeper_id));
    const myIds = new Set(myPlayers.map(p => p.sleeper_id));
    const allIds = [...new Set([...myIds, ...allFas.map(p => p.sleeper_id)])];

    // One query each for ROS detail and this week's ranks.
    let ros = new Map<string, RosInfo>();
    try { ros = await rosByIds(allIds); } catch { /* ROS horizon just goes quiet */ }
    const { week, byId } = await getWeeklyRanks(allIds, latestWeek ?? undefined);

    // Fill ROS fields only where the source player doesn't already carry them.
    const withRos = (p: UpgradeSourcePlayer): UpgradeSourcePlayer => {
        const r = ros.get(p.sleeper_id);
        if (!r) return p;
        return {
            ...p,
            rank_ros_overall: p.rank_ros_overall ?? r.rank_ros_overall,
            rank_ros_pos: p.rank_ros_pos ?? r.rank_ros_pos,
            rank_ros_ppg: p.rank_ros_ppg ?? r.rank_ros_ppg,
            ros_sos: p.ros_sos ?? r.ros_sos,
            ros_next4_sos: p.ros_next4_sos ?? r.ros_next4_sos,
            bye_week: p.bye_week ?? r.bye_week,
        };
    };
    const team: PortfolioTeam = {
        rosterId: 'me',
        ownerName: 'me',
        players: myPlayers.map(p => toPortfolioPlayer(withRos(p), byId)),
    };
    const fas = allFas.map(p => toPortfolioPlayer(withRos(p), byId));

    const upgrades = findWaiverUpgrades(team, fas, rosterPositions, leagueType, {
        coreCapacity: opts.coreCapacity,
        actualCoreCount: myPlayers.length,
        startedTeams: opts.startedTeams,
        maxSuggestions: 25,
        longTermValueOf: blendedKeepValue,
        blockAtValue: KEEP_SCALE.BLOCK,
        cautionAtValue: KEEP_SCALE.CAUTION,
    });

    const gaps = computeSlotGaps({
        roster: team.players,
        freeAgents: fas,
        rosterPositions,
        startedTeams: opts.startedTeams,
        upgrades,
    });

    const hasWeeklyData = team.players.some(p => p.weeklyRank != null) || fas.some(p => p.weeklyRank != null);
    return { gaps, week, hasWeeklyData };
}
