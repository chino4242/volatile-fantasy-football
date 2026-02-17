import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData } from "@/lib/sleeper";
import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function LeagueSummaryPage({ params }: PageProps) {
    const { leagueId } = await params;

    try {
        // 1. Fetch live Sleeper data
        const { users, rosters } = await getLeagueData(leagueId);

        // 2. Collect all player IDs
        const allSleeperIds = rosters.flatMap((r) => r.players || []);

        // 3. Fetch values from DB
        const dbPlayers = await db
            .select({
                sleeper_id: players.sleeper_id,
                fc_value: playerValues.fc_value,
                position: players.position,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(inArray(players.sleeper_id, allSleeperIds));

        // 4. Create lookup map
        const playerMap = new Map(dbPlayers.map((p) => [p.sleeper_id, p]));
        const userMap = new Map(users.map((u) => [u.user_id, u]));

        // 5. Aggregate data per team
        const teamStats = rosters.map((roster) => {
            const owner = userMap.get(roster.owner_id);

            const stats = {
                rosterId: roster.roster_id,
                ownerName: owner?.display_name || 'Unknown',
                ownerAvatar: owner?.avatar,
                totalValue: 0,
                qbValue: 0,
                rbValue: 0,
                wrValue: 0,
                teValue: 0,
            };

            (roster.players || []).forEach((pid) => {
                const p = playerMap.get(pid);
                if (p) {
                    const val = p.fc_value || 0;
                    stats.totalValue += val;
                    if (p.position === 'QB') stats.qbValue += val;
                    else if (p.position === 'RB') stats.rbValue += val;
                    else if (p.position === 'WR') stats.wrValue += val;
                    else if (p.position === 'TE') stats.teValue += val;
                }
            });

            return stats;
        }).sort((a, b) => b.totalValue - a.totalValue);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            League Dashboard
                            <span className="ml-3 text-lg font-normal text-zinc-500">ID: {leagueId}</span>
                        </h1>
                        <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300">
                            ← Back to Home
                        </Link>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Rank</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Manager</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Total Value</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">QB</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">RB</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">WR</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">TE</th>
                                    <th scope="col" className="relative px-6 py-3">
                                        <span className="sr-only">View</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                {teamStats.map((team, idx) => (
                                    <tr key={team.rosterId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                                            #{idx + 1}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0">
                                                    {team.ownerAvatar ? (
                                                        <img className="h-10 w-10 rounded-full bg-zinc-100" src={`https://sleepercdn.com/avatars/${team.ownerAvatar}`} alt="" />
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">?</div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{team.ownerName}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                            {team.totalValue.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {team.qbValue.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {team.rbValue.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {team.wrValue.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {team.teValue.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <Link
                                                href={`/league/${leagueId}/team/${team.rosterId}`}
                                                className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 inline-flex items-center"
                                            >
                                                View <ArrowRight className="ml-1 h-4 w-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );

    } catch (error) {
        console.error(error);
        return (
            <div className="p-10 text-center">
                <h1 className="text-2xl font-bold text-red-600">Error loading league</h1>
            </div>
        )
    }
}
