import { db } from '@/db';
import { players, playerValues, leagues } from '@/db/schema';
import { getLeagueData, getAllDraftPicks, getCurrentSeasonDraft, getDraftTradedPicks } from '@/lib/sleeper';
import { eq, inArray, notInArray, not, like, desc, and } from 'drizzle-orm';
import { DraftPlanClient } from '@/components/DraftPlanClient';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SleeperDraftPlanPage({
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

    try {
        // Fetch league data
        const { users, rosters, tradedPicks } = await getLeagueData(leagueId);

        // Get current user to identify their team
        let userId: string | null = null;
        try {
            const supabase = await createClient();
            const { data: { user } } = await supabase.auth.getUser();
            userId = user?.id || null;
        } catch {}

        // Determine which team is "mine" - use team param or try to match Sleeper username
        const userMap = new Map(users.map(u => [u.user_id, u]));
        let myRosterId: number | undefined;
        if (teamParam) {
            myRosterId = parseInt(teamParam);
        }

        // Get draft data for picks
        const draftResult = await getCurrentSeasonDraft(leagueId);
        const draft = draftResult?.draft || null;
        const draftTradedPicks = draft ? await getDraftTradedPicks(draft.draft_id) : [];

        // Build slot mapping
        let slotToRoster: Record<number, number> = {};
        if (draft?.slot_to_roster_id) {
            for (const [slot, rosterId] of Object.entries(draft.slot_to_roster_id)) slotToRoster[Number(slot)] = rosterId;
        } else if (draft?.draft_order) {
            for (const [uid, slot] of Object.entries(draft.draft_order as Record<string, number>)) {
                const r = rosters.find(r => r.owner_id === uid);
                if (r) slotToRoster[slot] = r.roster_id;
            }
        } else {
            rosters.forEach((r, i) => { slotToRoster[i + 1] = r.roster_id; });
        }

        const numTeams = Object.keys(slotToRoster).length || rosters.length;
        const rounds = (() => {
            const draftRounds = draft?.settings?.rounds || 5;
            // In keeper leagues, rounds = roster_limit - keepers
            // Use the larger of: draft settings or (roster size / teams) to handle keeper drafts
            if (keeperCount && keeperCount > 0) {
                // Estimate roster limit from the first team's player count
                const rosterSize = rosters[0]?.players?.length || 20;
                const keeperDraftRounds = rosterSize - keeperCount;
                return Math.max(draftRounds, keeperDraftRounds);
            }
            return draftRounds;
        })();
        const isSnake = draft?.type === 'snake';

        // Build draft board
        type MockPick = { season: number; round: number; slot: number; overall: number; originalOwner: number; currentOwner: number };
        const draftBoard: MockPick[] = [];
        for (let round = 1; round <= rounds; round++) {
            for (let slot = 1; slot <= numTeams; slot++) {
                const effectiveSlot = (isSnake && round % 2 === 0) ? (numTeams - slot + 1) : slot;
                const originalRosterId = slotToRoster[effectiveSlot];
                if (!originalRosterId) continue;
                draftBoard.push({ season: Number(draft?.season || new Date().getFullYear()), round, slot, overall: (round - 1) * numTeams + slot, originalOwner: originalRosterId, currentOwner: originalRosterId });
            }
        }
        for (const tp of draftTradedPicks) {
            const pick = draftBoard.find(p => p.round === tp.round && p.originalOwner === tp.roster_id);
            if (pick) pick.currentOwner = tp.owner_id;
        }

        // Fetch rostered player data
        const allRosteredIds = rosters.flatMap(r => r.players || []);
        const playerSelect = {
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
        };

        const rosteredPlayers = allRosteredIds.length > 0
            ? await db.select(playerSelect).from(players).leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id)).where(inArray(players.sleeper_id, allRosteredIds))
            : [];

        const playerMap = new Map(rosteredPlayers.map(p => [p.id, p]));

        // Build teams
        const allTeams = rosters.map(roster => {
            const owner = userMap.get(roster.owner_id);
            const rosterPlayers = (roster.players || []).map(pid => playerMap.get(pid)).filter(Boolean) as typeof rosteredPlayers;
            const teamPicks = draftBoard.filter(p => p.currentOwner === roster.roster_id);
            return {
                id: roster.roster_id,
                name: owner?.display_name || `Team ${roster.roster_id}`,
                players: rosterPlayers,
                draftPicks: teamPicks,
            };
        });

        const myTeam = myRosterId ? allTeams.find(t => t.id === myRosterId) : allTeams[0];

        // Fetch top free agents
        const excludeIds = allRosteredIds.length > 0 ? allRosteredIds : ['dummy'];
        const freeAgents = await db.select(playerSelect)
            .from(players)
            .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
            .where(and(notInArray(players.sleeper_id, excludeIds), not(like(players.sleeper_id, '%pick%')), inArray(players.position, ['QB', 'RB', 'WR', 'TE'])))
            .orderBy(desc(valueCol))
            .limit(200);

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">
                    <DraftPlanClient
                        leagueId={leagueId}
                        platform="sleeper"
                        format={format}
                        myTeam={myTeam}
                        allTeams={allTeams}
                        freeAgents={freeAgents}
                        keeperCount={keeperCount}
                    />
                </div>
            </div>
        );
    } catch (error) {
        console.error('Error loading draft plan:', error);
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
