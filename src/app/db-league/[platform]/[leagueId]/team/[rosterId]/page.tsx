import { notFound } from "next/navigation";
import Link from "next/link";
import { getDbLeagueData, type DbPlatform } from "@/lib/db-league-data";
import { getCustomRankings, buildCustomRankingsMap, getActiveSources } from "@/lib/custom-rankings";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { buildRosterConfig } from "@/lib/transaction-suggestions";
import { optimizeTeam } from "@/lib/weekly-rankings";
import { getWeeklyRanks, rankForPosition } from "@/lib/weekly-rankings";
import { LineupOptimizerCard } from "@/components/LineupOptimizerCard";
import { recommendWaiverValue, type WaiverValuePlayer } from "@/lib/waiver-value";
import { WaiverValueCard } from "@/components/WaiverValueCard";
import { db } from "@/db";
import { leagues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTeamSlotGaps } from "@/lib/team-slot-gaps";
import { getStartedTeams } from "@/lib/nfl-live";
import { deepLinkFor } from "@/lib/action-center";
import { RosterGapsCard } from "@/components/RosterGapsCard";
import TeamRosterView from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterView";
import { TeamRosterComposition } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterComposition";
import TradeEvaluator from "@/components/TradeEvaluator";
import TeamHealthDashboard from "@/components/TeamHealthDashboard";
import { SuggestedTransactions } from "@/components/SuggestedTransactions";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ platform: string; leagueId: string; rosterId: string }>;
}

