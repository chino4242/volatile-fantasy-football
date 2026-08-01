import { db } from "@/db";
import { players, playerValues, leagues, prospectData, prospectWriteups, playerAdvancedStats } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId, getAllDraftPicks, getSleeperTransactions } from "@/lib/sleeper";
import { getCustomRankings, buildCustomRankingsMap, getActiveSources } from "@/lib/custom-rankings";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { sql, desc } from "drizzle-orm";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import TeamRosterView from "./TeamRosterView";
import { TeamRosterComposition } from "./TeamRosterComposition";
import TradeEvaluator from "@/components/TradeEvaluator";
import TeamHealthDashboard from "@/components/TeamHealthDashboard";
import { SavedTrades } from "@/components/SavedTrades";
import { KeeperDecisionTool } from "@/components/KeeperDecisionTool";
import { SleeperTradeHistory } from "@/components/SleeperTradeHistory";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string; rosterId: string }>;
}

export default async function TeamPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string; keepers?: string }> }) {
    const { leagueId, rosterId } = await params;
    const { format: formatParam, keepers: keepersParam } = await searchParams;
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const leagueData = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && leagueData[0]?.league_type === 'keeper' && leagueData[0]?.keeper_count) keeperCount = leagueData[0].keeper_count;
    }
    if (!format) format = 'sf';

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
            age: players.age,
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

    // Add other teams' picks to allLeaguePlayers and ownership map
    const playerMap = new Map(dbPlayers.map(p => [p.sleeper_id, p]));
    const otherTeamsPicks = allPicks
        .filter(pick => pick.currentOwner !== Number(rosterId))
        .map(pick => {
            const pickId = getPickFantasyCalcId(pick.season, pick.round);
            const pickData = playerMap.get(pickId);
            const ownerName = rosterToOwnerMap.get(pick.currentOwner) || '';
            const uniqueId = `${pickId}_${pick.currentOwner}`;
            playerOwnershipMap.set(uniqueId, pick.currentOwner);
            return {
                sleeper_id: uniqueId,
                full_name: `${pick.season} Round ${pick.round} (${ownerName})`,
                position: 'PICK',
                team: null,
                fc_value: pickData?.fc_value || 0,
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
        })
        .filter(p => p.fc_value > 0);
    const allLeaguePlayersWithPicks = [...allLeaguePlayers, ...otherTeamsPicks];

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
            sleeper_id: `${pickId}_${pick.originalOwner}`, // Make unique by including original owner
            full_name: `${pick.season} Round ${pick.round}${ownerName ? ` (${ownerName})` : ''}`,
            position: 'PICK',
            team: null,
            fc_value: pickData?.fc_value || 0,
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

    const allAssets = [...enrichedPlayers, ...enrichedPicks].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // Merge writeups into assets
    const currentYear = new Date().getFullYear();
    const normalizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
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

    // Fetch advanced stats for rostered players
    const advancedStatsRows = rosterPlayerIds.length > 0
        ? await db.select({
            sleeper_id: playerAdvancedStats.sleeper_id,
            target_share: playerAdvancedStats.target_share,
            avg_separation: playerAdvancedStats.avg_separation,
            rush_yards_over_expected_per_att: playerAdvancedStats.rush_yards_over_expected_per_att,
            completion_pct_above_expected: playerAdvancedStats.completion_pct_above_expected,
            offense_snap_pct: playerAdvancedStats.offense_snap_pct,
            rushing_yards: playerAdvancedStats.rushing_yards,
        })
        .from(playerAdvancedStats)
        .where(inArray(playerAdvancedStats.sleeper_id, rosterPlayerIds))
        .orderBy(desc(playerAdvancedStats.season))
        : [];

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

    // Fetch recent trades from Sleeper
    const allTransactions = await getSleeperTransactions(leagueId);
    const rosterTrades = allTransactions.filter(t => t.roster_ids.includes(Number(rosterId)));

    // Build a combined player map for enriching trade data (includes picks)
    const fullPlayerMap = new Map([...dbPlayers, ...allLeaguePlayers].map(p => [p.sleeper_id, p]));

    const enrichedTrades = rosterTrades.map(t => {
        const myRosterId = Number(rosterId);
        const otherRosterIds = t.roster_ids.filter(id => id !== myRosterId);
        const otherTeamName = otherRosterIds.map(id => rosterToOwnerMap.get(id) || `Team ${id}`).join(', ');

        const youSentPlayers: { name: string; position: string; value: number }[] = [];
        const youReceivedPlayers: { name: string; position: string; value: number }[] = [];
        const youSentPicks: { season: string; round: number; value: number }[] = [];
        const youReceivedPicks: { season: string; round: number; value: number }[] = [];

        // Process player adds/drops
        if (t.adds) {
            for (const [playerId, addedToRosterId] of Object.entries(t.adds)) {
                const player = fullPlayerMap.get(playerId);
                const entry = {
                    name: player?.full_name || `Player ${playerId}`,
                    position: player?.position || '',
                    value: player?.fc_value || 0,
                };
                if (addedToRosterId === myRosterId) {
                    youReceivedPlayers.push(entry);
                } else {
                    youSentPlayers.push(entry);
                }
            }
        }

        // Process draft picks
        for (const pick of t.draft_picks) {
            const pickId = getPickFantasyCalcId(pick.season, pick.round);
            const pickData = fullPlayerMap.get(pickId);
            const entry = {
                season: pick.season,
                round: pick.round,
                value: pickData?.fc_value || 0,
            };
            if (pick.owner_id === myRosterId) {
                youReceivedPicks.push(entry);
            } else {
                youSentPicks.push(entry);
            }
        }

        return {
            id: t.transaction_id,
            created: t.created,
            otherTeamName,
            youSent: { players: youSentPlayers, picks: youSentPicks },
            youReceived: { players: youReceivedPlayers, picks: youReceivedPicks },
        };
    });

    // 7. Calculate stats including picks
    const pickValue = rosterPicks.reduce((sum, pick) => {
        const pickId = getPickFantasyCalcId(pick.season, pick.round);
        return sum + (playerMap.get(pickId)?.fc_value || 0);
    }, 0);

    const totalValue = enrichedPlayers.reduce((sum, p) => sum + (p!.fc_value || 0), 0) + pickValue;
    
    // Calculate value dropped for keeper leagues
    let valueDropped = 0;
    if (keeperCount && keeperCount > 0) {
        const playersOnly = enrichedPlayers.filter(p => p!.position !== 'PICK');
        if (playersOnly.length > keeperCount) {
            const sortedPlayers = [...playersOnly].sort((a, b) => (b!.fc_value || 0) - (a!.fc_value || 0));
            valueDropped = sortedPlayers.slice(keeperCount).reduce((sum, p) => sum + (p!.fc_value || 0), 0);
        }
    }
    
    const positionValues: Record<string, number> = {};
    enrichedPlayers.forEach(p => {
        const pos = p!.position || 'UNK';
        positionValues[pos] = (positionValues[pos] || 0) + (p!.fc_value || 0);
    });
    positionValues['PICK'] = pickValue;

    // Fetch custom rankings
    const customRankings = await getCustomRankings();
    const rankingsMap = buildCustomRankingsMap(customRankings);
    const activeSources = await getActiveSources();
    const rankingsVintage = formatVintage(await getRankingsVintage(format));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                            <TradeEvaluator
                                myPlayers={allAssetsWithWriteups as any[]}
                                allLeaguePlayers={allLeaguePlayersWithPicks as any[]}
                                playerOwnershipMap={playerOwnershipMap}
                                rosterToOwnerMap={rosterToOwnerMap}
                                currentRosterId={Number(rosterId)}
                                scoringFormat={format}
                                leagueId={leagueId}
                                platform="sleeper"
                                keeperCount={keeperCount}
                            />
                        </div>
                    </div>

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
                            <div className="mt-1 sm:mt-2 flex items-center gap-4 flex-wrap">
                                <div className="text-xl sm:text-2xl font-mono font-bold text-green-600 dark:text-green-400">
                                    {totalValue.toLocaleString()} <span className="text-xs sm:text-sm font-sans text-zinc-500 font-normal">pts</span>
                                </div>
                                {keeperCount && keeperCount > 0 && (
                                    <div className="text-sm sm:text-base font-mono text-red-600 dark:text-red-400">
                                        <span className="text-xs text-zinc-500 font-sans">Value Dropped:</span> {valueDropped.toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <TeamHealthDashboard
                    myTeam={{
                        rosterId: Number(rosterId),
                        ownerName: owner?.display_name || 'Unknown',
                        players: allAssetsWithWriteups as any[],
                    }}
                    allTeams={rosters.map(r => {
                        const u = users.find(user => user.user_id === r.owner_id);
                        const leaguePlayerMap = new Map(allLeaguePlayers.map(p => [p.sleeper_id, p]));
                        return {
                            rosterId: r.roster_id,
                            ownerName: u?.display_name || `Team ${r.roster_id}`,
                            players: (r.players || []).map(pid => leaguePlayerMap.get(pid)).filter(Boolean) as any[],
                        };
                    })}
                    format={format}
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

                <TeamRosterView
                    players={allAssetsWithWriteups as any[]}
                    scoringFormat={format}
                    positionValues={positionValues}
                    allLeaguePlayers={allLeaguePlayers as any[]}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={Number(rosterId)}
                    customRankingsMap={rankingsMap}
                    rankingSources={activeSources}
                    keeperCount={keeperCount}
                    rankingsVintage={rankingsVintage}
                    advancedStatsMap={advancedStatsMap}
                />

                <SavedTrades
                    leagueId={leagueId}
                    platform="sleeper"
                    playerMap={new Map([...allAssetsWithWriteups, ...allLeaguePlayersWithPicks].map((p: any) => [p.sleeper_id, { sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, fc_value: p.fc_value }]))}
                />

                <SleeperTradeHistory trades={enrichedTrades} />
            </div>
        </div>
    );
}
