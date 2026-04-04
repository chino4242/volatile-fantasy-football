import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues, leagues } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { getPickFantasyCalcId } from "@/lib/sleeper";
import { ChevronRight } from "lucide-react";
import { LeagueTable } from "@/components/LeagueTable";
import { RefreshButton } from "@/components/RefreshButton";

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
    valueDropped?: number;
    valueKept?: number;
}

export default async function FleaflickerLeaguePage({
    params,
    searchParams,
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string; keepers?: string }>;
}) {
    const { leagueId } = await params;
    const { format: formatParam, keepers: keepersParam } = await searchParams;
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const leagueData = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && leagueData[0]?.league_type === 'keeper' && leagueData[0]?.keeper_count) keeperCount = leagueData[0].keeper_count;
    }
    if (!format) format = 'sf';

    try {
        const fleaflickerData = await getFleaflickerLeague(leagueId);

        // Normalize: lowercase, strip punctuation + suffixes (Jr/Sr/II/III/IV)
        // Fleaflicker drops suffixes, e.g. returns "Marvin Harrison" for "Marvin Harrison Jr"
        const normalizeName = (name: string) =>
            name.toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        // 1. Get all unique player names from rosters
        const allPlayerNames = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.players.forEach(p => {
                if (p.full_name) allPlayerNames.add(normalizeName(p.full_name));
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
        const playerMatches = allPlayers.filter(p => allPlayerNames.has(normalizeName(p.full_name)));

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
            // Use format from search params
            values.map(v => [v.sleeper_id, (format === 'sf' ? v.fc_value_sf : v.fc_value_1qb) || 0])
        );

        const nameToPlayerMap = new Map(
            playerMatches.map(p => [normalizeName(p.full_name), p])
        );

        // 5. Calculate team values
        const teams: TeamWithValue[] = fleaflickerData.rosters.map(roster => {
            let qbValue = 0;
            let rbValue = 0;
            let wrValue = 0;
            let teValue = 0;
            let totalValue = 0;

            // Collect players with values for keeper calculation
            const playersWithValues: { value: number }[] = [];

            // Calculate player values
            roster.players.forEach(player => {
                const dbPlayer = nameToPlayerMap.get(normalizeName(player.full_name));
                if (dbPlayer) {
                    const value = valueMap.get(dbPlayer.sleeper_id) || 0;
                    totalValue += value;
                    playersWithValues.push({ value });

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

            // Calculate value dropped and kept for keeper leagues
            let valueDropped = 0;
            let valueKept = 0;
            if (keeperCount && keeperCount > 0) {
                const sortedPlayers = playersWithValues.sort((a, b) => b.value - a.value);
                valueKept = sortedPlayers.slice(0, keeperCount).reduce((sum, p) => sum + p.value, 0);
                if (playersWithValues.length > keeperCount) {
                    valueDropped = sortedPlayers.slice(keeperCount).reduce((sum, p) => sum + p.value, 0);
                }
            }

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
                valueDropped,
                valueKept,
            };
        });

        teams.sort((a, b) => b.totalValue - a.totalValue);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                                Fleaflicker Dashboard
                            </h1>
                            <p className="text-sm text-zinc-500">ID: {leagueId}</p>
                        </div>
                        <div className="flex gap-2">
                            <RefreshButton leagueId={leagueId} platform="fleaflicker" />
                            <Link
                                href={`/fleaflicker/${leagueId}/free-agents?format=${format}`}
                                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors shadow-sm"
                            >
                                View Free Agents
                            </Link>
                            <Link
                                href={`/fleaflicker/${leagueId}/mock-draft?format=${format}${keeperCount ? `&keepers=${keeperCount}` : ''}`}
                                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                Mock Draft
                            </Link>
                        </div>
                    </div>

                    <LeagueTable teams={teams} platform="fleaflicker" leagueId={leagueId} format={format} keeperCount={keeperCount} />
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
