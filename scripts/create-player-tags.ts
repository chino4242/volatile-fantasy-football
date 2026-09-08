import 'dotenv/config';

/**
 * One-off: create the player_tags table (drizzle-kit push hit a pre-existing
 * CHECK-constraint introspection bug on the live schema, so we apply this single
 * additive table directly). Idempotent — safe to re-run.
 */
async function main() {
    const { db } = await import('../src/db');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS player_tags (
            sleeper_id text PRIMARY KEY REFERENCES players(sleeper_id) ON DELETE CASCADE,
            tag text NOT NULL,
            note text,
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
        );
    `);
    console.log('✅ player_tags table ready.');
    process.exit(0);
}
main().catch(err => { console.error('❌ failed:', err); process.exit(1); });
