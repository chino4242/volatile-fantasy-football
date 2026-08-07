import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { getPickFantasyCalcId } from "@/lib/sleeper";
import { getCustomRankings, buildCustomRankingsMap, getActiveSources } from "@/lib/custom-rankings";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { db } from "@/db";
import { players, playerValues, leagues, prospectData, prospectWriteups, playerAdvancedStats } from "@/db/schema";
import { inArray, eq, sql, desc } from "drizzle-orm";
import { TeamRosterTable } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterTable";
import { TeamRosterComposition } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterComposition";
import TradeEvaluator from "@/components/TradeEvaluator";
import TeamHealthDashboard from "@/components/TeamHealthDashboard";
import { SavedTrades } from "@/components/SavedTrades";
import { KeeperDecisionTool } from "@/components/KeeperDecisionTool";
import { PendingTrades } from "@/components/PendingTrades";

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
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const leagueData = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && leagueData[0]?.league_type === 'keeper' && leagueData[0]?.keeper_count) keeperCount = leagueData[0].keeper_count;
    }
    if (!format) format = 'sf';

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

    // Get pick IDs - try both specific slot and round-level (for ALL teams, not just current)
    const allRosterPicks = fleaflickerData.rosters.flatMap(r => r.draftPicks || []);
    const specificPickIds = allRosterPicks.map(pick =>
        `FP_${pick.season}_${pick.round}.${String(pick.slot).padStart(2, '0')}`
    );
    const roundPickIds = allRosterPicks.map(pick =>
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
                age: dbPlayer.age,
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
                redraft_rank_overall: valueData?.redraft_rank_overall || null,
                redraft_rank_pos: valueData?.redraft_rank_pos || null,
                redraft_rank_tier: valueData?.redraft_rank_tier || null,
                redraft_auction_value: valueData?.redraft_auction_value || null,
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
            redraft_rank_overall: null,
            redraft_rank_pos: null,
            redraft_rank_tier: null,
            redraft_auction_value: null,
        };
    });

    const allAssets = [...playersWithData, ...enrichedPicks].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // Merge writeups
    const currentYear = new Date().getFullYear();
    const prospectRows = await db.select({ full_name: prospectData.full_name, nfl_team: prospectData.nfl_team, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
    const zapByName = new Map(prospectRows.map(p => [normalizeName(p.full_name), p]));
    const writeupRows = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
    const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
    for (const w of writeupRows) { const key = normalizeName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
    const allAssetsWithWriteups = allAssets.map(p => {
        const zap = zapByName.get(normalizeName(p.full_name));
        const wu = writeupsByName.get(normalizeName(p.full_name)) || null;
        return { ...p, zap_score: zap?.zap_score ? parseFloat(String(zap.zap_score)) : null, zap_analysis: zap?.analysis_text || null, zap_category: zap?.zap_category || null, zap_comps: zap?.statistical_comparables || null, writeups: wu };
    });

    const totalValue = allAssets.reduce((sum, p) => sum + (p.fc_value || 0), 0);
    
    // Calculate value dropped for keeper leagues
    let valueDropped = 0;
    if (keeperCount && keeperCount > 0) {
        const playersOnly = playersWithData;
        if (playersOnly.length > keeperCount) {
            const sortedPlayers = [...playersOnly].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            valueDropped = sortedPlayers.slice(keeperCount).reduce((sum, p) => sum + (p.fc_value || 0), 0);
        }
    }
    
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
    const rankingsVintage = formatVintage(await getRankingsVintage(format));

    // Fetch advanced stats for rostered players (most recent season)
    const rosterSleeperIds = matchedPlayers.map(p => p.sleeper_id);
    const advancedStatsRows = rosterSleeperIds.length > 0
        ? await db
            .select({
                sleeper_id: playerAdvancedStats.sleeper_id,
                season: playerAdvancedStats.season,
                target_share: playerAdvancedStats.target_share,
                avg_separation: playerAdvancedStats.avg_separation,
                rush_yards_over_expected_per_att: playerAdvancedStats.rush_yards_over_expected_per_att,
                completion_pct_above_expected: playerAdvancedStats.completion_pct_above_expected,
                offense_snap_pct: playerAdvancedStats.offense_snap_pct,
                rushing_yards: playerAdvancedStats.rushing_yards,
            })
            .from(playerAdvancedStats)
            .where(inArray(playerAdvancedStats.sleeper_id, rosterSleeperIds))
            .orderBy(desc(playerAdvancedStats.season))
        : [];
    
    // Build a map of sleeper_id -> most recent season stats
    const advancedStatsMap: Record<string, { target_share?: string | null; avg_separation?: string | null; rush_yards_over_expected_per_att?: string | null; completion_pct_above_expected?: string | null; offense_snap_pct?: string | null; rushing_yards?: number | null }> = {};
    for (const row of advancedStatsRows) {
        if (row.sleeper_id && !advancedStatsMap[row.sleeper_id]) {
            advancedStatsMap[row.sleeper_id] = {
                target_share: row.target_share,
                avg_separation: row.avg_separation,
                rush_yards_over_expected_per_att: row.rush_yards_over_expected_per_att,
                completion_pct_above_expected: row.completion_pct_above_expected,
                offense_snap_pct: row.offense_snap_pct,
                rushing_yards: row.rushing_yards,
            };
        }
    }

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
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
            redraft_rank_tier: playerValues.redraft_rank_tier,
            redraft_auction_value: playerValues.redraft_auction_value,
            years_exp: players.years_exp,
            age: players.age,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(inArray(players.sleeper_id, allLeaguePlayerIds));

    // Create roster-to-owner name map
    const rosterToOwnerMap = new Map(
        fleaflickerData.rosters.map(r => [r.id, r.name])
    );

    // Create ownership map (use allPlayers for lookup so all teams' players are included)
    const allPlayersNameMap = new Map(allPlayers.map(p => [normalizeName(p.full_name), p]));
    const playerOwnershipMap = new Map<string, number>();
    fleaflickerData.rosters.forEach(r => {
        r.players.forEach(p => {
            const dbPlayer = allPlayersNameMap.get(normalizeName(p.full_name));
            if (dbPlayer) {
                playerOwnershipMap.set(dbPlayer.sleeper_id, r.id);
            }
        });
    });

    // Add other teams' picks to allLeagueValues and ownership map
    const otherTeamsPicks: any[] = [];
    for (const r of fleaflickerData.rosters) {
        if (r.id === parseInt(teamId)) continue; // skip current team's picks (already in myPlayers)
        for (const pick of r.draftPicks) {
            // Try specific pick slot first, fall back to generic round
            const specificPickId = `FP_${pick.season}_${pick.round}.${String(pick.slot).padStart(2, '0')}`;
            const roundPickId = getPickFantasyCalcId(pick.season.toString(), pick.round);
            const specificValue = values.find(v => v.sleeper_id === specificPickId);
            const roundValue = values.find(v => v.sleeper_id === roundPickId);
            const pickValue = specificValue || roundValue;
            const fcVal = pickValue ? (format === 'sf' ? pickValue.fc_value_sf : pickValue.fc_value_1qb) : null;
            if (!fcVal) continue;
            const ownerName = rosterToOwnerMap.get(r.id) || '';
            otherTeamsPicks.push({
                sleeper_id: `${specificPickId}_${r.id}`,
                full_name: `${pick.season} Round ${pick.round}${pick.slot ? `.${String(pick.slot).padStart(2, '0')}` : ''} (${ownerName})`,
                position: 'PICK',
                team: null,
                fc_value: fcVal,
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
                redraft_rank_overall: null,
                redraft_rank_pos: null,
                redraft_rank_tier: null,
                redraft_auction_value: null,
            });
            playerOwnershipMap.set(`${specificPickId}_${r.id}`, r.id);
        }
    }
    const allLeagueValuesWithPicks = [...allLeagueValues, ...otherTeamsPicks];

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6">
                    <div className="flex items-center justify-end mb-4">
                        <div className="flex items-center gap-3">
                            <TradeEvaluator
                                myPlayers={allAssetsWithWriteups as any[]}
                                allLeaguePlayers={allLeagueValuesWithPicks as any[]}
                                playerOwnershipMap={playerOwnershipMap}
                                rosterToOwnerMap={rosterToOwnerMap}
                                currentRosterId={Number(teamId)}
                                scoringFormat={format}
                                leagueId={leagueId}
                                platform="fleaflicker"
                                keeperCount={keeperCount}
                                customRankingsMap={rankingsMap}
                            />
                        </div>
                    </div>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 md:text-3xl">
                        {roster.name}
                    </h1>
                    <div className="mt-2 flex items-center gap-4 flex-wrap">
                        <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                            Total Value: {totalValue.toLocaleString()}
                        </p>
                        {keeperCount && keeperCount > 0 && (
                            <p className="text-sm font-mono text-red-600 dark:text-red-400">
                                <span className="text-xs text-zinc-500 font-sans">Value Dropped:</span> {valueDropped.toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>

                <TeamHealthDashboard
                    myTeam={{
                        rosterId: Number(teamId),
                        ownerName: roster.name,
                        players: allAssetsWithWriteups as any[],
                    }}
                    allTeams={fleaflickerData.rosters.map(r => ({
                        rosterId: r.id,
                        ownerName: r.name,
                        players: r.players.map(p => {
                            const norm = normalizeName(p.full_name);
                            const db = allPlayers.find(ap => normalizeName(ap.full_name) === norm);
                            if (!db) return null;
                            const v = values.find(val => val.sleeper_id === db.sleeper_id) || allLeagueValues.find(val => val.sleeper_id === db.sleeper_id);
                            return { sleeper_id: db.sleeper_id, full_name: db.full_name, position: db.position, age: db.age, fc_value: v ? (format === 'sf' ? (v as any).fc_value_sf : (v as any).fc_value_1qb) || (v as any).fc_value || 0 : 0, fc_rank_sf: (v as any)?.fc_rank_sf, fc_rank_1qb: (v as any)?.fc_rank_1qb, redraft_rank_overall: (v as any)?.redraft_rank_overall };
                        }).filter(Boolean) as any[],
                    }))}
                    format={format}
                />

                {/* Pending Trades from Fleaflicker */}
                <PendingTrades
                    leagueId={leagueId}
                    teamId={teamId}
                    teamName={roster.name}
                    playerValueMap={Object.fromEntries(
                        [...allAssetsWithWriteups, ...allLeagueValuesWithPicks].map((p: any) => [
                            normalizeName(p.full_name || ''),
                            { dynastyValue: p.fc_value || 0, auctionValue: p.redraft_auction_value || null, position: p.position || '' }
                        ])
                    )}
                    allLeaguePlayers={fleaflickerData.rosters.flatMap(r =>
                        r.players.map(p => {
                            const norm = normalizeName(p.full_name || '');
                            const allData = [...allAssetsWithWriteups, ...allLeagueValuesWithPicks] as any[];
                            const match = allData.find(ap => normalizeName(ap.full_name || '') === norm);
                            return { name: p.full_name || '', position: match?.position || '', dynastyValue: match?.fc_value || 0, auctionValue: match?.redraft_auction_value || null, teamName: r.name || '', sleeper_id: match?.sleeper_id || null };
                        })
                    )}
                    allLeaguePicks={fleaflickerData.rosters.flatMap(r =>
                        r.draftPicks.filter(pk => pk.season >= new Date().getFullYear()).map(pk => {
                            const specificPickId = `FP_${pk.season}_${pk.round}.${String(pk.slot).padStart(2, '0')}`;
                            const roundPickId = getPickFantasyCalcId(String(pk.season), pk.round);
                            const specificValue = values.find(v => v.sleeper_id === specificPickId);
                            const roundValue = values.find(v => v.sleeper_id === roundPickId);
                            const pickValue = specificValue || roundValue;
                            const fcVal = pickValue ? (format === 'sf' ? pickValue.fc_value_sf : pickValue.fc_value_1qb) : null;
                            return { season: pk.season, round: pk.round, slot: pk.slot || 0, teamName: r.name || '', estimatedValue: fcVal || (pk.round === 1 ? 3000 : pk.round === 2 ? 1500 : 800), sleeper_id: specificPickId };
                        })
                    )}
                />

                {keeperCount && keeperCount > 0 && (
                    <KeeperDecisionTool
                        players={allAssetsWithWriteups as any[]}
                        scoringFormat={format}
                        keeperCount={keeperCount}
                        leagueId={leagueId}
                    />
                )}

                <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                    <TeamRosterComposition players={allAssetsWithWriteups as any[]} format={format} customRankingsMap={rankingsMap} />
                </div>

                <TeamRosterTable
                    players={allAssetsWithWriteups as any[]}
                    scoringFormat={format}
                    positionValues={positionValues}
                    allLeaguePlayers={allLeagueValues as any[]}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={parseInt(teamId)}
                    customRankingsMap={rankingsMap}
                    rankingSources={activeSources}
                    keeperCount={keeperCount}
                    rankingsVintage={rankingsVintage}
                    advancedStatsMap={advancedStatsMap}
                />

                <SavedTrades
                    leagueId={leagueId}
                    platform="fleaflicker"
                    playerMap={new Map([...allAssetsWithWriteups, ...allLeagueValuesWithPicks].map((p: any) => [p.sleeper_id, { sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, fc_value: p.fc_value }]))}
                />
            </div>
        </div>
    );
}
