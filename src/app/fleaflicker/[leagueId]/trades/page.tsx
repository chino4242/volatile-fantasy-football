import { db } from '@/db';
import { players, playerValues, leagues } from '@/db/schema';
import { getFleaflickerTrades, getFleaflickerLeague } from '@/lib/fleaflicker';
import { getPickFantasyCalcId } from '@/lib/sleeper';
import { eq, inArray } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';
import { TradeInbox } from '@/components/TradeInbox';

export const dynamic = 'force-dynamic';

interface EnrichedPlayer {
    name: string;
    position: string;
    team: string;
    dynastyValue: number;
    auctionValue: number | null;
}

interface EnrichedPick {
    season: number;
    round: number;
    originalOwnerName: string;
    estimatedValue: number;
}

interface EnrichedTrade {
    id: number;
    status: string;
    proposedOn: number;
    yourTeamId: number;
    yourTeamName: string;
    otherTeamName: string;
    youSend: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
    youReceive: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
}

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

    try {
        // Fetch trades (pending + under review) and league data in parallel
        const [openTrades, reviewTrades, fleaflickerData] = await Promise.all([
            getFleaflickerTrades(leagueId, 'TRADES_OWNER_OPEN'),
            getFleaflickerTrades(leagueId, 'TRADES_UNDER_REVIEW'),
            getFleaflickerLeague(leagueId),
        ]);

        const allTrades = [...openTrades, ...reviewTrades];

        if (allTrades.length === 0) {
            return (
                <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                    <div className="max-w-4xl mx-auto text-center py-12">
                        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Trade Inbox</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-2">No pending trades found.</p>
                    </div>
                </div>
            );
        }

        // Collect all player names from trades for DB lookup
        const tradePlayerNames = new Set<string>();
        for (const trade of allTrades) {
            for (const team of trade.teams) {
                for (const p of team.playersObtained) {
                    if (p.name) tradePlayerNames.add(cleanseName(p.name));
                }
            }
        }

        // Collect all pick IDs for value lookup
        const pickIds = new Set<string>();
        for (const trade of allTrades) {
            for (const team of trade.teams) {
                for (const pick of team.picksObtained) {
                    pickIds.add(getPickFantasyCalcId(pick.season.toString(), pick.round));
                }
            }
        }

        // Fetch all players from DB to match by name
        const allPlayersData = await db.select().from(players);
        const nameToPlayerMap = new Map(
            allPlayersData.map(p => [cleanseName(p.full_name), p])
        );

        // Get sleeper IDs for matched players
        const matchedPlayerIds: string[] = [];
        for (const name of tradePlayerNames) {
            const dbPlayer = nameToPlayerMap.get(name);
            if (dbPlayer) matchedPlayerIds.push(dbPlayer.sleeper_id);
        }

        // Fetch values for players and picks
        const allLookupIds = [...matchedPlayerIds, ...Array.from(pickIds)];
        const values = allLookupIds.length > 0
            ? await db.select().from(playerValues).where(inArray(playerValues.sleeper_id, allLookupIds))
            : [];

        const valueMap = new Map(values.map(v => [v.sleeper_id, v]));

        // Helper: enrich a player name into EnrichedPlayer
        const enrichPlayer = (name: string, position: string, team: string): EnrichedPlayer => {
            const dbPlayer = nameToPlayerMap.get(cleanseName(name));
            const valueData = dbPlayer ? valueMap.get(dbPlayer.sleeper_id) : undefined;
            const dynastyValue = format === 'sf'
                ? (valueData?.fc_value_sf || 0)
                : (valueData?.fc_value_1qb || 0);
            const auctionValue = valueData?.redraft_auction_value || null;

            return {
                name,
                position: dbPlayer?.position || position,
                team: dbPlayer?.team || team,
                dynastyValue,
                auctionValue,
            };
        };

        // Helper: enrich a pick
        const enrichPick = (pick: { season: number; round: number; originalOwnerName: string }): EnrichedPick => {
            const pickId = getPickFantasyCalcId(pick.season.toString(), pick.round);
            const pickValue = valueMap.get(pickId);
            const estimatedValue = format === 'sf'
                ? (pickValue?.fc_value_sf || 0)
                : (pickValue?.fc_value_1qb || 0);

            return {
                season: pick.season,
                round: pick.round,
                originalOwnerName: pick.originalOwnerName,
                estimatedValue,
            };
        };

        // Determine user's team
        const userTeamId = teamParam ? parseInt(teamParam) : fleaflickerData.rosters[0]?.id;

        // Enrich trades relative to the user's team
        const enrichedTrades: EnrichedTrade[] = allTrades
            .map(trade => {
                // Find which team side is the user's
                const userTeamIdx = trade.teams.findIndex(t => t.teamId === userTeamId);
                if (userTeamIdx === -1) return null; // User not involved in this trade

                const userTeam = trade.teams[userTeamIdx];
                const otherTeam = trade.teams[userTeamIdx === 0 ? 1 : 0];

                if (!otherTeam) return null;

                // "You Receive" = players/picks obtained by user's team
                // "You Send" = players/picks obtained by the other team (i.e., players leaving you)
                const youReceive = {
                    players: userTeam.playersObtained.map(p => enrichPlayer(p.name, p.position, p.team)),
                    picks: userTeam.picksObtained.map(enrichPick),
                };

                const youSend = {
                    players: otherTeam.playersObtained.map(p => enrichPlayer(p.name, p.position, p.team)),
                    picks: otherTeam.picksObtained.map(enrichPick),
                };

                return {
                    id: trade.id,
                    status: trade.status,
                    proposedOn: trade.proposedOn,
                    yourTeamId: userTeam.teamId,
                    yourTeamName: userTeam.teamName,
                    otherTeamName: otherTeam.teamName,
                    youSend,
                    youReceive,
                };
            })
            .filter((t): t is EnrichedTrade => t !== null);

        // Build current roster for before/after analysis
        const userRoster = fleaflickerData.rosters.find(r => r.id === userTeamId);
        const currentRoster: EnrichedPlayer[] = (userRoster?.players || []).map(p => {
            const dbPlayer = nameToPlayerMap.get(cleanseName(p.full_name));
            const valueData = dbPlayer ? valueMap.get(dbPlayer.sleeper_id) : undefined;

            // If player not in valueMap, fetch individually (but we already have them from bulk fetch)
            const dynastyValue = format === 'sf'
                ? (valueData?.fc_value_sf || 0)
                : (valueData?.fc_value_1qb || 0);

            return {
                name: p.full_name,
                position: dbPlayer?.position || '',
                team: p.team || dbPlayer?.team || '',
                dynastyValue,
                auctionValue: valueData?.redraft_auction_value || null,
            };
        });

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">
                    <TradeInbox
                        trades={enrichedTrades}
                        currentRoster={currentRoster}
                        format={format}
                    />
                </div>
            </div>
        );
    } catch (error) {
        console.error('Error loading Fleaflicker trades:', error);
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto text-center py-12">
                    <h1 className="text-2xl font-bold text-red-600">Error loading trades</h1>
                    <p className="text-zinc-500 mt-2">Please try again later.</p>
                </div>
            </div>
        );
    }
}
