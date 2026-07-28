import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues, leagues, valueSnapshots } from "@/db/schema";
import { inArray, eq, desc } from "drizzle-orm";
import { getPickFantasyCalcId } from "@/lib/sleeper";
import { LeagueTable } from "@/components/LeagueTable";
import TradeFinderCard from "@/components/TradeFinderCard";
import { RefreshButton } from "@/components/RefreshButton";
import PowerRankings from "@/components/PowerRankings";
import TradeHistory from "@/components/TradeHistory";

export const dynamic = "force-dynamic";

interface TeamWithValue {
    id: number;
    name: string;
    ownerName: string;
    totalValue: number;
    qbValue: number;
    rbValue: number;
    wrValue: number;
    teValue: number;
    pickValue: number;
    pickCount: number;
    valueDropped?: number;
    valueKept?: number;
}

export default async function FleaflickerLeaguePage({
    params,
    searchParams,
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string; keepers?: string }>;
}) {
    const { leagueId } = await params;
    const { format: formatParam, keepers: keepersParam } = await searchParams;
    let format = (formatParam === 'sf' || formatParam === '1qb') ? formatParam as '1qb' | 'sf' : undefined;
    let keeperCount = keepersParam ? parseInt(keepersParam) : undefined;
    if (!format || !keeperCount) {
        const leagueData = await db.select({ keeper_count: leagues.keeper_count, league_type: leagues.league_type, scoring_format: leagues.scoring_format }).from(leagues).where(eq(leagues.league_id, leagueId)).limit(1);
        if (!format && leagueData[0]?.scoring_format) format = leagueData[0].scoring_format as '1qb' | 'sf';
        if (!keeperCount && leagueData[0]?.league_type === 'keeper' && leagueData[0]?.keeper_count) keeperCount = leagueData[0].keeper_count;
    }
    if (!format) format = 'sf';

    try {
        const fleaflickerData = await getFleaflickerLeague(leagueId);

        // Normalize: lowercase, strip punctuation + suffixes (Jr/Sr/II/III/IV)
        // Fleaflicker drops suffixes, e.g. returns "Marvin Harrison" for "Marvin Harrison Jr"
        const normalizeName = (name: string) =>
            name.toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();

        // 1. Get all unique player names from rosters
        const allPlayerNames = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.players.forEach(p => {
                if (p.full_name) allPlayerNames.add(normalizeName(p.full_name));
            });
        });

        // 2. Collect all draft picks (FantasyCalc IDs)
        const allPickIds = new Set<string>();
        fleaflickerData.rosters.forEach(roster => {
            roster.draftPicks.forEach(pick => {
                allPickIds.add(getPickFantasyCalcId(pick.season.toString(), pick.round));
            });
        });

        // 3. Fetch player data from DB to get Sleeper IDs and Positions
        const allPlayers = await db.select().from(players);
        const playerMatches = allPlayers.filter(p => allPlayerNames.has(normalizeName(p.full_name)));

        const playerIds = playerMatches.map(p => p.sleeper_id);
        const allLookupIds = [...playerIds, ...Array.from(allPickIds)];

        // 4. Fetch values from DB for both players and picks
        const values = await db
            .select({
                sleeper_id: playerValues.sleeper_id,
                fc_value: playerValues.fc_value,
                fc_value_sf: playerValues.fc_value_sf,
                fc_value_1qb: playerValues.fc_value_1qb,
                fc_rank_sf: playerValues.fc_rank_sf,
                fc_rank_1qb: playerValues.fc_rank_1qb,
                redraft_rank_overall: playerValues.redraft_rank_overall,
            })
            .from(playerValues)
            .where(inArray(playerValues.sleeper_id, allLookupIds));

        // Create lookup maps
        const valueMap = new Map(
            // Use format from search params
            values.map(v => [v.sleeper_id, (format === 'sf' ? v.fc_value_sf : v.fc_value_1qb) || 0])
        );

        const nameToPlayerMap = new Map(
            playerMatches.map(p => [normalizeName(p.full_name), p])
        );

        // 5. Calculate team values
        const teams: TeamWithValue[] = fleaflickerData.rosters.map(roster => {
            let qbValue = 0;
            let rbValue = 0;
            let wrValue = 0;
            let teValue = 0;
            let totalValue = 0;

            // Collect players with values for keeper calculation
            const playersWithValues: { value: number }[] = [];

            // Calculate player values
            roster.players.forEach(player => {
                const dbPlayer = nameToPlayerMap.get(normalizeName(player.full_name));
                if (dbPlayer) {
                    const value = valueMap.get(dbPlayer.sleeper_id) || 0;
                    totalValue += value;
                    playersWithValues.push({ value });

                    if (dbPlayer.position === 'QB') qbValue += value;
                    else if (dbPlayer.position === 'RB') rbValue += value;
                    else if (dbPlayer.position === 'WR') wrValue += value;
                    else if (dbPlayer.position === 'TE') teValue += value;
                }
            });

            // Calculate pick values
            let pickValue = 0;
            roster.draftPicks.forEach(pick => {
                const pickId = getPickFantasyCalcId(pick.season.toString(), pick.round);
                const value = valueMap.get(pickId) || 0;
                pickValue += value;
                totalValue += value;
            });

            // Calculate value dropped and kept for keeper leagues
            let valueDropped = 0;
            let valueKept = 0;
            if (keeperCount && keeperCount > 0) {
                const sortedPlayers = playersWithValues.sort((a, b) => b.value - a.value);
                valueKept = sortedPlayers.slice(0, keeperCount).reduce((sum, p) => sum + p.value, 0);
                if (playersWithValues.length > keeperCount) {
                    valueDropped = sortedPlayers.slice(keeperCount).reduce((sum, p) => sum + p.value, 0);
                }
            }

            return {
                id: roster.id,
                name: roster.name,
                ownerName: roster.owners[0]?.display_name || 'Unknown',
                totalValue,
                qbValue,
                rbValue,
                wrValue,
                teValue,
                pickValue,
                pickCount: roster.draftPicks.length,
                valueDropped,
                valueKept,
            };
        });

        teams.sort((a, b) => b.totalValue - a.totalValue);

        // --- Power Rankings: build trend data from value_snapshots ---
        let powerRankingsData: { teamId: string | number; teamName: string; currentValue: number; values: number[]; change: number }[] = [];
        try {
            // Get the last 8 distinct snapshot dates
            const snapshotDates = await db
                .selectDistinct({ snapshot_date: valueSnapshots.snapshot_date })
                .from(valueSnapshots)
                .orderBy(desc(valueSnapshots.snapshot_date))
                .limit(8);

            if (snapshotDates.length > 0) {
                const dates = snapshotDates.map(d => d.snapshot_date).reverse(); // oldest first
                const allPlayerSleeperIds = Array.from(nameToPlayerMap.values()).map(p => p.sleeper_id);

                // Fetch all snapshot values for our players in these dates
                const snapshots = await db
                    .select({
                        sleeper_id: valueSnapshots.sleeper_id,
                        snapshot_date: valueSnapshots.snapshot_date,
                        fc_value_sf: valueSnapshots.fc_value_sf,
                        fc_value_1qb: valueSnapshots.fc_value_1qb,
                    })
                    .from(valueSnapshots)
                    .where(inArray(valueSnapshots.sleeper_id, allPlayerSleeperIds));

                // Build a map: sleeper_id -> date_string -> value
                const snapshotMap = new Map<string, Map<string, number>>();
                snapshots.forEach(s => {
                    if (!s.sleeper_id) return;
                    const dateKey = s.snapshot_date.toISOString();
                    if (!snapshotMap.has(s.sleeper_id)) snapshotMap.set(s.sleeper_id, new Map());
                    const val = (format === 'sf' ? s.fc_value_sf : s.fc_value_1qb) || 0;
                    snapshotMap.get(s.sleeper_id)!.set(dateKey, val);
                });

                // For each team, sum player values at each snapshot date
                powerRankingsData = fleaflickerData.rosters.map(roster => {
                    const teamPlayerIds: string[] = [];
                    roster.players.forEach(p => {
                        const dbPlayer = nameToPlayerMap.get(normalizeName(p.full_name));
                        if (dbPlayer) teamPlayerIds.push(dbPlayer.sleeper_id);
                    });

                    const values = dates.map(date => {
                        const dateKey = date.toISOString();
                        let total = 0;
                        teamPlayerIds.forEach(id => {
                            const playerSnaps = snapshotMap.get(id);
                            if (playerSnaps?.has(dateKey)) {
                                total += playerSnaps.get(dateKey)!;
                            }
                        });
                        return total;
                    });

                    const currentValue = teams.find(t => t.id === roster.id)?.totalValue || 0;
                    const change = values.length >= 2 ? values[values.length - 1] - values[0] : 0;

                    return {
                        teamId: roster.id,
                        teamName: roster.owners[0]?.display_name || roster.name,
                        currentValue,
                        values,
                        change,
                    };
                });
            }
        } catch (e) {
            console.error('Failed to build power rankings data:', e);
        }

        // --- Trade History: fetch completed trades from Fleaflicker API ---
        let tradeHistoryData: { id: string; timestamp: string; sides: [any, any] }[] = [];
        try {
            const tradeRes = await fetch(
                `https://www.fleaflicker.com/api/FetchTrades?sport=NFL&league_id=${leagueId}&filter=TRADES_COMPLETED`,
                { next: { revalidate: 300 } }
            );
            if (tradeRes.ok) {
                const tradeJson = await tradeRes.json();
                const rawTrades = tradeJson.trades || [];

                tradeHistoryData = rawTrades.slice(0, 20).map((trade: any, idx: number) => {
                    const sides = (trade.teams || []).map((team: any) => {
                        const playersObtained = (team.playersObtained || []).map((p: any) => {
                            const name = p.proPlayer?.nameFull || 'Unknown';
                            const position = p.proPlayer?.position || null;
                            const dbPlayer = nameToPlayerMap.get(normalizeName(name));
                            const value = dbPlayer ? (valueMap.get(dbPlayer.sleeper_id) || 0) : null;
                            return { name, position, value };
                        });

                        const picksObtained = (team.picksObtained || []).map((pick: any) => {
                            const season = pick.season || '';
                            const round = pick.slot?.round || 0;
                            const label = `${season} Round ${round}`;
                            const pickId = getPickFantasyCalcId(season.toString(), round);
                            const value = valueMap.get(pickId) || null;
                            return { label, value };
                        });

                        const totalValue = [...playersObtained, ...picksObtained].reduce(
                            (sum: number, item: any) => sum + (item.value || 0), 0
                        );

                        return {
                            teamName: team.team?.name || 'Unknown',
                            playersObtained,
                            picksObtained,
                            totalValue,
                        };
                    });

                    const timestamp = trade.approvedOn?.formatted
                        ? new Date(trade.approvedOn.formatted).toISOString()
                        : new Date().toISOString();

                    return {
                        id: `trade-${idx}`,
                        timestamp,
                        sides: sides.length >= 2 ? [sides[0], sides[1]] : [sides[0] || { teamName: 'Unknown', playersObtained: [], picksObtained: [], totalValue: 0 }, sides[1] || { teamName: 'Unknown', playersObtained: [], picksObtained: [], totalValue: 0 }],
                    };
                });
            }
        } catch (e) {
            console.error('Failed to fetch trade history:', e);
        }

        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                                Fleaflicker Dashboard
                            </h1>
                            <p className="text-sm text-zinc-500">ID: {leagueId}</p>
                        </div>
                        <div className="flex gap-2">
                            <RefreshButton leagueId={leagueId} platform="fleaflicker" />
                        </div>
                    </div>

                    <LeagueTable teams={teams} platform="fleaflicker" leagueId={leagueId} format={format} keeperCount={keeperCount} />

                    <TradeFinderCard
                        teams={fleaflickerData.rosters.map(r => ({
                            rosterId: r.id,
                            ownerName: r.name,
                            players: r.players.map(p => {
                                const db = nameToPlayerMap.get(normalizeName(p.full_name));
                                if (!db) return null;
                                const v = values.find(val => val.sleeper_id === db.sleeper_id);
                                return { sleeper_id: db.sleeper_id, full_name: db.full_name, position: db.position, fc_value: v ? (format === 'sf' ? v.fc_value_sf : v.fc_value_1qb) : 0, fc_rank_sf: v?.fc_rank_sf, fc_rank_1qb: v?.fc_rank_1qb, redraft_rank_overall: v?.redraft_rank_overall };
                            }).filter(Boolean) as any[],
                        }))}
                        format={format}
                    />

                    {powerRankingsData.length > 0 && <PowerRankings teams={powerRankingsData} />}
                    {tradeHistoryData.length > 0 && <TradeHistory trades={tradeHistoryData} />}
                </div>
            </div>
        );

    } catch (error) {
        console.error(error);
        return (
            <div className="p-10 text-center">
                <h1 className="text-2xl font-bold text-red-600">Error loading league</h1>
            </div>
        )
    }
}
