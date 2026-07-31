/**
 * Insert all 32 NFL team defenses into the players table.
 * Uses Sleeper-style IDs for DEF (e.g., "DEF_KC", "DEF_BUF").
 * 
 * Usage: npx tsx scripts/ingest-defenses.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { db } from '../src/db/index.js';
import { players } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

const NFL_TEAMS = [
    { abbr: 'ARI', name: 'Arizona Cardinals' },
    { abbr: 'ATL', name: 'Atlanta Falcons' },
    { abbr: 'BAL', name: 'Baltimore Ravens' },
    { abbr: 'BUF', name: 'Buffalo Bills' },
    { abbr: 'CAR', name: 'Carolina Panthers' },
    { abbr: 'CHI', name: 'Chicago Bears' },
    { abbr: 'CIN', name: 'Cincinnati Bengals' },
    { abbr: 'CLE', name: 'Cleveland Browns' },
    { abbr: 'DAL', name: 'Dallas Cowboys' },
    { abbr: 'DEN', name: 'Denver Broncos' },
    { abbr: 'DET', name: 'Detroit Lions' },
    { abbr: 'GB', name: 'Green Bay Packers' },
    { abbr: 'HOU', name: 'Houston Texans' },
    { abbr: 'IND', name: 'Indianapolis Colts' },
    { abbr: 'JAX', name: 'Jacksonville Jaguars' },
    { abbr: 'KC', name: 'Kansas City Chiefs' },
    { abbr: 'LAC', name: 'Los Angeles Chargers' },
    { abbr: 'LAR', name: 'Los Angeles Rams' },
    { abbr: 'LV', name: 'Las Vegas Raiders' },
    { abbr: 'MIA', name: 'Miami Dolphins' },
    { abbr: 'MIN', name: 'Minnesota Vikings' },
    { abbr: 'NE', name: 'New England Patriots' },
    { abbr: 'NO', name: 'New Orleans Saints' },
    { abbr: 'NYG', name: 'New York Giants' },
    { abbr: 'NYJ', name: 'New York Jets' },
    { abbr: 'PHI', name: 'Philadelphia Eagles' },
    { abbr: 'PIT', name: 'Pittsburgh Steelers' },
    { abbr: 'SEA', name: 'Seattle Seahawks' },
    { abbr: 'SF', name: 'San Francisco 49ers' },
    { abbr: 'TB', name: 'Tampa Bay Buccaneers' },
    { abbr: 'TEN', name: 'Tennessee Titans' },
    { abbr: 'WAS', name: 'Washington Commanders' },
];

async function main() {
    console.log('🏈 Inserting 32 NFL team defenses...');

    let inserted = 0;
    let skipped = 0;

    for (const team of NFL_TEAMS) {
        const sleeperId = `DEF_${team.abbr}`;
        const fullName = `${team.name} DEF`;

        // Upsert: insert if not exists
        const result = await db.execute(sql`
            INSERT INTO players (sleeper_id, full_name, position, team, status)
            VALUES (${sleeperId}, ${fullName}, 'DEF', ${team.abbr}, 'Active')
            ON CONFLICT (sleeper_id) DO NOTHING
        `);

        if ((result as any).rowCount && (result as any).rowCount > 0) {
            inserted++;
        } else {
            skipped++;
        }
    }

    console.log(`✅ Done: ${inserted} inserted, ${skipped} already existed`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
