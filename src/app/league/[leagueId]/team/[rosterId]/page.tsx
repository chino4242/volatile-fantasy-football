import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData } from "@/lib/sleeper";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRosterTable } from "./TeamRosterTable";

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
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, rosterPlayerIds)) : [];

    const playerMap = new Map(dbPlayers.map(p => [p.sleeper_id, p]));

    // 5. Enrich players
    // We treat the mapped element as 'any' briefly to bypass strict Typescript checks, 
    // but the db values match the Client Component interface
    const enrichedPlayers = rosterPlayerIds
        .map(pid => playerMap.get(pid))
        .filter(p => p !== undefined)
        .sort((a, b) => (b!.fc_value || 0) - (a!.fc_value || 0)) as any[];

    // 6. Calculate stats
    const totalValue = enrichedPlayers.reduce((sum, p) => sum + (p!.fc_value || 0), 0);
    const positionValues: Record<string, number> = {};
    enrichedPlayers.forEach(p => {
        const pos = p!.position || 'UNK';
        positionValues[pos] = (positionValues[pos] || 0) + (p!.fc_value || 0);
    });

    const POSITIONS_TO_SHOW = ['QB', 'RB', 'WR', 'TE'];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <Link href={`/league/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                        ← Back to League
                    </Link>

                    <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                        {owner?.avatar ? (
                            <img
                                src={`https://sleepercdn.com/avatars/${owner.avatar}`}
                                alt={owner.display_name}
                                className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-zinc-100 flex-shrink-0"
                            />
                        ) : (
                            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-zinc-200 flex items-center justify-center text-zinc-500 text-xl sm:text-2xl font-bold flex-shrink-0">
                                {owner?.display_name?.charAt(0) || '?'}
                            </div>
                        )}

                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">{owner?.display_name || 'Unknown Manager'}</h1>
                            <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Roster ID: {rosterId}</div>
                            <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-mono font-bold text-green-600 dark:text-green-400">
                                {totalValue.toLocaleString()} <span className="text-xs sm:text-sm font-sans text-zinc-500 font-normal">pts</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 sm:mt-4 grid grid-cols-4 gap-2 sm:gap-3">
                        {POSITIONS_TO_SHOW.map(pos => (
                            <div key={pos} className="bg-zinc-100 dark:bg-zinc-800 px-2 sm:px-4 py-2 rounded-lg text-center sm:text-left">
                                <div className="text-[10px] sm:text-xs text-zinc-500 font-semibold">{pos}</div>
                                <div className="font-mono font-medium text-xs sm:text-base">{positionValues[pos]?.toLocaleString() || 0}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <TeamRosterTable players={enrichedPlayers} />
            </div>
        </div>
    );
}
