import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, weeklyRankings } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { cleanseName } from "@/lib/nameUtils";
import { getSleeperMatchups, normalizeSleeperStarterId } from "@/lib/sleeper";
import { getFleaflickerWeekMatchups } from "@/lib/fleaflicker";
import { resolveYahooMatchup, resolveMyffpcMatchup } from "@/lib/db-matchups";
import { getLatestWeek } from "@/lib/weekly-rankings";
import { getWeekSchedule } from "@/lib/nfl-schedule";
import { getLiveGameStates } from "@/lib/nfl-live";
import { getLivePlayerStats } from "@/lib/nfl-live-stats";
import type { LivePoints } from "@/lib/rooting-guide";
import {
    buildRootingGuide,
    type LeagueMatchupInput,
    type PlayerGameInfo,
} from "@/lib/rooting-guide";

export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/rooting-guide
 * Body: { refs: Array<{ platform, leagueId, leagueName, myRosterId }> }
 *   - myRosterId: for sleeper = the numeric roster_id (string); for fleaflicker =
 *     the team id (string). Both come from the client's useMyTeams selection.
 *
 * Resolves each league's my-starters vs H2H-opponent-starters for the current
 * week (Sleeper + Fleaflicker only in this version), then builds the rooting
 * guide grouped by real NFL game. Yahoo/MyFFPC are intentionally not included yet.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const refs: Array<{ platform: string; leagueId: string; leagueName?: string; myRosterId?: string | null }> = body?.refs || [];

        const week = await getLatestWeek();
        const leagues: LeagueMatchupInput[] = [];
        const unresolved: string[] = [];

        for (const ref of refs) {
            const label = ref.leagueName || `${ref.platform} ${ref.leagueId}`;
            if (!ref.myRosterId) { unresolved.push(`${label} (no team selected)`); continue; }

            let resolved: LeagueMatchupInput | null = null;
            if (ref.platform === "sleeper" && week != null) {
                resolved = await resolveSleeper(ref.leagueId, ref.myRosterId, label, week);
            } else if (ref.platform === "fleaflicker" && week != null) {
                resolved = await resolveFleaflicker(ref.leagueId, ref.myRosterId, label, week);
            } else if (ref.platform === "yahoo") {
                resolved = await resolveYahooMatchup(ref.leagueId, ref.myRosterId, label);
            } else if (ref.platform === "myffpc") {
                resolved = await resolveMyffpcMatchup(ref.leagueId, ref.myRosterId, label);
            } else {
                continue;
            }

            if (resolved) leagues.push(resolved);
            else unresolved.push(label);
        }

        // Build the sleeper_id → NFL game lookup for every started player.
        const allStarterIds = [...new Set(leagues.flatMap(l => [...l.myStarterIds, ...l.oppStarterIds]))];
        const gameInfo = await buildGameInfo(allStarterIds, week);

        // Live NFL game-state (ESPN) — uniform across all platforms.
        const liveStates = await getLiveGameStates();

        // Live per-player points, computed uniformly (half-PPR) from ESPN box
        // scores for games that have started. Name-matched to sleeper_id so it
        // applies to EVERY platform's players consistently.
        const livePoints = await buildLivePoints(liveStates);

        const guide = buildRootingGuide(leagues, gameInfo, week, livePoints);
        guide.unresolvedLeagues = unresolved;

        // Stamp each game with its NFL day/slot from the schedule, then order by
        // kickoff (day, then time). UNKNOWN bucket sinks to the bottom.
        if (week != null) {
            const schedule = await getWeekSchedule(week);
            for (const g of guide.games) {
                const sg = schedule.get(g.gameKey);
                if (sg) {
                    g.slot = sg.slot; g.slotOrder = sg.slotOrder;
                    g.weekday = sg.weekday; g.gametime = sg.gametime; g.kickoffSort = sg.kickoffSort;
                } else {
                    g.slot = null; g.slotOrder = 99; g.kickoffSort = 999999;
                }
                // Live score/clock, with scores aligned to g.teams[0]/[1].
                const ls = liveStates.get(g.gameKey);
                if (ls) {
                    const t0IsHome = g.teams[0] === ls.home;
                    g.live = {
                        state: ls.state,
                        homeScore: ls.homeScore,
                        awayScore: ls.awayScore,
                        shortLabel: ls.shortLabel,
                        teamScores: t0IsHome ? [ls.homeScore, ls.awayScore] : [ls.awayScore, ls.homeScore],
                    };
                } else {
                    g.live = null;
                }
            }
            guide.games.sort((a, b) => (a.kickoffSort ?? 999999) - (b.kickoffSort ?? 999999) || (b.forCount + b.againstCount) - (a.forCount + a.againstCount));
        }

        return NextResponse.json({ guide });
    } catch (err) {
        console.error("[rooting-guide] error", err);
        return NextResponse.json({ error: "Failed to build rooting guide" }, { status: 500 });
    }
}

// ── Sleeper ───────────────────────────────────────────────────────────────
async function resolveSleeper(leagueId: string, myRosterId: string, leagueName: string, week: number): Promise<LeagueMatchupInput | null> {
    const entries = await getSleeperMatchups(leagueId, week);
    if (entries.length === 0) return null;
    const mine = entries.find(e => String(e.roster_id) === String(myRosterId));
    if (!mine || mine.matchup_id == null) return null;
    const opp = entries.find(e => e.matchup_id === mine.matchup_id && String(e.roster_id) !== String(myRosterId));

    // Live per-player points → keyed by NORMALIZED sleeper_id (DEF_{ABBR}) to
    // match the starter ids and the players table.
    const pointsById: Record<string, number> = {};
    for (const e of [mine, opp]) {
        if (!e) continue;
        for (const [rawId, pts] of Object.entries(e.players_points)) {
            if (typeof pts === 'number') pointsById[normalizeSleeperStarterId(rawId)] = pts;
        }
    }

    return {
        leagueId, leagueName, platform: "sleeper",
        myStarterIds: mine.starters.map(normalizeSleeperStarterId),
        oppStarterIds: (opp?.starters || []).map(normalizeSleeperStarterId),
        lastSynced: "live",
        pointsById,
    };
}

