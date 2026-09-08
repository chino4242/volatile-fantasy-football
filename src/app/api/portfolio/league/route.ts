import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, playerValues, playerTags, playerTransactions } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cleanseName } from "@/lib/nameUtils";
import { getLeagueData, getSleeperRosterPositions } from "@/lib/sleeper";
import { getFleaflickerLeague, getFleaflickerWeekLineups } from "@/lib/fleaflicker";
import { getDbLeagueData, type DbPlatform } from "@/lib/db-league-data";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";
import {
    type PortfolioLeague,
    type PortfolioPlayer,
    type PortfolioFormat,
    type PortfolioLeagueType,
    type PortfolioPlatform,
    formatColumns,
    toPortfolioPlayer,
} from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/league?platform=&leagueId=&format=&type=&name=
 *
 * Returns ONE league normalized to the format-resolved PortfolioLeague shape,
 * for any of the 4 platforms. Format is resolved ONCE here (from the ?format=
 * the client passes, sourced from per-league auth state / leagues.scoring_format)
 * so nothing downstream re-picks a lens.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const platform = searchParams.get("platform") as PortfolioPlatform | null;
        const leagueId = searchParams.get("leagueId");
        const format = (searchParams.get("format") === "sf" ? "sf" : "1qb") as PortfolioFormat;
        const leagueType = (["dynasty", "keeper", "redraft"].includes(searchParams.get("type") || "")
            ? searchParams.get("type")
            : "dynasty") as PortfolioLeagueType;
        const nameParam = searchParams.get("name") || undefined;

        if (!platform || !leagueId) {
            return NextResponse.json({ error: "Missing platform or leagueId" }, { status: 400 });
        }

        let result: PortfolioLeague;
        if (platform === "sleeper") {
            result = await buildSleeper(leagueId, format, leagueType, nameParam);
        } else if (platform === "fleaflicker") {
            result = await buildFleaflicker(leagueId, format, leagueType, nameParam);
        } else if (platform === "yahoo" || platform === "myffpc") {
            result = await buildDb(platform, leagueId, format, leagueType);
        } else {
            return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 });
        }

        await stampTags(result);
        await stampWeekly(result);
        return NextResponse.json({ league: result });
    } catch (err) {
        console.error("[portfolio/league] error", err);
        return NextResponse.json({ error: "Failed to build portfolio league" }, { status: 500 });
    }
}

// ── Sleeper: roster player ids join directly to players.sleeper_id ────────────
async function buildSleeper(
    leagueId: string,
    format: PortfolioFormat,
    leagueType: PortfolioLeagueType,
    name?: string,
): Promise<PortfolioLeague> {
    const cols = formatColumns(format, leagueType);
    const { users, rosters } = await getLeagueData(leagueId);
    const rosterPositions = await getSleeperRosterPositions(leagueId);

    const rosteredIds = [...new Set(rosters.flatMap(r => r.players || []))];
    const valueRows = await selectValueRows([...rosteredIds]);
    const byId = new Map(valueRows.map(r => [String(r.sleeper_id), r]));

    const ownerName = (ownerId: string) =>
        users.find(u => u.user_id === ownerId)?.display_name || `Team`;

    const teams = rosters.map(r => {
        const starters = new Set(r.starters || []);
        const teamPlayers: PortfolioPlayer[] = (r.players || [])
            .map(pid => {
                const row = byId.get(pid);
                return row ? toPortfolioPlayer(row, cols, starters.has(pid)) : null;
            })
            .filter((p): p is PortfolioPlayer => p !== null);
        return { rosterId: String(r.roster_id), ownerName: ownerName(r.owner_id), players: teamPlayers };
    });

    const freeAgents = await freeAgentSweep(new Set(rosteredIds), cols);

    return { platform: "sleeper", leagueId, name: name || "Sleeper League", format, leagueType, teams, freeAgents, rosterPositions };
}

