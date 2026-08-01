import { db } from '@/db';
import { players, playerValues, leagues } from '@/db/schema';
import { getFleaflickerLeague } from '@/lib/fleaflicker';
import { getPickFantasyCalcId } from '@/lib/sleeper';
import { eq, inArray } from 'drizzle-orm';
import { PendingTrades } from '@/components/PendingTrades';

export const dynamic = 'force-dynamic';

export default async function FleaflickerTradesPage({
    params,
    searchParams,
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string; team?: string }>;
}) {
    const { leagueId } = await params;
    const { format: formatParam, team: teamParam } = await searchParams;

    // Determine format from query or DB
    let format: '1qb' | 'sf' = 'sf';
    if (formatParam === 'sf' || formatParam === '1qb') {
        format = formatParam;
    } else {
        const leagueData = await db
            .select({ scoring_format: leagues.scoring_format })
            .from(leagues)
            .where(eq(leagues.league_id, leagueId))
            .limit(1);
        if (leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
    }

    // Normalize name helper
    const normalizeName = (name: string) =>
        name.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    // Fetch league data and all players/values for enrichment
    const [fleaflickerData, allPlayersData] = await Promise.all([
        getFleaflickerLeague(leagueId),
        db.select().from(players),
    ]);

    // Determine team ID
    const teamId = teamParam || String(fleaflickerData.rosters[0]?.id || '');
    const teamRoster = fleaflickerData.rosters.find(r => r.id === parseInt(teamId));
    const teamName = teamRoster?.name || 'My Team';

    // Build name lookup
    const allPlayersNameMap = new Map(allPlayersData.map(p => [normalizeName(p.full_name), p]));

    // Collect all league player sleeper IDs and pick IDs for value lookup
    const allLeaguePlayerNames = fleaflickerData.rosters.flatMap(r =>
        r.players.map(p => normalizeName(p.full_name))
    );
    const matchedLeaguePlayers = allPlayersData.filter(p =>
        allLeaguePlayerNames.includes(normalizeName(p.full_name))
    );
    const leaguePlayerIds = matchedLeaguePlayers.map(p => p.sleeper_id);

    // Collect all pick IDs across the league
    const pickIds = new Set<string>();
    for (const r of fleaflickerData.rosters) {
        for (const pick of r.draftPicks) {
            if (pick.season >= new Date().getFullYear()) {
                pickIds.add(getPickFantasyCalcId(String(pick.season), pick.round));
            }
        }
    }

    // Fetch values for all players and picks
    const allLookupIds = [...leaguePlayerIds, ...Array.from(pickIds)];
    const values = allLookupIds.length > 0
        ? await db.select().from(playerValues).where(inArray(playerValues.sleeper_id, allLookupIds))
        : [];
    const valueMap = new Map(values.map(v => [v.sleeper_id, v]));

    // Build playerValueMap (name -> value data)
    const playerValueMap: Record<string, { dynastyValue: number; auctionValue: number | null; position: string }> = {};
    for (const p of matchedLeaguePlayers) {
        const v = valueMap.get(p.sleeper_id);
        const dynastyValue = format === 'sf' ? (v?.fc_value_sf || 0) : (v?.fc_value_1qb || 0);
        playerValueMap[normalizeName(p.full_name)] = {
            dynastyValue,
            auctionValue: v?.redraft_auction_value || null,
            position: p.position || '',
        };
    }

    // Build allLeaguePlayers
    const allLeaguePlayers = fleaflickerData.rosters.flatMap(r =>
        r.players.map(p => {
            const norm = normalizeName(p.full_name || '');
            const dbPlayer = allPlayersNameMap.get(norm);
            const v = dbPlayer ? valueMap.get(dbPlayer.sleeper_id) : undefined;
            const dynastyValue = format === 'sf' ? (v?.fc_value_sf || 0) : (v?.fc_value_1qb || 0);
            return {
                name: p.full_name || '',
                position: dbPlayer?.position || '',
                dynastyValue,
                auctionValue: v?.redraft_auction_value || null,
                teamName: r.name || '',
            };
        })
    );

    // Build allLeaguePicks
    const allLeaguePicks = fleaflickerData.rosters.flatMap(r =>
        r.draftPicks
            .filter(pk => pk.season >= new Date().getFullYear())
            .map(pk => {
                const pickId = getPickFantasyCalcId(String(pk.season), pk.round);
                const pickValue = valueMap.get(pickId);
                const fcVal = pickValue ? (format === 'sf' ? pickValue.fc_value_sf : pickValue.fc_value_1qb) : null;
                return {
                    season: pk.season,
                    round: pk.round,
                    slot: pk.slot || 0,
                    teamName: r.name || '',
                    estimatedValue: fcVal || (pk.round === 1 ? 3000 : pk.round === 2 ? 1500 : 800),
                };
            })
    );

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
                <PendingTrades
                    leagueId={leagueId}
                    teamId={teamId}
                    teamName={teamName}
                    playerValueMap={playerValueMap}
                    allLeaguePlayers={allLeaguePlayers}
                    allLeaguePicks={allLeaguePicks}
                />
            </div>
        </div>
    );
}
