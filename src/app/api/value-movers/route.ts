import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
    const format = request.nextUrl.searchParams.get('format') || 'sf';
    const sf = format === 'sf';
    const valueCol = sf ? 'fc_value_sf' : 'fc_value_1qb';

    try {
        // Use raw SQL to avoid Date precision issues with Drizzle
        // Compare current values against the PREVIOUS snapshot (not the most recent,
        // since the most recent might be from today and would show 0 change)
        const results = await db.execute(sql.raw(`
            WITH snapshot_dates AS (
                SELECT DISTINCT snapshot_date 
                FROM value_snapshots 
                ORDER BY snapshot_date DESC 
                LIMIT 2
            ),
            prev_snapshot AS (
                SELECT snapshot_date FROM snapshot_dates 
                ORDER BY snapshot_date ASC 
                LIMIT 1
            )
            SELECT 
                p.sleeper_id,
                p.full_name,
                p.position,
                pv.${valueCol} as current_value,
                vs.${valueCol} as snapshot_value
            FROM players p
            JOIN player_values pv ON p.sleeper_id = pv.sleeper_id
            JOIN value_snapshots vs ON p.sleeper_id = vs.sleeper_id
            CROSS JOIN prev_snapshot ps
            WHERE vs.snapshot_date = ps.snapshot_date
            AND p.position IN ('QB', 'RB', 'WR', 'TE')
            AND pv.${valueCol} IS NOT NULL
            AND vs.${valueCol} IS NOT NULL
            AND vs.${valueCol} > 100
        `));

        const movers = (results as any[])
            .map((r: any) => {
                const change_pct = Math.round(((r.current_value - r.snapshot_value) / r.snapshot_value) * 100);
                return {
                    sleeper_id: r.sleeper_id,
                    full_name: r.full_name,
                    position: r.position || '',
                    current_value: r.current_value,
                    previous_value: r.snapshot_value,
                    change_pct,
                };
            })
            .filter((m: any) => Math.abs(m.change_pct) >= 5);

        const risers = movers.filter(m => m.change_pct > 0).sort((a, b) => b.change_pct - a.change_pct).slice(0, 50);
        const fallers = movers.filter(m => m.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct).slice(0, 50);

        return NextResponse.json({ risers, fallers });
    } catch (error) {
        console.error('Value movers error:', error);
        return NextResponse.json({ risers: [], fallers: [] });
    }
}
