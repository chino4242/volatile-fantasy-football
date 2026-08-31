import { db } from "@/db";
import { leagues, rosters, rosterPlayers, players, playerValues } from "@/db/schema";
import { eq, inArray, and, gt, desc, notInArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TeamRosterTable } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterTable";
import TradeEvaluator from "@/components/TradeEvaluator";
import TradeSuggestions from "@/components/TradeSuggestions";
import { SuggestedTransactions } from "@/components/SuggestedTransactions";
import { buildRosterConfig } from "@/lib/transaction-suggestions";

export const dynamic = "force-dynamic";

export default async function MyFFPCTeamPage({
    params,
}: {
    params: Promise<{ leagueId: string; rosterId: string }>;
}) {
    const { leagueId, rosterId } = await params;

    // Fetch league
    const [league] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.league_id, leagueId));

    if (!league) notFound();

    // Fetch current roster
    const [roster] = await db
        .select()
        .from(rosters)
        .where(eq(rosters.id, rosterId));

    if (!roster || roster.league_id !== leagueId) notFound();

    // Fetch ALL league rosters (needed for trade evaluator + ownership)
    const allLeagueRosters = await db.select().from(rosters).where(eq(rosters.league_id, leagueId));
    const allRosterIds = allLeagueRosters.map(r => r.id);
    const allLeagueRosterPlayers = allRosterIds.length > 0
        ? await db.select().from(rosterPlayers).where(inArray(rosterPlayers.roster_id, allRosterIds))
        : [];

    // Fetch all player data with full values
    const allLeagueSleeperIds = [...new Set(allLeagueRosterPlayers.map(rp => rp.sleeper_id).filter(Boolean) as string[])];
    const allPlayerData = allLeagueSleeperIds.length > 0
        ? await db.select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value_1qb: playerValues.fc_value_1qb,
            fc_value_sf: playerValues.fc_value_sf,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
            redraft_rank_tier: playerValues.redraft_rank_tier,
            redraft_auction_value: playerValues.redraft_auction_value,
        }).from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id)).where(inArray(players.sleeper_id, allLeagueSleeperIds))
        : [];

    const playerMap = new Map(allPlayerData.map(p => [p.sleeper_id, p]));

    // Build ownership maps (numeric index since TradeEvaluator/TeamRosterTable expect numbers)
    const rosterIndexMap = new Map(allLeagueRosters.map((r, i) => [r.id, i + 1]));
    const currentRosterNumericId = rosterIndexMap.get(rosterId) || 0;
    const rosterToOwnerMap = new Map(allLeagueRosters.map((r, i) => [i + 1, r.owner_name || 'Unknown']));
    const playerOwnershipMap = new Map<string, number>();
    for (const rp of allLeagueRosterPlayers) {
        if (rp.sleeper_id && rp.roster_id) {
            const numericId = rosterIndexMap.get(rp.roster_id);
            if (numericId) playerOwnershipMap.set(rp.sleeper_id, numericId);
        }
    }

    // Format players for TeamRosterTable (PlayerData shape)
    const format = '1qb' as const;
    const formatPlayer = (p: typeof allPlayerData[number]) => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        fc_value: p.fc_value_1qb,
        fc_rank: p.fc_rank_1qb,
        fc_rank_sf: p.fc_rank_sf,
        fc_rank_1qb: p.fc_rank_1qb,
        fc_position_rank_sf: p.fc_position_rank_sf,
        fc_position_rank_1qb: p.fc_position_rank_1qb,
        fc_combined_value: p.fc_combined_value,
        fc_trade_frequency: p.fc_trade_frequency,
        fc_trend_30_day: p.fc_trend_30_day,
        rank_sf_overall: p.rank_sf_overall,
        rank_sf_pos: p.rank_sf_pos,
        rank_sf_tier: p.rank_sf_tier,
        rank_1qb_overall: p.rank_1qb_overall,
        rank_1qb_pos: p.rank_1qb_pos,
        rank_1qb_tier: p.rank_1qb_tier,
        redraft_rank_overall: p.redraft_rank_overall,
        redraft_rank_pos: p.redraft_rank_pos,
        redraft_rank_tier: p.redraft_rank_tier,
        redraft_auction_value: p.redraft_auction_value,
    });

    // My team's players
    const myRosterPlayerIds = allLeagueRosterPlayers
        .filter(rp => rp.roster_id === rosterId)
        .map(rp => rp.sleeper_id)
        .filter(Boolean) as string[];
    const myPlayers = myRosterPlayerIds
        .map(id => playerMap.get(id))
        .filter(Boolean)
        .map(p => formatPlayer(p!))
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // All league players formatted
    const allLeaguePlayersFormatted = allPlayerData.map(formatPlayer);

    // Fetch free agents (players not on any roster) for Suggested Transactions
    const allRosteredIds = [...new Set(allLeagueRosterPlayers.map(rp => rp.sleeper_id).filter(Boolean) as string[])];
    const freeAgentsRaw = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value_1qb: playerValues.fc_value_1qb,
        })
        .from(players)
        .innerJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(
            and(
                gt(playerValues.fc_value_1qb, 0),
                inArray(players.position, ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
                allRosteredIds.length > 0
                    ? notInArray(players.sleeper_id, allRosteredIds)
                    : undefined
            )
        )
        .orderBy(desc(playerValues.fc_value_1qb))
        .limit(300);

    const freeAgentsForTxn = freeAgentsRaw.map(p => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        fc_value: p.fc_value_1qb,
    }));

    const myPlayersForTxn = myPlayers.map(p => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        fc_value: p.fc_value,
    }));

    // Roster config from the leagues table (MyFFPC stores roster_positions)
    const rosterConfig = buildRosterConfig(league.roster_positions as string[] | null);

    // Position values for the team
    const positionValues: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of myPlayers) {
        if (p.position && p.position in positionValues) {
            positionValues[p.position] += p.fc_value || 0;
        }
    }
    const totalValue = Object.values(positionValues).reduce((s, v) => s + v, 0);

    // Other teams for breadcrumb switcher
    const otherTeams = allLeagueRosters
        .filter(r => r.id !== rosterId)
        .map(r => ({ id: r.id, name: r.owner_name || 'Unknown' }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                            <Link href={`/myffpc/${leagueId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                {league.name || 'MyFFPC League'}
                            </Link>
                            <span>/</span>
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium">{roster.owner_name}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                            {roster.owner_name}
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            {myPlayers.length} players · Total: <span className="font-mono font-bold text-green-600">{totalValue.toLocaleString()}</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <TradeEvaluator
                            myPlayers={myPlayers as any[]}
                            allLeaguePlayers={allLeaguePlayersFormatted as any[]}
                            playerOwnershipMap={playerOwnershipMap}
                            rosterToOwnerMap={rosterToOwnerMap}
                            currentRosterId={currentRosterNumericId}
                            scoringFormat="1qb"
                            leagueId={leagueId}
                            platform="fleaflicker"
                        />
                        <TradeSuggestions
                            myPlayers={myPlayers as any[]}
                            allLeaguePlayers={allLeaguePlayersFormatted as any[]}
                            playerOwnershipMap={playerOwnershipMap}
                            rosterToOwnerMap={rosterToOwnerMap}
                            currentRosterId={currentRosterNumericId}
                            scoringFormat="1qb"
                        />
                    </div>
                </div>

                {/* Team Switcher */}
                <div className="mb-6 flex flex-wrap gap-1.5">
                    {otherTeams.map(t => (
                        <Link key={t.id} href={`/myffpc/${leagueId}/team/${t.id}`}
                            className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            {t.name}
                        </Link>
                    ))}
                </div>

                {/* Suggested Transactions */}
                <SuggestedTransactions
                    myPlayers={myPlayersForTxn}
                    freeAgents={freeAgentsForTxn}
                    rosterConfig={rosterConfig}
                    actualCoreCount={myRosterPlayerIds.length}
                />

                {/* Roster Table */}
                <TeamRosterTable
                    players={myPlayers as any[]}
                    scoringFormat={format}
                    positionValues={positionValues}
                    allLeaguePlayers={allLeaguePlayersFormatted as any[]}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={currentRosterNumericId}
                    customRankingsMap={new Map()}
                    rankingSources={[]}
                />
            </div>
        </div>
    );
}
