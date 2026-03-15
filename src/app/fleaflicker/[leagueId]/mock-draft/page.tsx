import { getFleaflickerLeague } from '@/lib/fleaflicker';
import { db } from '@/db';
import { players, playerValues } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import MockDraftClient from './MockDraftClient';
import { getRankingsVintage, formatVintage } from '@/lib/rankings-vintage';

export default async function FleaflickerMockDraftPage({
    params,
    searchParams
}: {
    params: Promise<{ leagueId: string }>;
    searchParams: Promise<{ format?: string }>;
}) {
    const { leagueId } = await params;
    const { format = 'sf' } = await searchParams;
    const sf = format === 'sf';

    // Fetch league data
    const leagueData = await getFleaflickerLeague(leagueId);

    // Normalize name function (same as league page)
    const normalizeName = (name: string) =>
        name.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '')
            .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    // Get all rostered player names
    const rosteredPlayerNames = new Set<string>();
    leagueData.rosters.forEach(roster => {
        roster.players.forEach(p => {
            if (p.full_name) rosteredPlayerNames.add(normalizeName(p.full_name));
        });
    });

    // Fetch all players with values
    const allPlayersData = await db
        .select({
            id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            years_exp: players.years_exp,
            fc_value: sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
            rank_1qb_tier: playerValues.rank_1qb_tier,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`)
        .orderBy(sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb);

    // Filter to free agents only (by name matching)
    const freeAgents = allPlayersData.filter(p => !rosteredPlayerNames.has(normalizeName(p.full_name)));

    // Build team rosters with values
    const teams = await Promise.all(leagueData.rosters.map(async (roster) => {
        // Match players by name
        const playersWithValues = roster.players
            .map(p => {
                const normalizedName = normalizeName(p.full_name);
                return allPlayersData.find(dbPlayer => normalizeName(dbPlayer.full_name) === normalizedName);
            })
            .filter(Boolean) as typeof allPlayersData;

        // Calculate positional values
        const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
        playersWithValues.forEach(p => {
            if (p.position && p.fc_value) {
                positionValues[p.position as keyof typeof positionValues] += p.fc_value;
            }
        });

        return {
            id: roster.id,
            name: roster.name,
            owner: roster.owners[0]?.display_name || 'Unknown',
            players: playersWithValues,
            positionValues,
            draftPicks: roster.draftPicks
        };
    }));

    const rankingsVintage = formatVintage(await getRankingsVintage(format as '1qb' | 'sf'));

    return (
        <MockDraftClient
            leagueId={leagueId}
            teams={teams}
            freeAgents={freeAgents}
            format={format}
            rankingsVintage={rankingsVintage}
        />
    );
}
