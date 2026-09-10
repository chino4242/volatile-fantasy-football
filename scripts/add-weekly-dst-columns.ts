import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

// Idempotent, non-destructive: add nullable tier + spread columns to
// weekly_rankings for DST streaming rankings. (drizzle-kit push chokes on an
// unrelated CHECK constraint in this DB, so we apply the diff directly.)
async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    await sql`ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS tier integer`;
    await sql`ALTER TABLE weekly_rankings ADD COLUMN IF NOT EXISTS spread numeric(5,1)`;
    const cols = await sql`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'weekly_rankings' AND column_name IN ('tier','spread')
        ORDER BY column_name`;
    console.log('weekly_rankings now has:', cols);
    await sql.end();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
