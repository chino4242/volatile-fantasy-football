import { db } from "@/db";
import { leagues, rosters, rosterPlayers, players, playerValues } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueTable, LeagueTeamStat } from "@/components/LeagueTable";
import { RefreshButton } from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

export default async function MyFFPCLeaguePage({
    params,
}: {
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;

    // Fetch league
    const [league] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.league_id, leagueId));

    if (!league) {
        notFound();
    }

    // Fetch rosters
    const leagueRosters = await db
        .select()
        .from(rosters)
        .where(eq(rosters.league_id, leagueId));

    // Fetch all roster players
    const rosterIds = leagueRosters.map(r => r.id);
    const allRosterPlayers = rosterIds.length > 0
        ? await db
            .select()
            .from(rosterPlayers)
            .where(inArray(rosterPlayers.roster_id, rosterIds))
        : [];

    // Get unique sleeper IDs
    const sleeperIds = [...new Set(
        allRosterPlayers.map(rp => rp.sleeper_id).filter(Boolean) as string[]
    )];

    // Fetch player info + values
    const playerData = sleeperIds.length > 0
        ? await db
            .select({
                sleeper_id: players.sleeper_id,
                full_name: players.full_name,
                position: players.position,
                team: players.team,
                fc_value_1qb: playerValues.fc_value_1qb,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(inArray(players.sleeper_id, sleeperIds))
        : [];

    const playerMap = new Map(playerData.map(p => [p.sleeper_id, p]));

    // Build team stats for LeagueTable
    const teams: LeagueTeamStat[] = leagueRosters.map(roster => {
        const rosterPlayerList = allRosterPlayers.filter(rp => rp.roster_id === roster.id);

        let totalValue = 0;
        let qbValue = 0;
        let rbValue = 0;
        let wrValue = 0;
        let teValue = 0;

        for (const rp of rosterPlayerList) {
            const player = playerMap.get(rp.sleeper_id!);
            if (player) {
                const val = player.fc_value_1qb || 0;
                totalValue += val;
                if (player.position === 'QB') qbValue += val;
                else if (player.position === 'RB') rbValue += val;
                else if (player.position === 'WR') wrValue += val;
                else if (player.position === 'TE') teValue += val;
            }
        }

        return {
            id: roster.id, // UUID used for routing
            name: roster.owner_name || 'Unknown',
            ownerName: roster.owner_name || 'Unknown',
            totalValue,
            qbValue,
            rbValue,
            wrValue,
            teValue,
            pickValue: 0,
            pickCount: 0,
        };
    });

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                                {league.name || 'MyFFPC League'}
                            </h1>
                        </div>
                        <p className="text-sm text-zinc-500 mt-1">
                            {teams.length} teams • 1QB Dynasty • MyFFPC
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href={`/myffpc/${leagueId}/free-agents`}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                        >
                            Free Agents
                        </Link>
                        <Link
                            href="/myffpc"
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                            Manage Rosters
                        </Link>
                    </div>
                </div>

                {/* League Table */}
                <LeagueTable
                    teams={teams}
                    platform="myffpc"
                    leagueId={leagueId}
                    format="1qb"
                />
            </div>
        </div>
    );
}
