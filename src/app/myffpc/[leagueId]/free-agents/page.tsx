import { db } from "@/db";
import { leagues, rosters, rosterPlayers, players, playerValues } from "@/db/schema";
import { eq, inArray, notInArray, and, gt, desc, isNotNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MyFFPCFreeAgentTable } from "./MyFFPCFreeAgentTable";

export const dynamic = "force-dynamic";

export default async function MyFFPCFreeAgentsPage({
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

    // Get all rosters for this league
    const leagueRosters = await db
        .select({ id: rosters.id })
        .from(rosters)
        .where(eq(rosters.league_id, leagueId));

    const rosterIds = leagueRosters.map(r => r.id);

    // Get all rostered sleeper IDs
    const rosteredPlayers = rosterIds.length > 0
        ? await db
            .select({ sleeper_id: rosterPlayers.sleeper_id })
            .from(rosterPlayers)
            .where(inArray(rosterPlayers.roster_id, rosterIds))
        : [];

    const rosteredIds = rosteredPlayers
        .map(rp => rp.sleeper_id)
        .filter(Boolean) as string[];

    // Fetch all players with value NOT on any roster
    const freeAgents = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value_1qb: playerValues.fc_value_1qb,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            redraft_auction_value: playerValues.redraft_auction_value,
        })
        .from(players)
        .innerJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(
            and(
                gt(playerValues.fc_value_1qb, 0),
                // Exclude draft picks (position='PICK') — only real players
                inArray(players.position, ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']),
                rosteredIds.length > 0
                    ? notInArray(players.sleeper_id, rosteredIds)
                    : undefined
            )
        )
        .orderBy(desc(playerValues.fc_value_1qb))
        .limit(300);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 text-sm text-zinc-500 mb-2">
                        <Link href={`/myffpc/${leagueId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                            {league.name || 'MyFFPC League'}
                        </Link>
                        <span>/</span>
                        <span className="text-zinc-900 dark:text-zinc-100">Free Agents</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                        Free Agents
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        {freeAgents.length} available players ranked by dynasty value (1QB)
                    </p>
                </div>

                <MyFFPCFreeAgentTable players={freeAgents} />
            </div>
        </div>
    );
}
