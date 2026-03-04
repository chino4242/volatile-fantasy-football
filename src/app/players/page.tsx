import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { PlayersTable } from "./PlayersTable";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ format?: string }>;
}

export default async function PlayersPage({ searchParams }: PageProps) {
    const { format: formatParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';

    const allPlayers = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            age: players.age,
            fc_value: format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
            fc_rank: format === 'sf' ? playerValues.fc_rank_sf : playerValues.fc_rank_1qb,
            fc_position_rank: format === 'sf' ? playerValues.fc_position_rank_sf : playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            rank_overall: format === 'sf' ? playerValues.rank_sf_overall : playerValues.rank_1qb_overall,
            rank_pos: format === 'sf' ? playerValues.rank_sf_pos : playerValues.rank_1qb_pos,
            rank_tier: format === 'sf' ? playerValues.rank_sf_tier : playerValues.rank_1qb_tier,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(isNotNull(format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb))
        .orderBy(desc(format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            All Players
                        </h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            {format === 'sf' ? 'Superflex' : '1QB'} Rankings
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Format Toggle */}
                        <div className="flex gap-2">
                            <Link
                                href="/players?format=1qb"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    format === '1qb'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                }`}
                            >
                                1QB
                            </Link>
                            <Link
                                href="/players?format=sf"
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    format === 'sf'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                }`}
                            >
                                SF
                            </Link>
                        </div>
                        <Link href="/" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300">
                            ← Back to Home
                        </Link>
                    </div>
                </div>

                <PlayersTable players={allPlayers as any[]} format={format} />
            </div>
        </div>
    );
}