// ── Fleaflicker: name-only players → bridge to DB by cleanseName ──────────────
async function buildFleaflicker(
    leagueId: string,
    format: PortfolioFormat,
    leagueType: PortfolioLeagueType,
    name?: string,
): Promise<PortfolioLeague> {
    const cols = formatColumns(format, leagueType);
    const { getLatestWeek } = await import("@/lib/weekly-rankings");
    const optWeek = await getLatestWeek();
    const [{ rosters }, lineupsByTeam] = await Promise.all([
        getFleaflickerLeague(leagueId),
        optWeek != null ? getFleaflickerWeekLineups(leagueId, optWeek) : Promise.resolve(new Map()),
    ]);

    // Bridge names → sleeper_id via the players table.
    const allNames = [...new Set(rosters.flatMap(r => r.players.map(p => p.full_name)).filter(Boolean))];
    // Pull every player row once and index by cleansed name (dataset is small enough;
    // matches the pattern the existing Fleaflicker page uses).
    const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
    const idByName = new Map<string, string>();
    for (const p of allPlayers) idByName.set(cleanseName(p.full_name), p.sleeper_id);

    const rosteredSleeperIds = new Set<string>();
    const nameToSleeper = new Map<string, string>();
    for (const nm of allNames) {
        const sid = idByName.get(cleanseName(nm));
        if (sid) { nameToSleeper.set(nm, sid); rosteredSleeperIds.add(sid); }
    }

    const valueRows = await selectValueRows([...rosteredSleeperIds]);
    const byId = new Map(valueRows.map(r => [String(r.sleeper_id), r]));

    // Use the first team's slot config as the league's (all teams share it).
    let rosterPositions: string[] | null = null;
    for (const lu of lineupsByTeam.values()) { rosterPositions = lu.rosterPositions; break; }

    const teams = rosters.map(r => {
        const lineup = lineupsByTeam.get(r.id);
        const starterProIds = lineup?.starterProIds ?? new Set<string>();
        const teamPlayers: PortfolioPlayer[] = r.players
            .map(p => {
                const sid = nameToSleeper.get(p.full_name);
                const row = sid ? byId.get(sid) : undefined;
                const isStarter = p.id ? starterProIds.has(String(p.id)) : false;
                return row ? toPortfolioPlayer(row, cols, isStarter) : null;
            })
            .filter((p): p is PortfolioPlayer => p !== null);
        return { rosterId: String(r.id), ownerName: r.owners?.[0]?.display_name || `Team ${r.id}`, players: teamPlayers };
    });

    const freeAgents = await freeAgentSweep(rosteredSleeperIds, cols);

    return { platform: "fleaflicker", leagueId, name: name || "Fleaflicker League", format, leagueType, teams, freeAgents, rosterPositions };
}

// ── Yahoo / MyFFPC: reuse the DB adapter, map DbLeaguePlayer → PortfolioPlayer ─
async function buildDb(
    platform: "yahoo" | "myffpc",
    leagueId: string,
    format: PortfolioFormat,
    leagueType: PortfolioLeagueType,
): Promise<PortfolioLeague> {
    const data = await getDbLeagueData(platform as DbPlatform, leagueId);
    if (!data) throw new Error(`DB league not found: ${platform}/${leagueId}`);

    // The adapter resolves format from leagues.scoring_format; trust it but keep
    // the caller's format for the contract (they should match).
    const sf = data.format === "sf";
    const map = (p: (typeof data.teams)[number]["players"][number]): PortfolioPlayer => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        age: p.age,
        myRank: leagueType === "redraft" ? p.redraft_rank_overall : (sf ? p.rank_sf_overall : p.rank_1qb_overall),
        myPosRank: leagueType === "redraft" ? p.redraft_rank_pos : (sf ? p.rank_sf_pos : p.rank_1qb_pos),
        marketRank: sf ? p.fc_rank_sf : p.fc_rank_1qb,
        marketValue: p.fc_value,
        is_starter: p.is_starter,
    });

    const teams = data.teams.map(t => ({
        rosterId: String(t.numericId),
        ownerName: t.ownerName,
        players: t.players.map(map),
    }));
    const freeAgents = data.freeAgents.map(p => map(p));

    return { platform, leagueId, name: data.name, format: data.format, leagueType, teams, freeAgents, rosterPositions: data.rosterPositions };
}

