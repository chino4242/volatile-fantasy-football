import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId, getAllDraftPicks } from "@/lib/sleeper";
import { desc, eq, inArray } from "drizzle-orm";
import { LeagueTable } from "@/components/LeagueTable";
import { RefreshButton } from "@/components/RefreshButton";
import Link from "next/link";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function LeagueSummaryPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string }> }) {
    const { leagueId } = await params;
    const { format: formatParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';

    try {
        // 1. Fetch live Sleeper data
        const { users, rosters, tradedPicks } = await getLeagueData(leagueId);

        // 2. Get all draft picks (original + traded)
        const allPicks = getAllDraftPicks(rosters, tradedPicks);
        const pickIds = [...new Set(allPicks.map(pick => getPickFantasyCalcId(pick.season, pick.round)))];

        // 3. Collect all player IDs
        const allSleeperIds = rosters.flatMap((r) => r.players || []);

        // 4. Fetch values from DB using the specified format
        const dbPlayers = await db
            .select({
                sleeper_id: players.sleeper_id,
                fc_value: format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
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
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                                League Dashboard
                            </h1>
                            <p className="text-sm text-zinc-500">ID: {leagueId}</p>
                        </div>
                        <div className="flex gap-2">
                            <RefreshButton leagueId={leagueId} platform="sleeper" />
                            <Link
                                href={`/league/${leagueId}/free-agents?format=${format}`}
                                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                            >
                                View Free Agents
                            </Link>
                        </div>
                    </div>
                    <LeagueTable teams={teamStats.map(t => ({ id: t.rosterId, ...t }))} platform="sleeper" leagueId={leagueId} format={format} />
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
