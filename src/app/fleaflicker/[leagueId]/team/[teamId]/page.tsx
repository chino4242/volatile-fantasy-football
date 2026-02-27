import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface PlayerWithValue {
    name: string;
    team?: string;
    position?: string;
    value: number;
    rank?: number;
}

export default async function FleaflickerTeamPage({
    params,
}: {
    params: Promise<{ leagueId: string; teamId: string }>;
}) {
    const { leagueId, teamId } = await params;
    const fleaflickerData = await getFleaflickerLeague(leagueId);

    const roster = fleaflickerData.rosters.find(r => r.id === parseInt(teamId));
    if (!roster) {
        return <div className="p-8 text-center">Team not found</div>;
    }

    // Get player names
    const playerNames = roster.players
        .map(p => p.full_name.toLowerCase())
        .filter(Boolean);

    // Fetch from DB
    const allPlayers = await db.select().from(players);
    const matchedPlayers = allPlayers.filter(p => 
        playerNames.includes(p.full_name.toLowerCase())
    );

    const playerIds = matchedPlayers.map(p => p.sleeper_id);
    const values = await db
        .select()
        .from(playerValues)
        .where(inArray(playerValues.sleeper_id, playerIds));

    const valueMap = new Map(
        values.map(v => [v.sleeper_id, { value: v.fc_value || 0, rank: v.fc_rank }])
    );

    const nameToPlayerMap = new Map(
        matchedPlayers.map(p => [p.full_name.toLowerCase(), p])
    );

    // Merge data
    const playersWithValue: PlayerWithValue[] = roster.players.map(player => {
        const dbPlayer = nameToPlayerMap.get(player.full_name.toLowerCase());
        const valueData = dbPlayer ? valueMap.get(dbPlayer.sleeper_id) : undefined;

        return {
            name: player.full_name,
            team: player.team,
            position: dbPlayer?.position || undefined,
            value: valueData?.value || 0,
            rank: valueData?.rank || undefined,
        };
    });

    playersWithValue.sort((a, b) => b.value - a.value);

    const totalValue = playersWithValue.reduce((sum, p) => sum + p.value, 0);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4 md:p-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <Link
                        href={`/fleaflicker/${leagueId}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        ← Back to League
                    </Link>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 md:text-3xl">{roster.name}</h1>
                    <p className="mt-2 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                        Total Value: {totalValue.toLocaleString()}
                    </p>
                </div>

                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                            <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Player</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Pos</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Team</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Value</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Rank</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                {playersWithValue.map((player, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">{player.name}</td>
                                        <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{player.position || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                                            {player.team || "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                            {player.value.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-zinc-500 dark:text-zinc-400">
                                            {player.rank || "—"}
                                        </td>
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
