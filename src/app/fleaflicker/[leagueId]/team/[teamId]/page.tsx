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
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-6">
                    <Link
                        href={`/fleaflicker/${leagueId}`}
                        className="text-sm text-blue-600 hover:underline"
                    >
                        ← Back to League
                    </Link>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold md:text-3xl">{roster.name}</h1>
                    <p className="mt-2 text-lg font-semibold">
                        Total Value: {totalValue.toLocaleString()}
                    </p>
                </div>

                <div className="overflow-x-auto rounded-lg bg-white shadow">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Player</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Pos</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Team</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Value</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Rank</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {playersWithValue.map((player, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{player.name}</td>
                                    <td className="px-4 py-3 text-sm">{player.position || "—"}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                        {player.team || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        {player.value.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                                        {player.rank || "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
