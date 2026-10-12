import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { desc, eq, and, isNotNull, inArray } from "drizzle-orm";
import Link from "next/link";
import { PlayersTable } from "./PlayersTable";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ format?: string }>;
}

export default async function PlayersPage({ searchParams }: PageProps) {
    const { format: formatParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';

    const valueCol = format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb;
    const cols = {
        sleeper_id: players.sleeper_id,
        full_name: players.full_name,
        position: players.position,
        team: players.team,
        age: players.age,
        fc_value: valueCol,
        fc_rank: format === 'sf' ? playerValues.fc_rank_sf : playerValues.fc_rank_1qb,
        fc_position_rank: format === 'sf' ? playerValues.fc_position_rank_sf : playerValues.fc_position_rank_1qb,
        fc_combined_value: playerValues.fc_combined_value,
        fc_trade_frequency: playerValues.fc_trade_frequency,
        fc_trend_30_day: playerValues.fc_trend_30_day,
        rank_overall: format === 'sf' ? playerValues.rank_sf_overall : playerValues.rank_1qb_overall,
        rank_pos: format === 'sf' ? playerValues.rank_sf_pos : playerValues.rank_1qb_pos,
        rank_tier: format === 'sf' ? playerValues.rank_sf_tier : playerValues.rank_1qb_tier,
        redraft_rank_overall: playerValues.redraft_rank_overall,
        redraft_rank_pos: playerValues.redraft_rank_pos,
        redraft_rank_tier: playerValues.redraft_rank_tier,
        // Rest-of-season — the forward-looking "how will he score this year" lens.
        rank_ros_overall: playerValues.rank_ros_overall,
        rank_ros_pos: playerValues.rank_ros_pos,
        rank_ros_tier: playerValues.rank_ros_tier,
        rank_ros_ppg: playerValues.rank_ros_ppg,
        ros_sos: playerValues.ros_sos,
        bye_week: playerValues.bye_week,
    };

    // Valued skill players (QB/RB/WR/TE) — the main list, ordered by dynasty value.
    const valuedPlayers = await db
        .select(cols)
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(isNotNull(valueCol))
        .orderBy(desc(valueCol));

    // Kickers + Defenses have no FantasyCalc value, so the value filter above
    // drops them — fetch separately and merge so they're rankable by ROS/weekly.
    const kdPlayers = await db
        .select(cols)
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.position, ['K', 'DEF']));

    const combined = [...valuedPlayers, ...kdPlayers];

    // Stamp this week's rank (flex/qb/dst/k pools) onto every player — the
    // most up-to-date start/sit signal, and a sortable column.
    const { week: weeklyWeek, byId: weeklyById } = await getWeeklyRanks(combined.map(p => p.sleeper_id));
    const allPlayers = combined.map(p => ({
        ...p,
        rank_ros_ppg: p.rank_ros_ppg != null ? Number(p.rank_ros_ppg) : null,
        weekly_rank: rankForPosition(p.position, weeklyById.get(p.sleeper_id)).rank,
    }));

    // Calculate position totals
    const positionTotals = allPlayers.reduce((acc, player) => {
        const pos = player.position || 'UNK';
        if (!acc[pos]) acc[pos] = 0;
        acc[pos] += player.fc_value || 0;
        return acc;
    }, {} as Record<string, number>);

    const rankingsVintage = formatVintage(await getRankingsVintage(format));
    // ROS ranks update weekly in-season, so show a precise date (not just Mon YYYY).
    const rosUpdatedAt = await getRankingsVintage('ros');
    const rosUpdatedLabel = rosUpdatedAt
        ? rosUpdatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : null;

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

                {/* Position Value Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {['QB', 'RB', 'WR', 'TE'].map(pos => (
                        <div key={pos} className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm ring-1 ring-zinc-900/5 p-4">
                            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{pos}</div>
                            <div className="mt-1 text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                {(positionTotals[pos] || 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">Total Value</div>
                        </div>
                    ))}
                </div>

                <PlayersTable players={allPlayers as any[]} format={format} rankingsVintage={rankingsVintage} weeklyWeek={weeklyWeek} rosUpdatedLabel={rosUpdatedLabel} />
            </div>
        </div>
    );
}
