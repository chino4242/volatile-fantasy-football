import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { cleanseName } from "@/lib/nameUtils";

export const dynamic = "force-dynamic";

interface TeamWithValue {
    id: number;
    name: string;
    totalValue: number;
    playerCount: number;
}

export default async function FleaflickerLeaguePage({
    params,
}: {
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;
    const fleaflickerData = await getFleaflickerLeague(leagueId);

    // Get all unique player names from rosters
    const allPlayerNames = new Set<string>();
    fleaflickerData.rosters.forEach(roster => {
        roster.players.forEach(p => {
            if (p.full_name) allPlayerNames.add(p.full_name.toLowerCase());
        });
    });

    // Fetch player values from DB - match by name
    const allPlayers = await db.select().from(players);
    const playerIds = allPlayers
        .filter(p => allPlayerNames.has(p.full_name.toLowerCase()))
        .map(p => p.sleeper_id);

    const values = await db
        .select()
        .from(playerValues)
        .where(inArray(playerValues.sleeper_id, playerIds));

    const valueMap = new Map(
        values.map(v => [v.sleeper_id, v.fc_value || 0])
    );

    const nameToIdMap = new Map(
        allPlayers.map(p => [p.full_name.toLowerCase(), p.sleeper_id])
    );

    // Calculate team values
    const teams: TeamWithValue[] = fleaflickerData.rosters.map(roster => {
        const totalValue = roster.players.reduce((sum, player) => {
            const playerId = nameToIdMap.get(player.full_name.toLowerCase());
            const value = playerId ? valueMap.get(playerId) || 0 : 0;
            return sum + value;
        }, 0);

        return {
            id: roster.id,
            name: roster.name,
            totalValue,
            playerCount: roster.players.length,
        };
    });

    teams.sort((a, b) => b.totalValue - a.totalValue);

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <div className="mx-auto max-w-4xl">
                <h1 className="mb-6 text-2xl font-bold md:text-3xl">
                    Fleaflicker League {leagueId}
                </h1>

                <div className="overflow-x-auto rounded-lg bg-white shadow">
                    <table className="w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold">Team</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Value</th>
                                <th className="px-4 py-3 text-right text-sm font-semibold">Players</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {teams.map((team, idx) => (
                                <tr key={team.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm">{idx + 1}</td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/fleaflicker/${leagueId}/team/${team.id}`}
                                            className="font-medium text-blue-600 hover:underline"
                                        >
                                            {team.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold">
                                        {team.totalValue.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                                        {team.playerCount}
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
