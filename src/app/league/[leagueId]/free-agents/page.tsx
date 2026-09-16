import { db } from "@/db";
import { players, playerValues, leagues, prospectData, prospectWriteups } from "@/db/schema";
import { getLeagueData, getSleeperRosterPositions } from "@/lib/sleeper";
import { desc, eq, notInArray, and, not, like, inArray, sql } from "drizzle-orm";
import { FreeAgentTable } from "@/components/FreeAgentTable";
import Link from "next/link";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { cleanseName } from "@/lib/nameUtils";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";
import { recommendWaiverValue, type WaiverValuePlayer } from "@/lib/waiver-value";
import { buildRosterConfig } from "@/lib/transaction-suggestions";
import { WaiverValueCard } from "@/components/WaiverValueCard";
import { FreeAgentTeamSelector } from "@/components/FreeAgentTeamSelector";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

/** The player-values columns the FA table + value engine need (format-resolved). */
function valueColumns(format: '1qb' | 'sf') {
    return {
        sleeper_id: players.sleeper_id,
        full_name: players.full_name,
        position: players.position,
        team: players.team,
        years_exp: players.years_exp,
        fc_value: format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
        fc_rank: format === 'sf' ? playerValues.fc_rank_sf : playerValues.fc_rank_1qb,
        fc_position_rank: format === 'sf' ? playerValues.fc_position_rank_sf : playerValues.fc_position_rank_1qb,
        fc_combined_value: playerValues.fc_combined_value,
        fc_trend_30_day: playerValues.fc_trend_30_day,
        fc_trade_frequency: playerValues.fc_trade_frequency,
        rank_overall: format === 'sf' ? playerValues.rank_sf_overall : playerValues.rank_1qb_overall,
        rank_pos: format === 'sf' ? playerValues.rank_sf_pos : playerValues.rank_1qb_pos,
        rank_tier: format === 'sf' ? playerValues.rank_sf_tier : playerValues.rank_1qb_tier,
        redraft_rank_overall: playerValues.redraft_rank_overall,
        redraft_rank_pos: playerValues.redraft_rank_pos,
        redraft_rank_tier: playerValues.redraft_rank_tier,
        rank_ros_overall: playerValues.rank_ros_overall,
        rank_ros_pos: playerValues.rank_ros_pos,
        rank_ros_tier: playerValues.rank_ros_tier,
        rank_ros_ppg: playerValues.rank_ros_ppg,
        ros_sos: playerValues.ros_sos,
        ros_next4_sos: playerValues.ros_next4_sos,
        bye_week: playerValues.bye_week,
    };
}

