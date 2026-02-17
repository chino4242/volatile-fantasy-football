import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData } from "@/lib/sleeper";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string; rosterId: string }>;
}

export default async function TeamPage({ params }: PageProps) {
    const { leagueId, rosterId } = await params;

    // 1. Fetch league data (we need it to find the owner and players)
    const { users, rosters } = await getLeagueData(leagueId);

    // 2. Find specific roster
    const roster = rosters.find(r => r.roster_id === Number(rosterId));
    if (!roster) return notFound();

    // 3. Find owner
    const owner = users.find(u => u.user_id === roster.owner_id);

    // 4. Fetch players from DB
    const rosterPlayerIds = roster.players || [];

    const dbPlayers = rosterPlayerIds.length > 0 ? await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value: playerValues.fc_value,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, rosterPlayerIds)) : [];

    const playerMap = new Map(dbPlayers.map(p => [p.sleeper_id, p]));

    // 5. Enrich players
    const enrichedPlayers = rosterPlayerIds
        .map(pid => playerMap.get(pid))
        .filter(p => p !== undefined)
        .sort((a, b) => (b!.fc_value || 0) - (a!.fc_value || 0));

    // 6. Calculate stats
    const totalValue = enrichedPlayers.reduce((sum, p) => sum + (p!.fc_value || 0), 0);
    const positionValues: Record<string, number> = {};
    enrichedPlayers.forEach(p => {
        const pos = p!.position || 'UNK';
        positionValues[pos] = (positionValues[pos] || 0) + (p!.fc_value || 0);
    });

    const POSITIONS_TO_SHOW = ['QB', 'RB', 'WR', 'TE'];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <Link href={`/league/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                        ← Back to League
                    </Link>

                    <div className="flex items-center gap-6 bg-white dark:bg-zinc-900 p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                        {owner?.avatar ? (
                            <img
                                src={`https://sleepercdn.com/avatars/${owner.avatar}`}
                                alt={owner.display_name}
                                className="w-20 h-20 rounded-full bg-zinc-100"
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 text-2xl font-bold">
                                {owner?.display_name?.charAt(0) || '?'}
                            </div>
                        )}

                        <div>
                            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">{owner?.display_name || 'Unknown Manager'}</h1>
                            <div className="text-zinc-500 mt-1">Roster ID: {rosterId}</div>
                            <div className="mt-2 text-2xl font-mono font-bold text-green-600 dark:text-green-400">
                                {totalValue.toLocaleString()} <span className="text-sm font-sans text-zinc-500 font-normal">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                        {POSITIONS_TO_SHOW.map(pos => (
                            <div key={pos} className="bg-zinc-100 dark:bg-zinc-800 px-4 py-2 rounded-lg">
                                <div className="text-xs text-zinc-500 font-semibold">{pos}</div>
                                <div className="font-mono font-medium">{positionValues[pos]?.toLocaleString() || 0}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Player</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Position</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Team</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {enrichedPlayers.map((player) => (
                                <tr key={player!.sleeper_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900 dark:text-zinc-100">
                                        {player!.full_name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                                        {player!.position}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                                        {player!.team || 'FA'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-zinc-900 dark:text-zinc-100">
                                        {player!.fc_value?.toLocaleString() || '-'}
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
