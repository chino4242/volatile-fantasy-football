import { db } from "@/db";
import { leagues, rosters, rosterPlayers, players, playerValues } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PlayerRow {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value_1qb: number | null;
    fc_rank_1qb: number | null;
    rank_1qb_overall: number | null;
    rank_1qb_tier: number | null;
    redraft_auction_value: number | null;
    is_starter: boolean;
}

function getPositionBorderColor(position: string | null): string {
    switch (position) {
        case 'QB': return 'border-l-green-600';
        case 'RB': return 'border-l-blue-600';
        case 'WR': return 'border-l-red-600';
        case 'TE': return 'border-l-orange-600';
        case 'PK': return 'border-l-purple-600';
        case 'DST': return 'border-l-zinc-600';
        default: return 'border-l-zinc-300';
    }
}

function getPositionBadgeColor(position: string | null): string {
    switch (position) {
        case 'QB': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        case 'RB': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
        case 'WR': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
        case 'TE': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
        case 'PK': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
        case 'DST': return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-700/30 dark:text-zinc-400';
        default: return 'bg-zinc-100 text-zinc-600';
    }
}

export default async function MyFFPCTeamPage({
    params,
}: {
    params: Promise<{ leagueId: string; rosterId: string }>;
}) {
    const { leagueId, rosterId } = await params;

    // Fetch league
    const [league] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.league_id, leagueId));

    if (!league) {
        notFound();
    }

    // Fetch roster
    const [roster] = await db
        .select()
        .from(rosters)
        .where(eq(rosters.id, rosterId));

    if (!roster || roster.league_id !== leagueId) {
        notFound();
    }

    // Fetch roster players
    const rosterPlayerList = await db
        .select()
        .from(rosterPlayers)
        .where(eq(rosterPlayers.roster_id, rosterId));

    const sleeperIds = rosterPlayerList
        .map(rp => rp.sleeper_id)
        .filter(Boolean) as string[];

    // Fetch player info + values
    const playerData = sleeperIds.length > 0
        ? await db
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
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(inArray(players.sleeper_id, sleeperIds))
        : [];

    const playerMap = new Map(playerData.map(p => [p.sleeper_id, p]));

    // Build rows
    const rows: PlayerRow[] = rosterPlayerList
        .map(rp => {
            const player = playerMap.get(rp.sleeper_id!);
            if (!player) return null;
            return {
                sleeper_id: player.sleeper_id,
                full_name: player.full_name,
                position: player.position,
                team: player.team,
                fc_value_1qb: player.fc_value_1qb,
                fc_rank_1qb: player.fc_rank_1qb,
                rank_1qb_overall: player.rank_1qb_overall,
                rank_1qb_tier: player.rank_1qb_tier,
                redraft_auction_value: player.redraft_auction_value,
                is_starter: rp.is_starter || false,
            };
        })
        .filter(Boolean) as PlayerRow[];

    // Sort by dynasty value descending
    rows.sort((a, b) => (b.fc_value_1qb || 0) - (a.fc_value_1qb || 0));

    const totalValue = rows.reduce((sum, r) => sum + (r.fc_value_1qb || 0), 0);

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
                        <span className="text-zinc-900 dark:text-zinc-100">{roster.owner_name}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            {roster.owner_name}
                        </h1>
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-zinc-500">
                                {rows.length} players
                            </div>
                            <div className="text-lg font-mono font-bold text-green-600 dark:text-green-400">
                                {totalValue.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Roster Table */}
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                    {/* Mobile Layout */}
                    <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                        {rows.map(player => (
                            <div
                                key={player.sleeper_id}
                                className={`flex items-center justify-between px-4 py-3 border-l-4 ${getPositionBorderColor(player.position)}`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
                                        {player.position}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                            {player.full_name}
                                        </div>
                                        <div className="text-xs text-zinc-500">{player.team || 'FA'}</div>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0 ml-2">
                                    <div className="text-sm font-mono font-bold text-green-600 dark:text-green-400">
                                        {player.fc_value_1qb?.toLocaleString() || '—'}
                                    </div>
                                    {player.redraft_auction_value != null && (
                                        <div className="text-[10px] text-zinc-400">${player.redraft_auction_value}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Player</th>
                                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Pos</th>
                                    <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Team</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Dynasty Value</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Auction $</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">FC Rank</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">VFF Rank</th>
                                    <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Tier</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {rows.map(player => (
                                    <tr
                                        key={player.sleeper_id}
                                        className={`border-l-4 ${getPositionBorderColor(player.position)} hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors`}
                                    >
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                            {player.full_name}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
                                                {player.position}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                                            {player.team || 'FA'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-400">
                                            {player.fc_value_1qb?.toLocaleString() || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                                            {player.redraft_auction_value != null ? `$${player.redraft_auction_value}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                                            {player.fc_rank_1qb || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                                            {player.rank_1qb_overall || '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                                            {player.rank_1qb_tier || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Trade Evaluator Placeholder */}
                <div className="mt-8 bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                        Trade Evaluator
                    </h2>
                    <p className="text-sm text-zinc-500">
                        Trade evaluator coming soon for MyFFPC leagues.
                    </p>
                </div>
            </div>
        </div>
    );
}
