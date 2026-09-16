import { db } from "@/db";
import { players, playerValues, leagues, prospectData, prospectWriteups } from "@/db/schema";
import { getFleaflickerLeague, getFleaflickerRosterSlots } from "@/lib/fleaflicker";
import { desc, eq, and, not, like, inArray, sql } from "drizzle-orm";
import { FreeAgentTable } from "@/components/FreeAgentTable";
import { FaabTargets } from "@/components/FaabTargets";
import Link from "next/link";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { cleanseName } from "@/lib/nameUtils";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";
import { recommendWaiverValue, type WaiverValuePlayer } from "@/lib/waiver-value";
import { buildRosterConfigFromSlots } from "@/lib/transaction-suggestions";
import { WaiverValueCard } from "@/components/WaiverValueCard";
import { FreeAgentTeamSelector } from "@/components/FreeAgentTeamSelector";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function FleaflickerFreeAgentsPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string; team?: string }> }) {
    const { leagueId } = await params;
    const { format: formatParam, team: teamParam } = await searchParams;
    let format: '1qb' | 'sf' | undefined = (formatParam === 'sf' || formatParam === '1qb') ? formatParam : undefined;
    if (!format) {
        const leagueData = await db.select({ scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
    }
    if (!format) format = 'sf';

    try {
        // 1. Fetch live Fleaflicker data
        const fleaflickerData = await getFleaflickerLeague(leagueId);

        // Normalize names: lowercase, strip punctuation, strip common suffixes (Jr/Sr/II/III/IV)
        // This handles Fleaflicker returning "Marvin Harrison" while DB has "Marvin Harrison Jr"

        const allPlayerNames = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.players.forEach(p => {
                if (p.full_name) allPlayerNames.add(cleanseName(p.full_name));
            });
        });

        // 3. Query DB for top valued players using the specified format
        const dbPlayers = await db
            .select({
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
                redraft_auction_value: playerValues.redraft_auction_value,
                rank_ros_overall: playerValues.rank_ros_overall,
                rank_ros_pos: playerValues.rank_ros_pos,
                rank_ros_tier: playerValues.rank_ros_tier,
                rank_ros_ppg: playerValues.rank_ros_ppg,
                ros_sos: playerValues.ros_sos,
                ros_next4_sos: playerValues.ros_next4_sos,
                bye_week: playerValues.bye_week,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(
                and(
                    not(like(players.sleeper_id, '%pick%')),
                    inArray(players.position, ['QB', 'RB', 'WR', 'TE'])
                )
            )
            .orderBy(desc(format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb))
            .limit(1000); // Fetch enough to ensure we have 200 after filtering

        // 4. Filter out rostered players using normalized name matching
        const freeAgents = dbPlayers
            .filter(p => !allPlayerNames.has(cleanseName(p.full_name || '')))
            .slice(0, 200);

        // Merge prospect writeups and ZAP data
        const currentYear = new Date().getFullYear();
        const prospects = await db.select({ full_name: prospectData.full_name, nfl_team: prospectData.nfl_team, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
        const zapByName = new Map(prospects.map(p => [cleanseName(p.full_name), p]));
        const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
        const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
        for (const w of writeups) { const key = cleanseName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
        const freeAgentsWithWriteups = freeAgents.map(p => {
            const zap = zapByName.get(cleanseName(p.full_name || ''));
            const wu = writeupsByName.get(cleanseName(p.full_name || '')) || null;
            return { ...p, zap_score: zap?.zap_score ? parseFloat(String(zap.zap_score)) : null, zap_analysis: zap?.analysis_text || null, zap_category: zap?.zap_category || null, zap_comps: zap?.statistical_comparables || null, writeups: wu };
        });

        // Stamp this week's rank (flex/qb/dst pools) onto each free agent so the
        // table can show "current weekly rank" — the most up-to-date start/sit signal.
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

        // Calculate position totals for free agents
        const positionTotals = freeAgentsFinal.reduce((acc, player) => {
            const pos = player.position || 'UNK';
            if (!acc[pos]) acc[pos] = 0;
            acc[pos] += player.fc_value || 0;
            return acc;
        }, {} as Record<string, number>);

        const rankingsVintage = formatVintage(await getRankingsVintage(format));

        // Fetch user's roster for personalized waiver recommendations (?team=).
        let myRoster: { full_name: string; position: string | null; fc_value: number | null; redraft_rank_overall: number | null; redraft_auction_value: number | null }[] = [];
        let rosterSlots: { QB: number; RB: number; WR: number; TE: number; FLEX: number } | undefined;
        // Value-based waiver recommendations (adds WITH a guarded drop), ROS-driven.
        let waiverRecs: ReturnType<typeof recommendWaiverValue> = [];
        if (teamParam) {
            const teamId = parseInt(teamParam);
            const userRoster = fleaflickerData.rosters.find(r => r.id === teamId);
            if (userRoster) {
                // Match roster players to DB rows (values / ranks / ROS) by name.
                const myRosterRows = userRoster.players.map(p => {
                    const dbMatch = dbPlayers.find(db => cleanseName(db.full_name || '') === cleanseName(p.full_name));
                    return { ffName: p.full_name, db: dbMatch };
                });
                myRoster = myRosterRows.map(({ ffName, db }) => ({
                    full_name: ffName,
                    position: db?.position || null,
                    fc_value: db?.fc_value || null,
                    redraft_rank_overall: db?.redraft_rank_overall || null,
                    redraft_auction_value: null,
                }));
                const slots = await getFleaflickerRosterSlots(leagueId);
                rosterSlots = slots;

                // Map both sides into the value engine's WaiverValuePlayer shape.
                const toWvp = (db: typeof dbPlayers[number]): WaiverValuePlayer => ({
                    sleeper_id: db.sleeper_id, full_name: db.full_name, position: db.position, team: db.team,
                    fc_value: db.fc_value,
                    rosRank: db.rank_ros_overall ?? null, rosPosRank: db.rank_ros_pos ?? null,
                    rosPpg: db.rank_ros_ppg != null ? Number(db.rank_ros_ppg) : null,
                    rosSos: db.ros_sos ?? null, byeWeek: db.bye_week ?? null,
                    weeklyRank: null,
                });
                const myWvp = myRosterRows
                    .filter(({ db }) => db && ["QB", "RB", "WR", "TE"].includes(db.position || ""))
                    .map(({ db }) => toWvp(db!));
                const faWvp: WaiverValuePlayer[] = freeAgentsFinal.map(p => ({
                    sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team,
                    fc_value: p.fc_value,
                    rosRank: p.rank_ros_overall ?? null, rosPosRank: p.rank_ros_pos ?? null,
                    rosPpg: p.rank_ros_ppg != null ? Number(p.rank_ros_ppg) : null,
                    rosSos: p.ros_sos ?? null, byeWeek: p.bye_week ?? null,
                    weeklyRank: p.weekly_rank ?? null,
                }));
                const config = buildRosterConfigFromSlots(slots);
                waiverRecs = recommendWaiverValue(myWvp, faWvp, config, { actualCoreCount: userRoster.players.length, limit: 15 });
            }
        }

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 sm:mb-8">
                        <div className="flex items-center justify-between gap-4 flex-wrap bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                                <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in league (Top 200 by {format === 'sf' ? 'SF' : '1QB'} Value)</div>
                            </div>
                            <FreeAgentTeamSelector
                                platform="fleaflicker"
                                leagueId={leagueId}
                                currentTeam={teamParam ?? null}
                                teams={fleaflickerData.rosters.map(r => ({ id: String(r.id), name: r.owners?.[0]?.display_name || `Team ${r.id}` }))}
                            />
                        </div>
                    </div>

                    {/* Team-aware value recommendations: adds WITH the guarded drop. */}
                    {waiverRecs.length > 0 && (
                        <div className="mb-6">
                            <WaiverValueCard recs={waiverRecs} />
                        </div>
                    )}

                    {/* FAAB Targets (personalized recommendations) */}
                    {myRoster.length > 0 && (
                        <FaabTargets
                            freeAgents={freeAgentsFinal as any[]}
                            myRoster={myRoster}
                            rosterSlots={rosterSlots}
                        />
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
