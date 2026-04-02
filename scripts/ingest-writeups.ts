/**
 * Ingest prospect writeups from .txt files into the database.
 * 
 * Usage: npx tsx scripts/ingest-writeups.ts <directory> <draft_year> <source>
 * Example: npx tsx scripts/ingest-writeups.ts ./writeups 2026 reception_perception
 * 
 * File naming: firstname_lastname_source.txt (e.g., tetairoa_mcmillan_reception_perception.txt)
 * The file content is the full analysis text.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { players, prospectWriteups } from '../src/db/schema';
import { sql, eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const [dir, yearStr, source] = process.argv.slice(2);
if (!dir || !yearStr || !source) {
    console.error('Usage: npx tsx scripts/ingest-writeups.ts <directory> <draft_year> <source>');
    process.exit(1);
}
const draftYear = parseInt(yearStr);

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const normalizeName = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

async function main() {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    console.log(`Found ${files.length} .txt files in ${dir}`);

    // Load all players for name matching
    const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position })
        .from(players).where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE')`);
    const playerByName = new Map(allPlayers.map(p => [normalizeName(p.full_name), p]));

    let inserted = 0, unmatched: string[] = [];

    for (const file of files) {
        // Parse name from filename: firstname_lastname_source.txt
        const basename = path.basename(file, '.txt');
        // Remove the source suffix (last segment after final underscore group matching the source)
        const namePart = basename.replace(new RegExp(`_${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
        const fullName = namePart.replace(/_/g, ' ');
        const normalized = normalizeName(fullName);

        const player = playerByName.get(normalized);
        const analysisText = fs.readFileSync(path.join(dir, file), 'utf-8').trim();

        if (!analysisText) continue;

        await db.insert(prospectWriteups).values({
            sleeper_id: player?.sleeper_id || null,
            full_name: player?.full_name || fullName,
            position: player?.position || null,
            source,
            draft_year: draftYear,
            analysis_text: analysisText,
        }).onConflictDoUpdate({
            target: [prospectWriteups.full_name, prospectWriteups.source, prospectWriteups.draft_year],
            set: { sleeper_id: player?.sleeper_id || null, position: player?.position || null, analysis_text: analysisText },
        });

        if (player) {
            console.log(`✓ ${player.full_name} (${player.position})`);
            inserted++;
        } else {
            console.log(`? ${fullName} — no player match`);
            unmatched.push(fullName);
        }
    }

    console.log(`\nDone: ${inserted} matched, ${unmatched.length} unmatched`);
    if (unmatched.length) console.log('Unmatched:', unmatched.join(', '));

    await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
