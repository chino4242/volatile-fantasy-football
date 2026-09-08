import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, playerValues, playerTags } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { cleanseName } from "@/lib/nameUtils";
import { getLeagueData } from "@/lib/sleeper";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { getDbLeagueData, type DbPlatform } from "@/lib/db-league-data";
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

    return { platform: "sleeper", leagueId, name: name || "Sleeper League", format, leagueType, teams, freeAgents };
}

// ── Fleaflicker: name-only players → bridge to DB by cleanseName ──────────────
async function buildFleaflicker(
    leagueId: string,
    format: PortfolioFormat,
    leagueType: PortfolioLeagueType,
    name?: string,
): Promise<PortfolioLeague> {
    const cols = formatColumns(format, leagueType);
    const { rosters } = await getFleaflickerLeague(leagueId);

    // Bridge names → sleeper_id via the players table.
    const allNames = [...new Set(rosters.flatMap(r => r.players.map(p => p.full_name)).filter(Boolean))];
    const nameKeys = allNames.map(cleanseName);
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

    const teams = rosters.map(r => {
        const teamPlayers: PortfolioPlayer[] = r.players
            .map(p => {
                const sid = nameToSleeper.get(p.full_name);
                const row = sid ? byId.get(sid) : undefined;
                // Fleaflicker roster API here doesn't flag starters → false for now.
                return row ? toPortfolioPlayer(row, cols, false) : null;
            })
            .filter((p): p is PortfolioPlayer => p !== null);
        return { rosterId: String(r.id), ownerName: r.owners?.[0]?.display_name || `Team ${r.id}`, players: teamPlayers };
    });

    const freeAgents = await freeAgentSweep(rosteredSleeperIds, cols);

    return { platform: "fleaflicker", leagueId, name: name || "Fleaflicker League", format, leagueType, teams, freeAgents };
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

    return { platform, leagueId, name: data.name, format: data.format, leagueType, teams, freeAgents };
}

// ── Shared DB helpers ─────────────────────────────────────────────────────────

/** Load Chino's buy/sell tags and stamp them onto every player in the league
 *  (rosters + free agents), so feature R can surface tagged buys. */
async function stampTags(league: PortfolioLeague): Promise<void> {
    const tags = await db.select({ sleeper_id: playerTags.sleeper_id, tag: playerTags.tag }).from(playerTags);
    if (tags.length === 0) return;
    const tagBy = new Map(tags.map(t => [t.sleeper_id, t.tag as 'buy' | 'sell']));
    for (const team of league.teams) for (const p of team.players) p.tag = tagBy.get(p.sleeper_id) ?? null;
    for (const p of league.freeAgents) p.tag = tagBy.get(p.sleeper_id) ?? null;
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
