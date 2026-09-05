import { db } from '@/db';
import { players, playerValues } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getRankingsVintage, formatVintage } from '@/lib/rankings-vintage';
import CheatSheetClient from './CheatSheetClient';

export const dynamic = 'force-dynamic';

export default async function CheatSheetPage({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
    const { format: formatParam } = await searchParams;
    const format = (formatParam === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';
    const sf = format === 'sf';

    const valueCol = sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb;

    // Full QB/RB/WR/TE pool with the fields the cheat sheet needs.
    // No league connection — this is a generic ranking sheet.
    const pool = await db
        .select({
            id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            fc_value: valueCol,
            rank_sf_tier: playerValues.rank_sf_tier,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            redraft_rank_tier: playerValues.redraft_rank_tier,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_auction_value: playerValues.redraft_auction_value,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE') AND ${valueCol} IS NOT NULL`)
        .orderBy(valueCol);

    const redraftVintage = formatVintage(await getRankingsVintage('redraft'));
    const dynastyVintage = formatVintage(await getRankingsVintage(format));

    return (
        <CheatSheetClient
            players={pool as any[]}
            format={format}
            redraftVintage={redraftVintage}
            dynastyVintage={dynastyVintage}
        />
    );
}