// ── Fleaflicker (starters are player NAMES → bridge to sleeper_id) ───────────
async function resolveFleaflicker(leagueId: string, myTeamId: string, leagueName: string, week: number): Promise<LeagueMatchupInput | null> {
    const matchups = await getFleaflickerWeekMatchups(leagueId, week);
    if (matchups.length === 0) return null;
    const myId = Number(myTeamId);
    const game = matchups.find(m => m.homeTeamId === myId || m.awayTeamId === myId);
    if (!game) return null;
    const iAmHome = game.homeTeamId === myId;
    const myNames = iAmHome ? game.homeStarterNames : game.awayStarterNames;
    const oppNames = iAmHome ? game.awayStarterNames : game.homeStarterNames;

    // Bridge names → sleeper_id.
    const idByName = await nameToSleeperIdMap();
    const toIds = (names: string[]) => names.map(n => idByName.get(cleanseName(n))).filter((x): x is string => !!x);
    // Live points: bridge name-keyed points → sleeper_id.
    const pointsById: Record<string, number> = {};
    for (const [name, pts] of Object.entries(game.pointsByName)) {
        const id = idByName.get(cleanseName(name));
        if (id && typeof pts === 'number') pointsById[id] = pts;
    }
    return {
        leagueId, leagueName, platform: "fleaflicker",
        myStarterIds: toIds(myNames),
        oppStarterIds: toIds(oppNames),
        opponentName: iAmHome ? game.awayTeamName : game.homeTeamName,
        lastSynced: "live",
        pointsById,
    };
}

let _nameMapCache: Map<string, string> | null = null;
async function nameToSleeperIdMap(): Promise<Map<string, string>> {
    if (_nameMapCache) return _nameMapCache;
    const rows = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
    const m = new Map<string, string>();
    for (const r of rows) if (r.full_name) m.set(cleanseName(r.full_name), r.sleeper_id);
    _nameMapCache = m;
    return m;
}

/**
 * Compute live per-player points (half-PPR, from ESPN box scores) for every
 * game that has started, keyed by sleeper_id. Only games in 'in'/'post' state
 * are fetched. ESPN athlete names are name-bridged to sleeper_id (same cleanse
 * bridge Fleaflicker uses); unmatched names are dropped.
 */
async function buildLivePoints(liveStates: Map<string, import("@/lib/nfl-live").LiveGameState>): Promise<Map<string, LivePoints>> {
    const out = new Map<string, LivePoints>();
    const played = [...liveStates.values()].filter(s => s.state === 'in' || s.state === 'post');
    if (played.length === 0) return out;

    const idByName = await nameToSleeperIdMap();
    const perGame = await Promise.all(played.map(s => getLivePlayerStats(s.eventId)));
    for (const stats of perGame) {
        for (const st of stats) {
            const id = idByName.get(cleanseName(st.name));
            if (!id) continue; // unmatched name → skip (v1 accepts a few misses)
            // If a name collides across games (rare), keep the higher point line.
            const prev = out.get(id);
            if (!prev || st.points > prev.points) {
                out.set(id, { points: st.points, usage: st.usage, usageLabel: st.usageLabel });
            }
        }
    }
    return out;
}

// ── NFL game lookup: sleeper_id → {nflTeam, nflOpponent} ─────────────────────
async function buildGameInfo(sleeperIds: string[], week: number | null): Promise<Map<string, PlayerGameInfo>> {
    const out = new Map<string, PlayerGameInfo>();
    if (sleeperIds.length === 0) return out;

    // Player metadata (name/pos/team) for everyone.
    const playerRows = await db
        .select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team })
        .from(players)
        .where(inArray(players.sleeper_id, sleeperIds));
    const metaById = new Map(playerRows.map(p => [p.sleeper_id, p]));

    // Weekly opponent per player from weekly_rankings (this week). Gives the true
    // NFL game (team + opponent). DEF/K may be absent → fall back to team-level.
    let weeklyById = new Map<string, { team: string | null; opponent: string | null }>();
    let teamOpponent = new Map<string, string>(); // NFL team abbr → its opponent this week
    if (week != null) {
        const wr = await db
            .select({ sleeper_id: weeklyRankings.sleeper_id, team: weeklyRankings.team, opponent: weeklyRankings.opponent })
            .from(weeklyRankings)
            .where(eq(weeklyRankings.week, week));
        for (const r of wr) {
            if (r.sleeper_id) weeklyById.set(r.sleeper_id, { team: r.team, opponent: r.opponent });
            if (r.team && r.opponent) teamOpponent.set(r.team.toUpperCase(), r.opponent.toUpperCase());
        }
    }

    for (const id of sleeperIds) {
        const meta = metaById.get(id);
        const wk = weeklyById.get(id);
        // Prefer weekly team/opponent; else fall back to players.team + the
        // team's weekly opponent (covers DEF/K not in the weekly upload).
        const nflTeam = (wk?.team || meta?.team || null);
        const nflOpponent = wk?.opponent
            || (nflTeam ? teamOpponent.get(nflTeam.toUpperCase()) ?? null : null);
        out.set(id, {
            full_name: meta?.full_name ?? id,
            position: meta?.position ?? null,
            nflTeam,
            nflOpponent,
        });
    }
    return out;
}
