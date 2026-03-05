import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { getPickFantasyCalcId } from "@/lib/sleeper";
import { getCustomRankings, buildCustomRankingsMap, getActiveSources } from "@/lib/custom-rankings";
import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { inArray, eq } from "drizzle-orm";
import { TeamRosterTable } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterTable";

export const dynamic = "force-dynamic";

export default async function FleaflickerTeamPage({
    params,
    searchParams,
}: {
    params: Promise<{ leagueId: string; teamId: string }>;
    searchParams: Promise<{ format?: string; keepers?: string }>;
}) {
    const { leagueId, teamId } = await params;
    const { format: formatParam, keepers: keepersParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';
    const keeperCount = keepersParam ? parseInt(keepersParam) : undefined;

    const fleaflickerData = await getFleaflickerLeague(leagueId);

    const roster = fleaflickerData.rosters.find(r => r.id === parseInt(teamId));
    if (!roster) {
        return <div className="p-8 text-center">Team not found</div>;
    }

    // Normalize: lowercase, strip punctuation, strip Jr/Sr/II/III/IV suffixes
    // Fleaflicker drops suffixes (e.g. returns "Marvin Harrison" for "Marvin Harrison Jr")
    const normalizeName = (name: string) =>
        name.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    // Get player names
    const playerNames = roster.players
        .map(p => normalizeName(p.full_name))
        .filter(Boolean);

    // Get pick IDs - try both specific slot and round-level
    const specificPickIds = roster.draftPicks.map(pick =>
        `FP_${pick.season}_${pick.round}.${pick.slot.toString().padStart(2, '0')}`
    );
    const roundPickIds = roster.draftPicks.map(pick =>
        getPickFantasyCalcId(pick.season.toString(), pick.round)
    );
    const pickIds = [...new Set([...specificPickIds, ...roundPickIds])];

    // Fetch from DB
    const allPlayers = await db.select().from(players);
    const matchedPlayers = allPlayers.filter(p =>
        playerNames.includes(normalizeName(p.full_name))
    );

    const playerIds = [...matchedPlayers.map(p => p.sleeper_id), ...pickIds];
    const values = await db
        .select()
        .from(playerValues)
        .where(inArray(playerValues.sleeper_id, playerIds));

    const valueMap = new Map(values.map(v => [v.sleeper_id, v]));
    const nameToPlayerMap = new Map(
        matchedPlayers.map(p => [normalizeName(p.full_name), p])
    );
    const playerMap = new Map(matchedPlayers.map(p => [p.sleeper_id, p]));

    // Transform players to TeamRosterTable format
    const playersWithData = roster.players
        .map(player => {
            const dbPlayer = nameToPlayerMap.get(normalizeName(player.full_name));
            if (!dbPlayer) return null;

            const valueData = valueMap.get(dbPlayer.sleeper_id);

            return {
                sleeper_id: dbPlayer.sleeper_id,
                full_name: player.full_name,
                position: dbPlayer.position,
                team: player.team || dbPlayer.team,
                fc_value: format === 'sf' ? (valueData?.fc_value_sf || null) : (valueData?.fc_value_1qb || null),
                fc_rank: format === 'sf' ? (valueData?.fc_rank_sf || null) : (valueData?.fc_rank_1qb || null),
                fc_rank_sf: valueData?.fc_rank_sf || null,
                fc_rank_1qb: valueData?.fc_rank_1qb || null,
                fc_position_rank_sf: valueData?.fc_position_rank_sf || null,
                fc_position_rank_1qb: valueData?.fc_position_rank_1qb || null,
                fc_combined_value: valueData?.fc_combined_value || null,
                fc_trade_frequency: valueData?.fc_trade_frequency ? Number(valueData.fc_trade_frequency) : null,
                fc_trend_30_day: valueData?.fc_trend_30_day || null,
                rank_1qb_overall: valueData?.rank_1qb_overall || null,
                rank_1qb_pos: valueData?.rank_1qb_pos || null,
                rank_1qb_tier: valueData?.rank_1qb_tier || null,
                rank_sf_overall: valueData?.rank_sf_overall || null,
                rank_sf_pos: valueData?.rank_sf_pos || null,
                rank_sf_tier: valueData?.rank_sf_tier || null,
            };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

    // Add draft picks
    const enrichedPicks = roster.draftPicks.map(pick => {
        // Try specific pick slot first (e.g., FP_2026_1.01)
        const specificPickId = `FP_${pick.season}_${pick.round}.${pick.slot.toString().padStart(2, '0')}`;
        // Fall back to round-level ID (e.g., FP_2026_1)
        const roundPickId = getPickFantasyCalcId(pick.season.toString(), pick.round);

        const specificValue = valueMap.get(specificPickId);
        const roundValue = valueMap.get(roundPickId);
        const pickValue = specificValue || roundValue;

        const isTraded = pick.originalOwner !== pick.currentOwner;
        const originalOwnerRoster = fleaflickerData.rosters.find(r => r.id === pick.originalOwner);
        const ownerName = isTraded && originalOwnerRoster ? originalOwnerRoster.name : null;

        return {
            sleeper_id: specificPickId,
            full_name: `${pick.season} Round ${pick.round}.${pick.slot} #${pick.overall}${ownerName ? ` (${ownerName})` : ''}`,
            position: 'PICK',
            team: null,
            fc_value: format === 'sf' ? (pickValue?.fc_value_sf || 0) : (pickValue?.fc_value_1qb || 0),
            fc_rank: null,
            fc_rank_sf: null,
            fc_rank_1qb: null,
            fc_position_rank_sf: null,
            fc_position_rank_1qb: null,
            fc_combined_value: null,
            fc_trade_frequency: null,
            fc_trend_30_day: null,
            rank_1qb_overall: null,
            rank_1qb_pos: null,
            rank_1qb_tier: null,
            rank_sf_overall: null,
            rank_sf_pos: null,
            rank_sf_tier: null,
        };
    });

    const allAssets = [...playersWithData, ...enrichedPicks].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    const totalValue = allAssets.reduce((sum, p) => sum + (p.fc_value || 0), 0);
    const positionValues: Record<string, number> = {};
    playersWithData.forEach(p => {
        const pos = p.position || 'UNK';
        positionValues[pos] = (positionValues[pos] || 0) + (p.fc_value || 0);
    });
    positionValues['PICK'] = enrichedPicks.reduce((sum, p) => sum + (p.fc_value || 0), 0);

    // Fetch custom rankings
    const customRankings = await getCustomRankings();
    const rankingsMap = buildCustomRankingsMap(customRankings);
    const activeSources = await getActiveSources();

    // Fetch all league players for trade targets
    const allLeaguePlayerNames = fleaflickerData.rosters.flatMap(r =>
        r.players.map(p => normalizeName(p.full_name))
    );
    const allLeaguePlayers = allPlayers.filter(p =>
        allLeaguePlayerNames.includes(normalizeName(p.full_name))
    );
    const allLeaguePlayerIds = allLeaguePlayers.map(p => p.sleeper_id);

    const allLeagueValues = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value: format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
            fc_rank: playerValues.fc_rank,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, allLeaguePlayerIds));

    // Create ownership map
    const playerOwnershipMap = new Map<string, number>();
    fleaflickerData.rosters.forEach(r => {
        r.players.forEach(p => {
            const dbPlayer = nameToPlayerMap.get(normalizeName(p.full_name));
            if (dbPlayer) {
                playerOwnershipMap.set(dbPlayer.sleeper_id, r.id);
            }
        });
    });

    const rosterToOwnerMap = new Map(
        fleaflickerData.rosters.map(r => [r.id, r.name])
    );

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <Link
                            href={`/fleaflicker/${leagueId}`}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            ← Back to League
                        </Link>
                        <Link
                            href={`/fleaflicker/${leagueId}/free-agents`}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                            View Free Agents →
                        </Link>
                    </div>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 md:text-3xl">
                        {roster.name}
                    </h1>
                    <p className="mt-2 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                        Total Value: {totalValue.toLocaleString()}
                    </p>
                </div>

                <TeamRosterTable
                    players={allAssets as any[]}
                    scoringFormat={format}
                    positionValues={positionValues}
                    allLeaguePlayers={allLeagueValues as any[]}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={parseInt(teamId)}
                    customRankingsMap={rankingsMap}
                    rankingSources={activeSources}
                    keeperCount={keeperCount}
                />
            </div>
        </div>
    );
}
