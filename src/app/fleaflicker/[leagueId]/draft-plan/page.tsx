import { db } from '@/db';
import { players, playerValues, leagues, customRankings, rankingSources } from '@/db/schema';
import { getFleaflickerLeague } from '@/lib/fleaflicker';
import { eq, desc, inArray } from 'drizzle-orm';
import { DraftPlanClient } from '@/components/DraftPlanClient';
import { cleanseName } from '@/lib/nameUtils';

export const dynamic = 'force-dynamic';

export default async function FleaflickerDraftPlanPage({
    params,
    searchParams,
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string; keepers?: string; team?: string }>;
}) {
    const { leagueId } = await params;
    const { format: formatParam, keepers: keepersParam, team: teamParam } = await searchParams;

    // Determine format and keeper settings
    let format: '1qb' | 'sf' = 'sf';
    let keeperCount: number | undefined;
    if (formatParam === 'sf' || formatParam === '1qb') format = formatParam;
    if (keepersParam) keeperCount = parseInt(keepersParam);

    if (!formatParam || !keepersParam) {
        const ld = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format })
            .from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!formatParam && ld[0]?.scoring_format) format = ld[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && ld[0]?.league_type === 'keeper' && ld[0]?.keeper_count) keeperCount = ld[0].keeper_count;
    }

    const sf = format === 'sf';
    const valueCol = sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb;
    const normalizeName = (name: string) => cleanseName(name);

    try {
        // Fetch Fleaflicker league data
        const leagueData = await getFleaflickerLeague(leagueId);

        // Collect all player names
        const allPlayerNames = new Set<string>();
        leagueData.rosters.forEach(r => r.players.forEach(p => {
            if (p.full_name) allPlayerNames.add(normalizeName(p.full_name));
        }));

        // Fetch all players from DB
        const allPlayersData = await db
            .select({
                id: players.sleeper_id,
                full_name: players.full_name,
                position: players.position,
                team: players.team,
                years_exp: players.years_exp,
                fc_value: valueCol,
                rank_overall: sf ? playerValues.rank_sf_overall : playerValues.rank_1qb_overall,
                rank_tier: sf ? playerValues.rank_sf_tier : playerValues.rank_1qb_tier,
                redraft_rank_overall: playerValues.redraft_rank_overall,
                redraft_auction_value: playerValues.redraft_auction_value,
                rank_sf_tier: playerValues.rank_sf_tier,
                rank_1qb_tier: playerValues.rank_1qb_tier,
                fc_rank_sf: playerValues.fc_rank_sf,
                fc_rank_1qb: playerValues.fc_rank_1qb,
                rank_sf_overall: playerValues.rank_sf_overall,
                rank_1qb_overall: playerValues.rank_1qb_overall,
            })
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(inArray(players.position, ['QB', 'RB', 'WR', 'TE', 'DEF']))
            .orderBy(desc(valueCol));

        // Fetch custom rankings (Late Round market scores, etc.)
        const customRankingsData = await db
            .select({
                sleeper_id: customRankings.sleeper_id,
                rank: customRankings.rank,
                notes: customRankings.notes,
                signal: customRankings.signal,
                source_display_name: rankingSources.display_name,
            })
            .from(customRankings)
            .innerJoin(rankingSources, eq(customRankings.source_id, rankingSources.id))
            .where(eq(rankingSources.is_active, true));

        const customRankingsMap: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]> = {};
        for (const r of customRankingsData) {
            if (!r.sleeper_id) continue;
            if (!customRankingsMap[r.sleeper_id]) customRankingsMap[r.sleeper_id] = [];
            let marketScore: number | null = null;
            let tier: number | null = null;
            if (r.notes) {
                const msMatch = r.notes.match(/Market Score:\s*([\d.]+)/);
                if (msMatch) marketScore = parseFloat(msMatch[1]);
                const tierMatch = r.notes.match(/Tier\s+(\d+)/);
                if (tierMatch) tier = parseInt(tierMatch[1]);
            }
            customRankingsMap[r.sleeper_id].push({ rank: r.rank, signal: r.signal, notes: r.notes, source: r.source_display_name, marketScore, tier });
        }

        // Build name-to-player map for matching
        const playerByName = new Map(allPlayersData.map(p => [normalizeName(p.full_name), p]));

        // Build teams
        // For keeper leagues, generate draft board if API doesn't provide enough picks
        const leagueSize = leagueData.rosters.length;

        const allTeams = leagueData.rosters.map((roster) => {
            const rosterPlayers = roster.players
                .map(p => p.full_name ? playerByName.get(normalizeName(p.full_name)) : null)
                .filter(Boolean) as typeof allPlayersData;

            // Use the real draft picks from the API (includes traded picks)
            // Only include current year's draft picks (not future years)
            const currentYear = new Date().getFullYear();
            const teamPicks = (roster.draftPicks || [])
                .filter(dp => dp.season === currentYear)
                .map((dp, idx) => ({
                    season: dp.season,
                    round: dp.round || idx + 1,
                    slot: dp.slot || 0,
                    overall: dp.overall || (dp.round || idx + 1) * leagueSize + (dp.slot || 0),
                    originalOwner: dp.originalOwner || roster.id,
                    currentOwner: dp.currentOwner || roster.id,
                }));

            return {
                id: roster.id,
                name: roster.name || roster.owners[0]?.display_name || `Team ${roster.id}`,
                players: rosterPlayers,
                draftPicks: teamPicks,
            };
        });

        const myRosterId = teamParam ? parseInt(teamParam) : undefined;
        const myTeam = myRosterId ? allTeams.find(t => t.id === myRosterId) : allTeams[0];

        // Free agents: players in DB not on any roster
        const freeAgents = allPlayersData
            .filter(p => !allPlayerNames.has(normalizeName(p.full_name)))
            .slice(0, 200);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">
                    <DraftPlanClient
                        leagueId={leagueId}
                        platform="fleaflicker"
                        format={format}
                        myTeam={myTeam}
                        allTeams={allTeams}
                        freeAgents={freeAgents}
                        keeperCount={keeperCount}
                        customRankingsMap={customRankingsMap}
                    />
                </div>
            </div>
        );
    } catch (error) {
        console.error('Error loading Fleaflicker draft plan:', error);
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto text-center py-12">
                    <h1 className="text-2xl font-bold text-red-600">Error loading draft plan</h1>
                    <p className="text-zinc-500 mt-2">Please try again later.</p>
                </div>
            </div>
        );
    }
}
