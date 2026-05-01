import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { players, playerValues, valueSnapshots } from '@/db/schema';
import { eq, sql, desc, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') || 'sf';
    const sf = format === 'sf';

    // Get the most recent snapshot date
    const latestSnapshot = await db
        .select({ date: valueSnapshots.snapshot_date })
        .from(valueSnapshots)
        .orderBy(desc(valueSnapshots.snapshot_date))
        .limit(1);

    if (!latestSnapshot.length) {
        return NextResponse.json({ risers: [], fallers: [] });
    }

    const snapshotDate = latestSnapshot[0].date;

    // Get current values + snapshot values in one query
    const results = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            current_value: sf ? playerValues.fc_value_sf : playerValues.fc_value_1qb,
            snapshot_value: sf ? valueSnapshots.fc_value_sf : valueSnapshots.fc_value_1qb,
        })
        .from(players)
        .innerJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .innerJoin(valueSnapshots, eq(players.sleeper_id, valueSnapshots.sleeper_id))
        .where(sql`${valueSnapshots.snapshot_date} = ${snapshotDate} AND ${players.position} IN ('QB', 'RB', 'WR', 'TE')`);

    // Calculate percentage changes
    const movers = results
        .filter(r => r.current_value && r.snapshot_value && r.snapshot_value > 100)
        .map(r => {
            const change_pct = Math.round(((r.current_value! - r.snapshot_value!) / r.snapshot_value!) * 100);
            return {
                sleeper_id: r.sleeper_id,
                full_name: r.full_name,
                position: r.position || '',
                current_value: r.current_value!,
                previous_value: r.snapshot_value!,
                change_pct,
            };
        })
        .filter(m => Math.abs(m.change_pct) >= 15);

    const risers = movers.filter(m => m.change_pct > 0).sort((a, b) => b.change_pct - a.change_pct).slice(0, 10);
    const fallers = movers.filter(m => m.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct).slice(0, 10);

    return NextResponse.json({ risers, fallers, snapshotDate });
}