export default async function SleeperFreeAgentsPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string; team?: string }> }) {
    const { leagueId } = await params;
    const { format: formatParam, team: teamParam } = await searchParams;
    let format: '1qb' | 'sf' | undefined = (formatParam === 'sf' || formatParam === '1qb') ? formatParam : undefined;
    if (!format) {
        const leagueData = await db.select({ scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
    }
    if (!format) format = 'sf';

    try {
        // 1. Live Sleeper data: rosters (players are sleeper_ids) + users for team names.
        const { rosters, users } = await getLeagueData(leagueId);

        // 2. Rostered player IDs (for FA exclusion).
        const allSleeperIds = rosters.flatMap((r) => r.players || []);
        if (allSleeperIds.length === 0) allSleeperIds.push('dummy');

        // 3. Top-200 free agents (not rostered, skill positions).
        const freeAgents = await db
            .select(valueColumns(format))
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(
                and(
                    notInArray(players.sleeper_id, allSleeperIds),
                    not(like(players.sleeper_id, '%pick%')),
                    inArray(players.position, ['QB', 'RB', 'WR', 'TE'])
                )
            )
            .orderBy(desc(format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb))
            .limit(200);

        // Merge prospect writeups + ZAP data.
        const currentYear = new Date().getFullYear();
        const prospects = await db.select({ full_name: prospectData.full_name, nfl_team: prospectData.nfl_team, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
        const zapByName = new Map(prospects.map(p => [cleanseName(p.full_name), p]));
        const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
        const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
        for (const w of writeups) { const key = cleanseName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
        const freeAgentsWithWriteups = freeAgents.map(p => {
            const zap = zapByName.get(cleanseName(p.full_name));
            const wu = writeupsByName.get(cleanseName(p.full_name)) || null;
            return { ...p, zap_score: zap?.zap_score ? parseFloat(String(zap.zap_score)) : null, zap_analysis: zap?.analysis_text || null, zap_category: zap?.zap_category || null, zap_comps: zap?.statistical_comparables || null, writeups: wu };
        });

        // Stamp this week's rank onto each free agent (most up-to-date start/sit signal).
        const { week: weeklyWeek, byId: weeklyById } = await getWeeklyRanks(freeAgentsWithWriteups.map(p => p.sleeper_id));
        const freeAgentsFinal = freeAgentsWithWriteups.map(p => {
            const info = rankForPosition(p.position, weeklyById.get(p.sleeper_id));
            return {
                ...p,
                rank_ros_ppg: p.rank_ros_ppg != null ? Number(p.rank_ros_ppg) : null,
                weekly_rank: info.rank,
                weekly_total: info.total,
                weekly_pos_matchup: info.posMatchup,
            };
        });

        const positionTotals = freeAgentsFinal.reduce((acc, player) => {
            const pos = player.position || 'UNK';
            if (!acc[pos]) acc[pos] = 0;
            acc[pos] += player.fc_value || 0;
            return acc;
        }, {} as Record<string, number>);

        const rankingsVintage = formatVintage(await getRankingsVintage(format));

        // Team-aware value recommendations (?team= = roster_id).
        let waiverRecs: ReturnType<typeof recommendWaiverValue> = [];
        if (teamParam) {
            const myRoster = rosters.find(r => String(r.roster_id) === teamParam);
            if (myRoster && (myRoster.players?.length ?? 0) > 0) {
                // Pull my roster players' value rows (they're excluded from the FA query).
                const myRows = await db
                    .select(valueColumns(format))
                    .from(players)
                    .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
                    .where(inArray(players.sleeper_id, myRoster.players));

                const toWvp = (p: typeof myRows[number] | typeof freeAgentsFinal[number]): WaiverValuePlayer => ({
                    sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team,
                    fc_value: p.fc_value,
                    rosRank: p.rank_ros_overall ?? null, rosPosRank: p.rank_ros_pos ?? null,
                    rosPpg: p.rank_ros_ppg != null ? Number(p.rank_ros_ppg) : null,
                    rosSos: p.ros_sos ?? null, byeWeek: p.bye_week ?? null,
                    weeklyRank: (p as typeof freeAgentsFinal[number]).weekly_rank ?? null,
                });
                const myWvp = myRows.filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || "")).map(toWvp);
                const faWvp = freeAgentsFinal.map(toWvp);
                const rosterPositions = await getSleeperRosterPositions(leagueId);
                const config = buildRosterConfig(rosterPositions);
                waiverRecs = recommendWaiverValue(myWvp, faWvp, config, { actualCoreCount: myRoster.players.length, limit: 15 });
            }
        }

        const teamOptions = rosters.map(r => ({
            id: String(r.roster_id),
            name: users.find(u => u.user_id === r.owner_id)?.display_name || `Team ${r.roster_id}`,
        }));

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
                    <div className="mb-6 sm:mb-8">
                        <Link href={`/league/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                            ← Back to League
                        </Link>

                        <div className="flex items-center justify-between gap-4 flex-wrap bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                                <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in league (Top 200 by {format === 'sf' ? 'SF' : '1QB'} Value)</div>
                            </div>
                            <FreeAgentTeamSelector
                                platform="sleeper"
                                leagueId={leagueId}
                                currentTeam={teamParam ?? null}
                                teams={teamOptions}
                            />
                        </div>
                    </div>

                    {/* Team-aware value recommendations: adds WITH the guarded drop. */}
                    {waiverRecs.length > 0 && (
                        <div className="mb-6">
                            <WaiverValueCard recs={waiverRecs} />
                        </div>
                    )}

                    {/* Position Value Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        {['QB', 'RB', 'WR', 'TE'].map(pos => (
                            <div key={pos} className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm ring-1 ring-zinc-900/5 p-4">
                                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{pos}</div>
                                <div className="mt-1 text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                    {(positionTotals[pos] || 0).toLocaleString()}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1">Available Value</div>
                            </div>
                        ))}
                    </div>

                    <FreeAgentTable players={freeAgentsFinal} rankingsVintage={rankingsVintage} weeklyWeek={weeklyWeek} />
                </div>
            </div>
        );

    } catch (error) {
        console.error(error);
        return (
            <div className="p-10 text-center">
                <h1 className="text-2xl font-bold text-red-600">Error loading free agents</h1>
            </div>
        )
    }
}
