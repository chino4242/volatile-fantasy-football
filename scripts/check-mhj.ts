import { db } from '../src/db/index.js';
import { players } from '../src/db/schema.js';
import { like } from 'drizzle-orm';

async function main() {
    const res = await db
        .select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
        .from(players)
        .where(like(players.full_name, '%Harrison%'));
    console.log('DB results:', JSON.stringify(res, null, 2));
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
