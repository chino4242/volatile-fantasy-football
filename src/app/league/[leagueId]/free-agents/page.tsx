import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId } from "@/lib/sleeper";
import { desc, eq, notInArray, and, not, like, inArray } from "drizzle-orm";
import { FreeAgentTable } from "@/components/FreeAgentTable";
import Link from "next/link";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function SleeperFreeAgentsPage({ params }: PageProps) {
    const { leagueId } = await params;

    try {
        // 1. Fetch live Sleeper data to get currently rostered players
        const { rosters } = await getLeagueData(leagueId);

        // 2. Collect all rostered player IDs
        const allSleeperIds = rosters.flatMap((r) => r.players || []);

        // Add a dummy ID to prevent empty array error in notInArray if league is completely empty
        if (allSleeperIds.length === 0) allSleeperIds.push('dummy');

        // 3. Query DB for top 200 free agents (not on any roster, excluding picks)
        const freeAgents = await db
            .select({
                sleeper_id: players.sleeper_id,
                full_name: players.full_name,
                position: players.position,
                team: players.team,
                years_exp: players.years_exp,
                fc_value: playerValues.fc_value,
                fc_rank: playerValues.fc_rank_sf,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(
                and(
                    notInArray(players.sleeper_id, allSleeperIds),
                    not(like(players.sleeper_id, '%pick%')),
                    inArray(players.position, ['QB', 'RB', 'WR', 'TE'])
                )
            )
            .orderBy(desc(playerValues.fc_value))
            .limit(200);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 sm:mb-8">
                        <Link href={`/league/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                            ← Back to League
                        </Link>

                        <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                                <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in league (Top 200 by SF Value)</div>
                            </div>
                        </div>
                    </div>

                    <FreeAgentTable players={freeAgents} />
                </div>
            </div>
        );

    } catch (error) {
        console.error(error);
        return (
            <div className="p-10 text-center">
                <h1 className="text-2xl font-bold text-red-600">Error loading free agents</h1>
            </div>
        )
    }
}
