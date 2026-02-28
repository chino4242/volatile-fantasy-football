import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { getPickFantasyCalcId } from "@/lib/sleeper";
import { ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface TeamWithValue {
    id: number;
    name: string;
    ownerName: string;
    totalValue: number;
    qbValue: number;
    rbValue: number;
    wrValue: number;
    teValue: number;
    pickValue: number;
    pickCount: number;
}

export default async function FleaflickerLeaguePage({
    params,
}: {
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;

    try {
        const fleaflickerData = await getFleaflickerLeague(leagueId);

        // 1. Get all unique player names from rosters
        const allPlayerNames = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.players.forEach(p => {
                if (p.full_name) allPlayerNames.add(p.full_name.toLowerCase());
            });
        });

        // 2. Collect all draft picks (FantasyCalc IDs)
        const allPickIds = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.draftPicks.forEach(pick => {
                allPickIds.add(getPickFantasyCalcId(pick.season.toString(), pick.round));
            });
        });

        // 3. Fetch player data from DB to get Sleeper IDs and Positions
        const allPlayers = await db.select().from(players);
        const playerMatches = allPlayers.filter(p => allPlayerNames.has(p.full_name.toLowerCase()));

        const playerIds = playerMatches.map(p => p.sleeper_id);
        const allLookupIds = [...playerIds, ...Array.from(allPickIds)];

        // 4. Fetch values from DB for both players and picks
        const values = await db
            .select({
                sleeper_id: playerValues.sleeper_id,
                fc_value: playerValues.fc_value,
                fc_value_sf: playerValues.fc_value_sf,
                fc_value_1qb: playerValues.fc_value_1qb,
            })
            .from(playerValues)
            .where(inArray(playerValues.sleeper_id, allLookupIds));

        // Create lookup maps
        const valueMap = new Map(
            // Use 1QB values by default for Fleaflicker unless changed to SF
            values.map(v => [v.sleeper_id, v.fc_value_1qb || 0])
        );

        const nameToPlayerMap = new Map(
            playerMatches.map(p => [p.full_name.toLowerCase(), p])
        );

        // 5. Calculate team values
        const teams: TeamWithValue[] = fleaflickerData.rosters.map(roster => {
            let qbValue = 0;
            let rbValue = 0;
            let wrValue = 0;
            let teValue = 0;
            let totalValue = 0;

            // Calculate player values
            roster.players.forEach(player => {
                const dbPlayer = nameToPlayerMap.get(player.full_name.toLowerCase());
                if (dbPlayer) {
                    const value = valueMap.get(dbPlayer.sleeper_id) || 0;
                    totalValue += value;

                    if (dbPlayer.position === 'QB') qbValue += value;
                    else if (dbPlayer.position === 'RB') rbValue += value;
                    else if (dbPlayer.position === 'WR') wrValue += value;
                    else if (dbPlayer.position === 'TE') teValue += value;
                }
            });

            // Calculate pick values
            let pickValue = 0;
            roster.draftPicks.forEach(pick => {
                const pickId = getPickFantasyCalcId(pick.season.toString(), pick.round);
                const value = valueMap.get(pickId) || 0;
                pickValue += value;
                totalValue += value;
            });

            return {
                id: roster.id,
                name: roster.name,
                ownerName: roster.owners[0]?.display_name || 'Unknown',
                totalValue,
                qbValue,
                rbValue,
                wrValue,
                teValue,
                pickValue,
                pickCount: roster.draftPicks.length,
            };
        });

        teams.sort((a, b) => b.totalValue - a.totalValue);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                            Fleaflicker Dashboard
                        </h1>
                        <p className="text-sm text-zinc-500">ID: {leagueId}</p>
                    </div>

                    <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto -mx-4 sm:mx-0">
                            <div className="inline-block min-w-full align-middle">
                                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                                    <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                                        <tr>
                                            <th scope="col" className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Rank</th>
                                            <th scope="col" className="sticky left-[3rem] sm:left-[4rem] z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Team</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap">Total Value</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">QB</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">RB</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">WR</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">TE</th>
                                            <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell">Picks</th>
                                            <th scope="col" className="relative px-2 sm:px-3 py-3">
                                                <span className="sr-only">View</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                                        {teams.map((team, idx) => (
                                            <tr key={team.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group relative cursor-pointer">
                                                <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                                    #{idx + 1}
                                                </td>
                                                <td className="sticky left-[3rem] sm:left-[4rem] z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                                    <Link
                                                        href={`/fleaflicker/${leagueId}/team/${team.id}`}
                                                        className="flex items-center after:absolute after:inset-0 after:content-[''] z-20"
                                                    >
                                                        <div className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px] sm:text-xs">
                                                            {team.ownerName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="ml-2 sm:ml-3">
                                                            <div className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 max-w-[80px] sm:max-w-[120px] truncate">{team.name}</div>
                                                            <div className="text-[10px] sm:text-xs text-zinc-500 truncate">{team.ownerName}</div>
                                                        </div>
                                                    </Link>
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                                    {team.totalValue.toLocaleString()}
                                                    <div className="sm:hidden text-[10px] text-zinc-400 font-sans mt-0.5 font-normal">
                                                        QB: {team.qbValue.toLocaleString()} | RB: {team.rbValue.toLocaleString()}
                                                        <br />
                                                        WR: {team.wrValue.toLocaleString()} | TE: {team.teValue.toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.qbValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.rbValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.wrValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                                    {team.teValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell">
                                                    {team.pickValue.toLocaleString()}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                                                    <ChevronRight className="h-5 w-5 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );

    } catch (error) {
        console.error(error);
        return (
            <div className="p-10 text-center">
                <h1 className="text-2xl font-bold text-red-600">Error loading league</h1>
            </div>
        )
    }
}