export default async function DbTeamPage({ params }: PageProps) {
    const { platform, leagueId, rosterId } = await params;
    if (platform !== "myffpc" && platform !== "yahoo") notFound();

    const data = await getDbLeagueData(platform as DbPlatform, leagueId);
    if (!data) notFound();

    const numericId = Number(rosterId);
    const team = data.teams.find(t => t.numericId === numericId);
    if (!team) notFound();

    const format = data.format;

    // Shared components key off numeric roster ids + these maps (adapter provides them).
    const { rosterToOwnerMap, playerOwnershipMap } = data;

    // All league players (for trade targets / health dashboard) — flatten every team.
    const allLeaguePlayers = data.teams.flatMap(t => t.players);

    const myPlayers = team.players;

    // Position value breakdown for this roster.
    const positionValues: Record<string, number> = {};
    for (const p of myPlayers) {
        const pos = p.position || "UNK";
        positionValues[pos] = (positionValues[pos] || 0) + (p.fc_value || 0);
    }
    const totalValue = myPlayers.reduce((sum, p) => sum + (p.fc_value || 0), 0);

    // Suggested transactions inputs.
    const rosterConfig = buildRosterConfig(data.rosterPositions);
    const myPlayersForTxn = myPlayers.map(p => ({
        sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team, fc_value: p.fc_value,
    }));
    const freeAgentsForTxn = data.freeAgents.map(p => ({
        sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team, fc_value: p.fc_value,
    }));

    // Custom rankings + vintage (shared).
    const customRankings = await getCustomRankings();
    const rankingsMap = buildCustomRankingsMap(customRankings);
    const activeSources = await getActiveSources();
    const rankingsVintage = formatVintage(await getRankingsVintage(format));

    // Lineup optimizer (latest uploaded week).
    const startedTeams = await getStartedTeams(); // games already kicked off → players are locked
    const lineupOpt = await optimizeTeam(
        myPlayers.map(p => ({ sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team, is_starter: p.is_starter })),
        data.rosterPositions,
        undefined,
        { startedTeams },
    );

    // Value-based waiver recommendations (adds WITH a guarded drop), ROS-driven —
    // same engine as the free-agents page, so team + FA views agree.
    const toWvp = (p: (typeof data.teams)[number]["players"][number]): WaiverValuePlayer => ({
        sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team,
        fc_value: p.fc_value,
        rosRank: p.rank_ros_overall, rosPosRank: p.rank_ros_pos, rosPpg: p.rank_ros_ppg,
        rosSos: p.ros_sos, byeWeek: p.bye_week, weeklyRank: null,
    });
    const { byId: faWeeklyById } = await getWeeklyRanks(data.freeAgents.map(p => p.sleeper_id));
    const myWvp = myPlayers.filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || "")).map(toWvp);
    const faWvp: WaiverValuePlayer[] = data.freeAgents
        .filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || ""))
        .map(p => ({ ...toWvp(p), weeklyRank: rankForPosition(p.position, faWeeklyById.get(p.sleeper_id)).rank }));
    const waiverRecs = recommendWaiverValue(myWvp, faWvp, rosterConfig, { actualCoreCount: myPlayers.length, limit: 15 });

    // Roster Gaps: my player vs best available at each starting slot (weekly + ROS).
    // data.freeAgents already includes defenses and kickers for these platforms.
    const [leagueRow] = await db.select({ league_type: leagues.league_type }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
    const leagueTypeVal = (leagueRow?.league_type as "dynasty" | "keeper" | "redraft") || "dynasty";
    const toSource = (p: (typeof myPlayers)[number]) => ({
        sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position, team: p.team,
        fc_value: p.fc_value, is_starter: p.is_starter,
        rank_ros_overall: p.rank_ros_overall, rank_ros_pos: p.rank_ros_pos, rank_ros_ppg: p.rank_ros_ppg,
        ros_sos: p.ros_sos, ros_next4_sos: p.ros_next4_sos, bye_week: p.bye_week,
    });
    const slotGaps = await getTeamSlotGaps(
        myPlayers.map(toSource),
        data.freeAgents.map(toSource),
        data.rosterPositions,
        leagueTypeVal,
        {
            coreCapacity: rosterConfig?.coreCapacity,
            startedTeams,
            rosteredInLeague: new Set(allLeaguePlayers.map(p => p.sleeper_id)),
        },
    );

    const label = platform === "yahoo" ? "Yahoo" : "MyFFPC";

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 text-sm text-zinc-500 mb-4">
                        <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</Link>
                        <span>/</span>
                        <Link href={`/db-league/${platform}/${leagueId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{data.name}</Link>
                        <span>/</span>
                        <span className="text-zinc-900 dark:text-zinc-100 font-medium">{team.ownerName}</span>
                    </div>

                    <div className="flex items-center justify-end mb-4 flex-wrap gap-2">
                        <TradeEvaluator
                            myPlayers={myPlayers as any[]}
                            allLeaguePlayers={allLeaguePlayers as any[]}
                            playerOwnershipMap={playerOwnershipMap}
                            rosterToOwnerMap={rosterToOwnerMap}
                            currentRosterId={numericId}
                            scoringFormat={format}
                            leagueId={`${platform}/${leagueId}`}
                            platform="db"
                        />
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-xl sm:text-2xl font-bold flex-shrink-0">
                            {team.ownerName.charAt(0) || "?"}
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">{team.ownerName}</h1>
                            <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">{label} • {format.toUpperCase()}</div>
                            <div className="mt-1 sm:mt-2 text-xl sm:text-2xl font-mono font-bold text-green-600 dark:text-green-400">
                                {totalValue.toLocaleString()} <span className="text-xs sm:text-sm font-sans text-zinc-500 font-normal">pts</span>
                            </div>
                        </div>
                    </div>
                </div>

                <TeamHealthDashboard
                    myTeam={{ rosterId: numericId, ownerName: team.ownerName, players: myPlayers as any[] }}
                    allTeams={data.teams.map(t => ({ rosterId: t.numericId, ownerName: t.ownerName, players: t.players as any[] }))}
                    format={format}
                />

                <div className="mt-4">
                    <LineupOptimizerCard opt={lineupOpt} />
                </div>

                {slotGaps.gaps.length > 0 && (
                    <div className="mt-4">
                        <RosterGapsCard
                            gaps={slotGaps.gaps}
                            week={slotGaps.week}
                            hasWeeklyData={slotGaps.hasWeeklyData}
                            deepLink={deepLinkFor(platform as "yahoo" | "myffpc", leagueId, String(numericId))}
                            linkLabel={label}
                        />
                    </div>
                )}

                {waiverRecs.length > 0 && (
                    <div className="mt-4">
                        <WaiverValueCard recs={waiverRecs} />
                    </div>
                )}

                <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                    <TeamRosterComposition players={myPlayers as any[]} format={format} customRankingsMap={rankingsMap} />
                </div>

                <SuggestedTransactions
                    myPlayers={myPlayersForTxn}
                    freeAgents={freeAgentsForTxn}
                    rosterConfig={rosterConfig}
                    actualCoreCount={myPlayers.length}
                />

                <TeamRosterView
                    players={myPlayers as any[]}
                    scoringFormat={format}
                    positionValues={positionValues}
                    allLeaguePlayers={allLeaguePlayers as any[]}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={numericId}
                    customRankingsMap={rankingsMap}
                    rankingSources={activeSources}
                    rankingsVintage={rankingsVintage}
                    advancedStatsMap={{}}
                />
            </div>
        </div>
    );
}
