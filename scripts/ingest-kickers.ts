/**
 * Seed NFL kickers into the players table from Sleeper's player list.
 *
 * FantasyCalc (the main players ingest) doesn't value kickers, so position 'K'
 * is otherwise absent — which blocks kicker roster-matching AND kicker weekly
 * rankings. This mirrors ingest-defenses.ts: it pulls real Sleeper kicker rows
 * (real sleeper_ids, so they also match on roster sync) and upserts them.
 *
 * Source: GET https://api.sleeper.app/v1/players/nfl  (full player dictionary).
 * Only active kickers on a real NFL team are inserted.
 *
 * Usage: npx tsx scripts/ingest-kickers.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/index.js';
import { players } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

interface SleeperPlayer {
    player_id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    position?: string;
    fantasy_positions?: string[] | null;
    team?: string | null;
    age?: number | null;
    years_exp?: number | null;
    status?: string | null;
}

async function main() {
    console.log('🏈 Fetching Sleeper player list for kickers...');
    const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: { 'user-agent': 'volatile-fantasy-football/1.0' },
    });
    if (!res.ok) {
        console.error(`Sleeper players fetch failed: ${res.status} ${res.statusText}`);
        process.exit(1);
    }
    const dict = (await res.json()) as Record<string, SleeperPlayer>;

    const kickers = Object.values(dict).filter(p => {
        const isK = p.position === 'K' || (p.fantasy_positions || []).includes('K');
        return isK && !!p.team; // on a real NFL team (free agents have team=null)
    });

    console.log(`Found ${kickers.length} rostered NFL kickers.`);

    let inserted = 0;
    let updated = 0;
    for (const k of kickers) {
        const name = k.full_name || [k.first_name, k.last_name].filter(Boolean).join(' ').trim();
        if (!k.player_id || !name) continue;
        // Upsert: insert new kicker, or refresh team/status if it already exists.
        const result = await db.execute(sql`
            INSERT INTO players (sleeper_id, full_name, first_name, last_name, position, team, age, years_exp, status)
            VALUES (${k.player_id}, ${name}, ${k.first_name ?? null}, ${k.last_name ?? null}, 'K', ${k.team}, ${k.age ?? null}, ${k.years_exp ?? null}, ${k.status ?? 'Active'})
            ON CONFLICT (sleeper_id) DO UPDATE SET
                position = 'K',
                team = EXCLUDED.team,
                status = EXCLUDED.status,
                updated_at = now()
        `);
        // rowCount is 1 for both insert and update on conflict; can't cleanly
        // distinguish, so just count total upserts.
        if ((result as any).rowCount && (result as any).rowCount > 0) inserted++;
        else updated++;
    }

    console.log(`✅ Done: ${inserted} kicker rows upserted${updated ? `, ${updated} no-op` : ''}.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
