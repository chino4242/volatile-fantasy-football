import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { desc, eq, and, not, like, inArray } from "drizzle-orm";
import { FreeAgentTable } from "@/components/FreeAgentTable";
import Link from "next/link";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function FleaflickerFreeAgentsPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string }> }) {
    const { leagueId } = await params;
    const { format: formatParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';

    try {
        // 1. Fetch live Fleaflicker data
        const fleaflickerData = await getFleaflickerLeague(leagueId);

        // Normalize names: lowercase, strip punctuation, strip common suffixes (Jr/Sr/II/III/IV)
        // This handles Fleaflicker returning "Marvin Harrison" while DB has "Marvin Harrison Jr"
        const normalizeName = (name: string) =>
            name.toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')       // strip punctuation
                .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '') // strip suffixes
                .replace(/\s+/g, ' ')               // collapse spaces
                .trim();

        const allPlayerNames = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.players.forEach(p => {
                if (p.full_name) allPlayerNames.add(normalizeName(p.full_name));
            });
        });

        // 3. Query DB for top valued players using the specified format
        const dbPlayers = await db
            .select({
                sleeper_id: players.sleeper_id,
                full_name: players.full_name,
                position: players.position,
                team: players.team,
                years_exp: players.years_exp,
                fc_value: format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
                fc_rank: format === 'sf' ? playerValues.fc_rank_sf : playerValues.fc_rank_1qb,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(
                and(
                    not(like(players.sleeper_id, '%pick%')),
                    inArray(players.position, ['QB', 'RB', 'WR', 'TE'])
                )
            )
            .orderBy(desc(format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb))
            .limit(1000); // Fetch enough to ensure we have 200 after filtering

        // 4. Filter out rostered players using normalized name matching
        const freeAgents = dbPlayers
            .filter(p => !allPlayerNames.has(normalizeName(p.full_name || '')))
            .slice(0, 200);

        // Calculate position totals for free agents
        const positionTotals = freeAgents.reduce((acc, player) => {
            const pos = player.position || 'UNK';
            if (!acc[pos]) acc[pos] = 0;
            acc[pos] += player.fc_value || 0;
            return acc;
        }, {} as Record<string, number>);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 sm:mb-8">
                        <Link href={`/fleaflicker/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                            ← Back to League
                        </Link>

                        <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                                <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in league (Top 200 by {format === 'sf' ? 'SF' : '1QB'} Value)</div>
                            </div>
                        </div>
                    </div>

                    {/* Position Value Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        {['QB', 'RB', 'WR', 'TE'].map(pos => (
                            <div key={pos} className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm ring-1 ring-zinc-900/5 p-4">
                                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{pos}</div>
                                <div className="mt-1 text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                    {(positionTotals[pos] || 0).toLocaleString()}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1">Available Value</div>
                            </div>
                        ))}
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
