import 'dotenv/config';

/**
 * One-off, idempotent: apply the ingestion schema additions directly (drizzle-kit
 * push hits a pre-existing CHECK-constraint introspection bug on this DB).
 *  - player_values: rank_ros_overall/pos/tier + rank_ros_updated_at
 *  - weekly_rankings table (QB/Flex start-sit, week-keyed)
 *  - player_transactions table (buy/sell/add feed + writeups)
 * Safe to re-run.
 */
async function main() {
    const { db } = await import('../src/db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`
        ALTER TABLE player_values
            ADD COLUMN IF NOT EXISTS rank_ros_overall integer,
            ADD COLUMN IF NOT EXISTS rank_ros_pos integer,
            ADD COLUMN IF NOT EXISTS rank_ros_tier integer,
            ADD COLUMN IF NOT EXISTS rank_ros_updated_at timestamp;
    `);
    console.log('✅ player_values RoS columns ready.');

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS weekly_rankings (
            sleeper_id text REFERENCES players(sleeper_id) ON DELETE CASCADE,
            week integer NOT NULL,
            kind text NOT NULL,
            rank integer,
            position text,
            team text,
            opponent text,
            total numeric(6,2),
            pos_matchup integer,
            player_name text,
            updated_at timestamp DEFAULT now()
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pk_weekly_rankings ON weekly_rankings (sleeper_id, week, kind);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_weekly_rankings_week_kind ON weekly_rankings (week, kind);`);
    console.log('✅ weekly_rankings table ready.');

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS player_transactions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            sleeper_id text REFERENCES players(sleeper_id) ON DELETE SET NULL,
            player_name text NOT NULL,
            action text NOT NULL,
            note text,
            week integer,
            created_at timestamp DEFAULT now()
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_transactions_week ON player_transactions (week);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_player_transactions_sleeper ON player_transactions (sleeper_id);`);
    console.log('✅ player_transactions table ready.');

    process.exit(0);
}
main().catch(err => { console.error('❌ failed:', err); process.exit(1); });
