import { notFound } from "next/navigation";
import Link from "next/link";
import { getDbLeagueData, type DbPlatform, type DbLeaguePlayer } from "@/lib/db-league-data";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { FreeAgentTable, type FreeAgentData } from "@/components/FreeAgentTable";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";
import { recommendWaiverValue, type WaiverValuePlayer } from "@/lib/waiver-value";
import { buildRosterConfig } from "@/lib/transaction-suggestions";
import { WaiverValueCard } from "@/components/WaiverValueCard";
import { FreeAgentTeamSelector } from "@/components/FreeAgentTeamSelector";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ platform: string; leagueId: string }>;
}

export default async function DbFreeAgentsPage({ params, searchParams }: PageProps & { searchParams: Promise<{ team?: string }> }) {
    const { platform, leagueId } = await params;
    const { team: teamParam } = await searchParams;
    if (platform !== "myffpc" && platform !== "yahoo") notFound();

    const data = await getDbLeagueData(platform as DbPlatform, leagueId);
    if (!data) notFound();

    const format = data.format;
    const sf = format === "sf";

    // Map an adapter player -> the shared FreeAgentData shape (format-resolved + ROS).
    const toFreeAgentData = (p: DbLeaguePlayer): FreeAgentData => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        team: p.team,
        years_exp: p.years_exp,
        fc_value: p.fc_value,
        fc_rank: sf ? p.fc_rank_sf : p.fc_rank_1qb,
        fc_position_rank: sf ? p.fc_position_rank_sf : p.fc_position_rank_1qb,
        fc_combined_value: p.fc_combined_value,
        fc_trend_30_day: p.fc_trend_30_day,
        fc_trade_frequency: p.fc_trade_frequency != null ? String(p.fc_trade_frequency) : null,
        rank_overall: sf ? p.rank_sf_overall : p.rank_1qb_overall,
        rank_pos: sf ? p.rank_sf_pos : p.rank_1qb_pos,
        rank_tier: sf ? p.rank_sf_tier : p.rank_1qb_tier,
        redraft_rank_overall: p.redraft_rank_overall,
        redraft_rank_pos: p.redraft_rank_pos,
        redraft_rank_tier: p.redraft_rank_tier,
        rank_ros_overall: p.rank_ros_overall,
        rank_ros_pos: p.rank_ros_pos,
        rank_ros_ppg: p.rank_ros_ppg,
        ros_sos: p.ros_sos,
        ros_next4_sos: p.ros_next4_sos,
        bye_week: p.bye_week,
        zap_score: p.zap_score,
        zap_analysis: p.zap_analysis,
        zap_category: p.zap_category,
        zap_comps: p.zap_comps,
        writeups: p.writeups,
    });

    const players: FreeAgentData[] = data.freeAgents
        .filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || ""))
        .map(toFreeAgentData);

    // Stamp this week's rank onto each free agent.
    const { week: weeklyWeek, byId: weeklyById } = await getWeeklyRanks(players.map(p => p.sleeper_id));
    for (const p of players) {
        const info = rankForPosition(p.position, weeklyById.get(p.sleeper_id));
        p.weekly_rank = info.rank;
        p.weekly_total = info.total;
        p.weekly_pos_matchup = info.posMatchup;
    }

    const positionTotals = players.reduce((acc, p) => {
        const pos = p.position || "UNK";
        acc[pos] = (acc[pos] || 0) + (p.fc_value || 0);
        return acc;
    }, {} as Record<string, number>);

    const rankingsVintage = formatVintage(await getRankingsVintage(format));

    // Team-aware value recommendations (?team= = numericId).
    let waiverRecs: ReturnType<typeof recommendWaiverValue> = [];
    if (teamParam) {
        const myTeam = data.teams.find(t => String(t.numericId) === teamParam);
        if (myTeam) {
            const toWvp = (p: DbLeaguePlayer): WaiverValuePlayer => ({
                sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team,
                fc_value: p.fc_value,
                rosRank: p.rank_ros_overall, rosPosRank: p.rank_ros_pos, rosPpg: p.rank_ros_ppg,
                rosSos: p.ros_sos, byeWeek: p.bye_week, weeklyRank: null,
            });
            const myWvp = myTeam.players.filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || "")).map(toWvp);
            const faWvp: WaiverValuePlayer[] = data.freeAgents
                .filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || ""))
                .map(p => {
                    const info = rankForPosition(p.position, weeklyById.get(p.sleeper_id));
                    return { ...toWvp(p), weeklyRank: info.rank };
                });
            const config = buildRosterConfig(data.rosterPositions);
            waiverRecs = recommendWaiverValue(myWvp, faWvp, config, { actualCoreCount: myTeam.players.length, limit: 15 });
        }
    }

    const teamOptions = data.teams.map(t => ({ id: String(t.numericId), name: t.ownerName }));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <Link href={`/db-league/${platform}/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                        ← Back to League
                    </Link>

                    <div className="flex items-center justify-between gap-4 flex-wrap bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                            <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in {data.name} (by {sf ? "SF" : "1QB"} Value)</div>
                        </div>
                        <FreeAgentTeamSelector
                            platform={platform}
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

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {["QB", "RB", "WR", "TE"].map(pos => (
                        <div key={pos} className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm ring-1 ring-zinc-900/5 p-4">
                            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{pos}</div>
                            <div className="mt-1 text-2xl font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                {(positionTotals[pos] || 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">Available Value</div>
                        </div>
                    ))}
                </div>

                <FreeAgentTable players={players} rankingsVintage={rankingsVintage} weeklyWeek={weeklyWeek} />
            </div>
        </div>
    );
}