// ── Shared DB helpers ─────────────────────────────────────────────────────────

/** Attach this week's optimizer signal (rank/total/pos_matchup) to every player,
 *  so the client can run the pure lineup optimizer without another round-trip. */
async function stampWeekly(league: PortfolioLeague): Promise<void> {
    const ids = [
        ...league.teams.flatMap(t => t.players.map(p => p.sleeper_id)),
        ...league.freeAgents.map(p => p.sleeper_id),
    ];
    const { week, byId } = await getWeeklyRanks([...new Set(ids)]);
    league.weeklyWeek = week;
    if (week == null) return;
    const stamp = (p: PortfolioPlayer) => {
        const info = rankForPosition(p.position, byId.get(p.sleeper_id));
        p.weeklyRank = info.rank;
        p.weeklyTotal = info.total;
        p.weeklyPosMatchup = info.posMatchup;
    };
    for (const t of league.teams) for (const p of t.players) stamp(p);
    for (const p of league.freeAgents) stamp(p);
}

/** Load Chino's buy/sell tags + the analyst transactions feed and stamp both
 *  onto every player in the league (rosters + free agents), so feature R can
 *  surface tagged buys and 'add' recommendations with their rationale. */
async function stampTags(league: PortfolioLeague): Promise<void> {
    const [tags, txns] = await Promise.all([
        db.select({ sleeper_id: playerTags.sleeper_id, tag: playerTags.tag }).from(playerTags),
        db.select({ sleeper_id: playerTransactions.sleeper_id, action: playerTransactions.action, note: playerTransactions.note }).from(playerTransactions),
    ]);
    const tagBy = new Map(tags.map(t => [t.sleeper_id, t.tag as 'buy' | 'sell']));
    // Most recent transaction per player wins (query returns insertion order;
    // last one overwrites — good enough for the current single-feed cadence).
    const txnBy = new Map<string, { action: 'buy' | 'sell' | 'add'; note: string | null }>();
    for (const t of txns) if (t.sleeper_id) txnBy.set(t.sleeper_id, { action: t.action as 'buy' | 'sell' | 'add', note: t.note });

    const stamp = (p: PortfolioPlayer) => {
        p.tag = tagBy.get(p.sleeper_id) ?? null;
        const tx = txnBy.get(p.sleeper_id);
        p.txnAction = tx?.action ?? null;
        p.txnNote = tx?.note ?? null;
    };
    for (const team of league.teams) for (const p of team.players) stamp(p);
    for (const p of league.freeAgents) stamp(p);
}

/** Select players+values rows for a set of sleeper ids (all format columns; the
 *  contract builder picks the right ones). */
async function selectValueRows(ids: string[]) {
    if (ids.length === 0) return [];
    return db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            age: players.age,
            fc_value_sf: playerValues.fc_value_sf,
            fc_value_1qb: playerValues.fc_value_1qb,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, ids));
}

/** Top available players (not rostered) as format-resolved PortfolioPlayers. */
async function freeAgentSweep(rosteredIds: Set<string>, cols: ReturnType<typeof formatColumns>): Promise<PortfolioPlayer[]> {
    // Pull skill-position players with a market value, drop rostered ones, cap.
    const rows = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            age: players.age,
            fc_value_sf: playerValues.fc_value_sf,
            fc_value_1qb: playerValues.fc_value_1qb,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
        })
        .from(players)
        .innerJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.position, ["QB", "RB", "WR", "TE"]));

    return rows
        .filter(r => !rosteredIds.has(r.sleeper_id))
        .map(r => toPortfolioPlayer(r, cols, false))
        .filter(p => p.marketValue != null || p.myRank != null)
        .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
        .slice(0, 300);
}
