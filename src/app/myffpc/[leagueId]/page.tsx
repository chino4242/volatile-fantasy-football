import { db } from "@/db";
import { leagues, rosters, rosterPlayers, players, playerValues } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface TeamSummary {
    rosterId: string;
    rosterUuid: string;
    teamName: string;
    owner: string;
    totalValue: number;
    qbCount: number;
    rbCount: number;
    wrCount: number;
    teCount: number;
    topPlayers: string[];
}

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

    // Build team summaries
    const teams: TeamSummary[] = leagueRosters.map(roster => {
        const rosterPlayerList = allRosterPlayers.filter(rp => rp.roster_id === roster.id);

        let totalValue = 0;
        let qbCount = 0;
        let rbCount = 0;
        let wrCount = 0;
        let teCount = 0;
        const playersByValue: { name: string; value: number }[] = [];

        for (const rp of rosterPlayerList) {
            const player = playerMap.get(rp.sleeper_id!);
            if (player) {
                const val = player.fc_value_1qb || 0;
                totalValue += val;
                playersByValue.push({ name: player.full_name, value: val });
                if (player.position === 'QB') qbCount++;
                else if (player.position === 'RB') rbCount++;
                else if (player.position === 'WR') wrCount++;
                else if (player.position === 'TE') teCount++;
            }
        }

        // Top 3 players by value for identification
        playersByValue.sort((a, b) => b.value - a.value);
        const topPlayers = playersByValue.slice(0, 3).map(p => p.name);

        return {
            rosterId: roster.roster_id,
            rosterUuid: roster.id,
            teamName: roster.owner_name || 'Unknown',
            owner: roster.owner_name || 'Unknown',
            totalValue,
            qbCount,
            rbCount,
            wrCount,
            teCount,
            topPlayers,
        };
    });

    // Sort by total value descending
    teams.sort((a, b) => b.totalValue - a.totalValue);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            {league.name || 'MyFFPC League'}
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            {teams.length} teams • 1QB Dynasty • MyFFPC
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={`/myffpc/${leagueId}/free-agents`}
                            className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                        >
                            Free Agents
                        </Link>
                        <Link
                            href="/myffpc"
                            className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                            Re-paste Rosters
                        </Link>
                    </div>
                </div>

                {/* League Rankings */}
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                    {/* Mobile Card Layout */}
                    <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                        {teams.map((team, idx) => (
                            <Link
                                key={team.rosterUuid}
                                href={`/myffpc/${leagueId}/team/${team.rosterUuid}`}
                                className="flex items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800/50 transition-colors"
                            >
                                <div className="text-xs font-mono text-zinc-400 w-6 text-center flex-shrink-0">
                                    {idx + 1}
                                </div>
                                <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-bold flex-shrink-0">
                                    {team.teamName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                            {team.teamName}
                                        </span>
                                        <span className="text-sm font-mono font-bold text-green-600 dark:text-green-400 flex-shrink-0 ml-2">
                                            {team.totalValue.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-0.5">
                                        QB:{team.qbCount} RB:{team.rbCount} WR:{team.wrCount} TE:{team.teCount}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {/* Desktop Table Layout */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400 w-8">#</th>
                                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Team</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Dynasty Value</th>
                                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">QB</th>
                                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">RB</th>
                                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">WR</th>
                                    <th className="text-center px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">TE</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {teams.map((team, idx) => (
                                    <tr
                                        key={team.rosterUuid}
                                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
                                    >
                                        <td className="px-4 py-3 text-xs font-mono text-zinc-400">{idx + 1}</td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/myffpc/${leagueId}/team/${team.rosterUuid}`}
                                                className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                            >
                                                {team.teamName}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-400">
                                            {team.totalValue.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400">{team.qbCount}</td>
                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400">{team.rbCount}</td>
                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400">{team.wrCount}</td>
                                        <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400">{team.teCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
