import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId, getAllDraftPicks } from "@/lib/sleeper";
import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function LeagueSummaryPage({ params }: PageProps) {
    const { leagueId } = await params;

    try {
        // 1. Fetch live Sleeper data
        const { users, rosters, tradedPicks } = await getLeagueData(leagueId);

        // 2. Get all draft picks (original + traded)
        const allPicks = getAllDraftPicks(rosters, tradedPicks);
        const pickIds = [...new Set(allPicks.map(pick => getPickFantasyCalcId(pick.season, pick.round)))];

        // 3. Collect all player IDs
        const allSleeperIds = rosters.flatMap((r) => r.players || []);

        // 4. Fetch values from DB
        const dbPlayers = await db
            .select({
                sleeper_id: players.sleeper_id,
                fc_value: playerValues.fc_value,
                position: players.position,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(inArray(players.sleeper_id, [...allSleeperIds, ...pickIds]));

        // 5. Create lookup map
        const playerMap = new Map(dbPlayers.map((p) => [p.sleeper_id, p]));
        const userMap = new Map(users.map((u) => [u.user_id, u]));

        // 6. Build draft pick ownership map with values
        const picksByRoster = new Map<number, { count: number, totalValue: number }>();
        allPicks.forEach(pick => {
            const pickId = getPickFantasyCalcId(pick.season, pick.round);
            const pickValue = playerMap.get(pickId)?.fc_value || 0;
            const existing = picksByRoster.get(pick.currentOwner) || { count: 0, totalValue: 0 };
            picksByRoster.set(pick.currentOwner, {
                count: existing.count + 1,
                totalValue: existing.totalValue + pickValue
            });
        });

        // 7. Aggregate data per team
        const teamStats = rosters.map((roster) => {
            const owner = userMap.get(roster.owner_id);
            const pickData = picksByRoster.get(roster.roster_id) || { count: 0, totalValue: 0 };

            const stats = {
                rosterId: roster.roster_id,
                ownerName: owner?.display_name || 'Unknown',
                ownerAvatar: owner?.avatar,
                totalValue: 0,
                qbValue: 0,
                rbValue: 0,
                wrValue: 0,
                teValue: 0,
                pickValue: pickData.totalValue,
                pickCount: pickData.count,
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

            stats.totalValue += stats.pickValue;

            return stats;
        }).sort((a, b) => b.totalValue - a.totalValue);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            League Dashboard
                        </h1>
                        <p className="text-sm text-zinc-500">ID: {leagueId}</p>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto -mx-4 sm:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                                    <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                                        <tr>
                                            <th scope="col" className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Rank</th>
                                            <th scope="col" className="sticky left-[3rem] sm:left-[4rem] z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Manager</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">Total Value</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">QB</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">RB</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">WR</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">TE</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">Picks</th>
                                            <th scope="col" className="relative px-2 sm:px-3 py-3">
                                                <span className="sr-only">View</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                        {teamStats.map((team, idx) => (
                                            <tr key={team.rosterId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group relative cursor-pointer">
                                                <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                                    #{idx + 1}
                                                </td>
                                                <td className="sticky left-[3rem] sm:left-[4rem] z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                                    <Link
                                                        href={`/league/${leagueId}/team/${team.rosterId}`}
                                                        className="flex items-center after:absolute after:inset-0 after:content-[''] z-20"
                                                    >
                                                        <div className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                                                            {team.ownerAvatar ? (
                                                                <img className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-zinc-100" src={`https://sleepercdn.com/avatars/${team.ownerAvatar}`} alt="" />
                                                            ) : (
                                                                <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px] sm:text-xs">?</div>
                                                            )}
                                                        </div>
                                                        <div className="ml-2 sm:ml-3">
                                                            <div className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 max-w-[80px] sm:max-w-[120px] truncate">{team.ownerName}</div>
                                                        </div>
                                                    </Link>
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                                    {team.totalValue.toLocaleString()}
                                                    <div className="sm:hidden text-[10px] text-zinc-400 font-sans mt-0.5 font-normal">
                                                        QB: {team.qbValue.toLocaleString()} | RB: {team.rbValue.toLocaleString()}
                                                        <br />
                                                        WR: {team.wrValue.toLocaleString()} | TE: {team.teValue.toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.qbValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.rbValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.wrValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.teValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell">
                                                    {team.pickValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                                                    <ChevronRight className="h-5 w-5 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
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
