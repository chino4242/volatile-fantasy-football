import { LeagueSubNav } from '@/components/LeagueSubNav';
import { getFleaflickerLeagueInfo, getFleaflickerLeague } from '@/lib/fleaflicker';

export default async function FleaflickerLeagueLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ leagueId: string }>;
}) {
    const { leagueId } = await params;

    // Fetch league info and team list in parallel
    let leagueName = `League ${leagueId}`;
    let teams: { id: string | number; name: string }[] = [];

    try {
        const [leagueInfo, leagueData] = await Promise.all([
            getFleaflickerLeagueInfo(leagueId),
            getFleaflickerLeague(leagueId),
        ]);

        leagueName = leagueInfo.name;

        // Build team list from rosters
        teams = leagueData.rosters
            .map(r => ({
                id: r.id,
                name: r.name || r.owners[0]?.display_name || `Team ${r.id}`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        // Graceful degradation
        console.error('Failed to fetch Fleaflicker league info for layout:', error);
    }

    return (
        <div>
            <LeagueSubNav
                leagueId={leagueId}
                leagueName={leagueName}
                platform="fleaflicker"
                teams={teams}
            />
            {children}
        </div>
    );
}
