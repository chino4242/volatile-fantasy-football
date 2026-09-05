import { notFound } from "next/navigation";
import Link from "next/link";
import { getDbLeagueData, type DbPlatform } from "@/lib/db-league-data";
import { getRankingsVintage, formatVintage } from "@/lib/rankings-vintage";
import { FreeAgentTable, type FreeAgentData } from "@/components/FreeAgentTable";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ platform: string; leagueId: string }>;
}

export default async function DbFreeAgentsPage({ params }: PageProps) {
    const { platform, leagueId } = await params;
    if (platform !== "myffpc" && platform !== "yahoo") notFound();

    const data = await getDbLeagueData(platform as DbPlatform, leagueId);
    if (!data) notFound();

    const format = data.format;
    const sf = format === "sf";

    // Map adapter players -> the shared FreeAgentData shape (format-resolved fields).
    const players: FreeAgentData[] = data.freeAgents
        .filter(p => ["QB", "RB", "WR", "TE"].includes(p.position || ""))
        .map(p => ({
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
            zap_score: p.zap_score,
            zap_analysis: p.zap_analysis,
            zap_category: p.zap_category,
            zap_comps: p.zap_comps,
            writeups: p.writeups,
        }));

    const positionTotals = players.reduce((acc, p) => {
        const pos = p.position || "UNK";
        acc[pos] = (acc[pos] || 0) + (p.fc_value || 0);
        return acc;
    }, {} as Record<string, number>);

    const rankingsVintage = formatVintage(await getRankingsVintage(format));

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-6 sm:mb-8">
                    <Link href={`/db-league/${platform}/${leagueId}`} className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 mb-4 inline-block">
                        ← Back to League
                    </Link>

                    <div className="flex items-center gap-4 sm:gap-6 bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate">Top Free Agents</h1>
                            <div className="text-xs sm:text-base text-zinc-500 mt-0.5 sm:mt-1">Available in {data.name} (by {sf ? "SF" : "1QB"} Value)</div>
                        </div>
                    </div>
                </div>

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

                <FreeAgentTable players={players} rankingsVintage={rankingsVintage} />
            </div>
        </div>
    );
}
