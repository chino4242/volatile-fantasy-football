import 'dotenv/config';

/**
 * One-off, idempotent: create the pod_claims table (podcast-transcript claim
 * atoms). Safe to re-run.
 *
 *   npx tsx scripts/add-pod-claims-table.ts
 */
async function main() {
    const { db } = await import('../src/db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pod_claims (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            sleeper_id text REFERENCES players(sleeper_id) ON DELETE SET NULL,
            player_name text NOT NULL,
            show text NOT NULL,
            week integer NOT NULL,
            signal_type text NOT NULL,
            direction text NOT NULL,
            conviction integer NOT NULL,
            quote text NOT NULL,
            created_at timestamp DEFAULT now()
        );
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pod_claims_sleeper_week ON pod_claims (sleeper_id, week);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pod_claims_week ON pod_claims (week);`);
    console.log('✅ pod_claims table ready.');
    process.exit(0);
}
main().catch(err => { console.error('❌ failed:', err); process.exit(1); });
