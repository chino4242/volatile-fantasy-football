import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import postgres from 'postgres';

// Idempotent, non-destructive: add a nullable `week` column to player_tags so
// the Buy/Sell board can group/filter directives by the NFL week they came from.
// Existing rows (and manual board tags) keep week = NULL ("Undated").
async function main() {
    const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
    await sql`ALTER TABLE player_tags ADD COLUMN IF NOT EXISTS week integer`;
    const cols = await sql`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'player_tags' AND column_name = 'week'`;
    console.log('player_tags now has:', cols);
    await sql.end();
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
