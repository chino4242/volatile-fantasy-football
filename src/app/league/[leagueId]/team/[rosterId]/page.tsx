import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId, getAllDraftPicks } from "@/lib/sleeper";
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
    const { users, rosters, tradedPicks } = await getLeagueData(leagueId);

    // 2. Find specific roster
    const roster = rosters.find(r => r.roster_id === Number(rosterId));
    if (!roster) return notFound();

    // 3. Find owner
    const owner = users.find(u => u.user_id === roster.owner_id);

    // 4. Get all draft picks for this roster
    const allPicks = getAllDraftPicks(rosters, tradedPicks);
    const rosterPicks = allPicks.filter(pick => pick.currentOwner === Number(rosterId));
    const pickIds = [...new Set(rosterPicks.map(pick => getPickFantasyCalcId(pick.season, pick.round)))];

    // Create roster ID to owner name map
    const rosterToOwnerMap = new Map(
        rosters.map(r => {
            const u = users.find(user => user.user_id === r.owner_id);
            return [r.roster_id, u?.display_name || `Team ${r.roster_id}`];
        })
    );

    // 5. Fetch players from DB
    const rosterPlayerIds = roster.players || [];
    const allLeaguePlayerIds = rosters.flatMap(r => r.players || []);

    const dbPlayers = rosterPlayerIds.length > 0 || pickIds.length > 0 ? await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value: playerValues.fc_value_sf, // Use SF values for Sleeper
            fc_rank: playerValues.fc_rank_sf,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, [...rosterPlayerIds, ...pickIds])) : [];

    // Fetch all league players for trade targets
    const allLeaguePlayers = allLeaguePlayerIds.length > 0 ? await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value: playerValues.fc_value_sf,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, allLeaguePlayerIds)) : [];

    // Create roster ownership map
    const playerOwnershipMap = new Map<string, number>();
    rosters.forEach(r => {
        r.players?.forEach(pid => {
            playerOwnershipMap.set(pid, r.roster_id);
        });
    });

    const playerMap = new Map(dbPlayers.map(p => [p.sleeper_id, p]));

    // 5. Enrich players
    // We treat the mapped element as 'any' briefly to bypass strict Typescript checks, 
    // but the db values match the Client Component interface
    const enrichedPlayers = rosterPlayerIds
        .map(pid => playerMap.get(pid))
        .filter(p => p !== undefined)
        .sort((a, b) => (b!.fc_value || 0) - (a!.fc_value || 0)) as any[];

    // 6. Add draft picks to the player list
    const enrichedPicks = rosterPicks.map(pick => {
        const pickId = getPickFantasyCalcId(pick.season, pick.round);
        const pickData = playerMap.get(pickId);
        const ownerName = pick.originalOwner !== Number(rosterId) 
            ? rosterToOwnerMap.get(pick.originalOwner) 
            : null;
        
        return {
            sleeper_id: pickId,
            full_name: `${pick.season} Round ${pick.round}${ownerName ? ` (${ownerName})` : ''}`,
            position: 'PICK',
            team: null,
            fc_value: pickData?.fc_value || 0,
            fc_rank: null,
            rank_1qb_overall: null,
            rank_1qb_pos: null,
            rank_1qb_tier: null,
            rank_sf_overall: null,
            rank_sf_pos: null,
            rank_sf_tier: null,
        };
    });

    const allAssets = [...enrichedPlayers, ...enrichedPicks].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // 7. Calculate stats including picks
    const pickValue = rosterPicks.reduce((sum, pick) => {
        const pickId = getPickFantasyCalcId(pick.season, pick.round);
        return sum + (playerMap.get(pickId)?.fc_value || 0);
    }, 0);

    const totalValue = enrichedPlayers.reduce((sum, p) => sum + (p!.fc_value || 0), 0) + pickValue;
    const positionValues: Record<string, number> = {};
    enrichedPlayers.forEach(p => {
        const pos = p!.position || 'UNK';
        positionValues[pos] = (positionValues[pos] || 0) + (p!.fc_value || 0);
    });
    positionValues['PICK'] = pickValue;

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
                </div>

                <TeamRosterTable 
                    players={allAssets} 
                    scoringFormat="sf" 
                    positionValues={positionValues}
                    allLeaguePlayers={allLeaguePlayers}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={Number(rosterId)}
                />
            </div>
        </div>
    );
}
