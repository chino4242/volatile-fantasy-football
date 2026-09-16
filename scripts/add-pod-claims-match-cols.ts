import 'dotenv/config';

/**
 * One-off, idempotent: add match_method + matched_name columns to pod_claims so
 * fuzzy-matched claims are queryable and reviewable (podcast-said-name vs. the
 * DB player it was linked to). Safe to re-run.
 *
 *   npx tsx scripts/add-pod-claims-match-cols.ts
 *
 * match_method: 'exact' | 'fuzzy' | 'none' | 'confirmed' (human-verified fuzzy)
 * matched_name: for fuzzy/confirmed, the DB player name we linked to.
 */
async function main() {
    const { db } = await import('../src/db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`ALTER TABLE pod_claims ADD COLUMN IF NOT EXISTS match_method text NOT NULL DEFAULT 'exact';`);
    await db.execute(sql`ALTER TABLE pod_claims ADD COLUMN IF NOT EXISTS matched_name text;`);
    console.log('✅ pod_claims match_method + matched_name columns ready.');
    process.exit(0);
}
main().catch(err => { console.error('❌ failed:', err); process.exit(1); });
