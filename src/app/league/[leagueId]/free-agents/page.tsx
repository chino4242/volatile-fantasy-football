import { db } from "@/db";
import { players, playerValues, leagues, prospectData, prospectWriteups } from "@/db/schema";
import { getLeagueData, getPickFantasyCalcId } from "@/lib/sleeper";
import { desc, eq, notInArray, and, not, like, inArray, sql } from "drizzle-orm";
import { FreeAgentTable } from "@/components/FreeAgentTable";
import Link from "next/link";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ leagueId: string }>;
}

export default async function SleeperFreeAgentsPage({ params, searchParams }: PageProps & { searchParams: Promise<{ format?: string }> }) {
    const { leagueId } = await params;
    const { format: formatParam } = await searchParams;
    let format: '1qb' | 'sf' | undefined = (formatParam === 'sf' || formatParam === '1qb') ? formatParam : undefined;
    if (!format) {
        const leagueData = await db.select({ scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
    }
    if (!format) format = 'sf';

    try {
        // 1. Fetch live Sleeper data to get currently rostered players
        const { rosters } = await getLeagueData(leagueId);

        // 2. Collect all rostered player IDs
        const allSleeperIds = rosters.flatMap((r) => r.players || []);

        // Add a dummy ID to prevent empty array error in notInArray if league is completely empty
        if (allSleeperIds.length === 0) allSleeperIds.push('dummy');

        // 3. Query DB for top 200 free agents (not on any roster, excluding picks)
        const freeAgents = await db
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
            })
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

        // Merge prospect writeups and ZAP data
        const currentYear = new Date().getFullYear();
        const normalizeName = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        const prospects = await db.select({ full_name: prospectData.full_name, nfl_team: prospectData.nfl_team, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text }).from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
        const zapByName = new Map(prospects.map(p => [normalizeName(p.full_name), p]));
        const writeups = await db.select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text }).from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
        const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
        for (const w of writeups) { const key = normalizeName(w.full_name); if (!writeupsByName.has(key)) writeupsByName.set(key, []); writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text }); }
        const freeAgentsWithWriteups = freeAgents.map(p => {
            const zap = zapByName.get(normalizeName(p.full_name));
            const wu = writeupsByName.get(normalizeName(p.full_name)) || null;
            return { ...p, zap_score: zap?.zap_score ? parseFloat(String(zap.zap_score)) : null, zap_analysis: zap?.analysis_text || null, zap_category: zap?.zap_category || null, zap_comps: zap?.statistical_comparables || null, writeups: wu };
        });

        // Calculate position totals for free agents
        const positionTotals = freeAgentsWithWriteups.reduce((acc, player) => {
            const pos = player.position || 'UNK';
            if (!acc[pos]) acc[pos] = 0;
            acc[pos] += player.fc_value || 0;
            return acc;
        }, {} as Record<string, number>);

        const rankingsVintage = formatVintage(await getRankingsVintage(format));

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-6 sm:mb-8">
                        <Link href={`/league/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                            ← Back to League
                        </Link>

                        <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                                <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in league (Top 200 by {format === 'sf' ? 'SF' : '1QB'} Value)</div>
                            </div>
                        </div>
                    </div>

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

                    <FreeAgentTable players={freeAgentsWithWriteups} rankingsVintage={rankingsVintage} />
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
