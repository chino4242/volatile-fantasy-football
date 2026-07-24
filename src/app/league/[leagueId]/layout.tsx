import { LeagueSubNav } from '@/components/LeagueSubNav';
import { getLeagueInfo, getLeagueData } from '@/lib/sleeper';

export default async function SleeperLeagueLayout({
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
            getLeagueInfo(leagueId),
            getLeagueData(leagueId),
        ]);

        leagueName = leagueInfo.name;

        // Build team list from rosters + users
        const userMap = new Map(leagueData.users.map(u => [u.user_id, u.display_name]));
        teams = leagueData.rosters
            .map(r => ({
                id: r.roster_id,
                name: userMap.get(r.owner_id) || `Team ${r.roster_id}`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        // Graceful degradation — sub-nav still renders with fallback name
        console.error('Failed to fetch league info for layout:', error);
    }

    return (
        <div>
            <LeagueSubNav
                leagueId={leagueId}
                leagueName={leagueName}
                platform="sleeper"
                teams={teams}
            />
            {children}
        </div>
    );
}
