import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

// Idempotent, non-destructive: add nullable opponent_roster_id + opponent_week
// to the rosters table, so the Yahoo/MyFFPC sync can persist each team's weekly
// H2H opponent (the For & Against page then reads it on Vercel — no live scrape).
async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    await sql`ALTER TABLE rosters ADD COLUMN IF NOT EXISTS opponent_roster_id text`;
    await sql`ALTER TABLE rosters ADD COLUMN IF NOT EXISTS opponent_week integer`;
    const cols = await sql`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'rosters' AND column_name IN ('opponent_roster_id','opponent_week')
        ORDER BY column_name`;
    console.log('rosters now has:', cols);
    await sql.end();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
