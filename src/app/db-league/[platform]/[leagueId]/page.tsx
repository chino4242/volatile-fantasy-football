import { notFound } from "next/navigation";
import Link from "next/link";
import { getDbLeagueData, type DbPlatform } from "@/lib/db-league-data";
import { LeagueTable, type LeagueTeamStat } from "@/components/LeagueTable";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<DbPlatform, string> = { myffpc: 'MyFFPC', yahoo: 'Yahoo' };

export default async function DbLeaguePage({
    params,
}: {
    params: Promise<{ platform: string; leagueId: string }>;
}) {
    const { platform, leagueId } = await params;
    if (platform !== 'myffpc' && platform !== 'yahoo') notFound();

    const data = await getDbLeagueData(platform, leagueId);
    if (!data) notFound();

    const teams: LeagueTeamStat[] = data.teams.map(t => {
        let qbValue = 0, rbValue = 0, wrValue = 0, teValue = 0, totalValue = 0;
        for (const p of t.players) {
            const v = p.fc_value || 0;
            totalValue += v;
            if (p.position === 'QB') qbValue += v;
            else if (p.position === 'RB') rbValue += v;
            else if (p.position === 'WR') wrValue += v;
            else if (p.position === 'TE') teValue += v;
        }
        return {
            id: t.numericId,
            name: t.ownerName,
            ownerName: t.ownerName,
            totalValue, qbValue, rbValue, wrValue, teValue,
            pickValue: 0, pickCount: 0,
        };
    });

    const label = PLATFORM_LABEL[platform];
    const typeLabel = platform === 'yahoo' ? 'Redraft' : 'Dynasty';

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                            <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</Link>
                            <span>/</span>
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium">{label}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">{data.name}</h1>
                        <p className="text-sm text-zinc-500 mt-1">
                            {teams.length} teams • {data.format.toUpperCase()} {typeLabel} • {label}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href={`/db-league/${platform}/${leagueId}/free-agents`}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                        >
                            Free Agents
                        </Link>
                    </div>
                </div>

                <LeagueTable teams={teams} platform="db" leagueId={`${platform}/${leagueId}`} format={data.format} />
            </div>
        </div>
    );
}
