/**
 * Ingest WR film-based dynasty rankings into custom_rankings table.
 * Usage: npx tsx scripts/ingest-rp-rankings.ts
 */
import 'dotenv/config';
import { db } from '../src/db';
import { rankingSources, customRankings, players } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';

interface RPEntry {
    rank: number;
    player: string;
    team: string;
    age: number | null;
    draft_year: number | null;
    call: string;
    signal: string | null;
    ecr: number | null;
    market_avg: number | null;
    gap: number | null;
    note: string;
}

// Map RP calls to our signal format
function mapSignal(call: string, signal: string | null): string {
    if (call === 'Super Buy') return 'Super Buy';
    if (call === 'Buy') return 'Buy';
    if (call === 'Hold') return 'Hold';
    if (call === 'Sell' && signal === 'Strong Sell Window') return 'Super Sell';
    if (call === 'Sell') return 'Sell';
    return 'Hold';
}

async function main() {
    console.log('--- Ingesting Reception Perception WR Rankings ---');

    // Load the JSON
    const dataPath = join(__dirname, 'rp-rankings.json');
    const rpData: RPEntry[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
    console.log(`Loaded ${rpData.length} RP entries`);

    // Ensure ranking source exists
    const SOURCE_NAME = 'wr-film-rankings';
    const existingSource = await db.select().from(rankingSources).where(eq(rankingSources.name, SOURCE_NAME)).limit(1);
    
    let sourceId: string;
    if (existingSource.length > 0) {
        sourceId = existingSource[0].id;
        // Update timestamp
        await db.update(rankingSources).set({ updated_at: new Date() }).where(eq(rankingSources.id, sourceId));
        console.log(`Using existing source: ${sourceId}`);
    } else {
        const [newSource] = await db.insert(rankingSources).values({
            name: SOURCE_NAME,
            display_name: 'WR Film Rankings',
            description: 'Film-first WR dynasty rankings with market gap analysis',
        }).returning();
        sourceId = newSource.id;
        console.log(`Created new source: ${sourceId}`);
    }

    // Clear existing RP rankings
    await db.delete(customRankings).where(eq(customRankings.source_id, sourceId));
    console.log('Cleared old RP rankings');

    // Match players by name
    const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position }).from(players);
    
    const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
    const playerMap = new Map<string, string>();
    for (const p of allPlayers) {
        if (p.sleeper_id && p.full_name) {
            playerMap.set(normalize(p.full_name), p.sleeper_id);
        }
    }

    // Insert rankings
    let matched = 0;
    let unmatched = 0;
    const toInsert: { source_id: string; sleeper_id: string; rank: number; notes: string; signal: string }[] = [];

    for (const entry of rpData) {
        const key = normalize(entry.player);
        const sleeperId = playerMap.get(key);
        
        if (!sleeperId) {
            console.log(`  ⚠ No match: ${entry.player}`);
            unmatched++;
            continue;
        }

        // Build notes with RP-specific data
        const noteParts: string[] = [];
        if (entry.signal) noteParts.push(entry.signal);
        if (entry.gap !== null && entry.gap !== 0) noteParts.push(`Gap: ${entry.gap > 0 ? '+' : ''}${entry.gap}`);
        if (entry.note) noteParts.push(entry.note);

        toInsert.push({
            source_id: sourceId,
            sleeper_id: sleeperId,
            rank: entry.rank,
            notes: noteParts.join(' · '),
            signal: mapSignal(entry.call, entry.signal),
        });
        matched++;
    }

    if (toInsert.length > 0) {
        // Batch insert
        for (let i = 0; i < toInsert.length; i += 50) {
            await db.insert(customRankings).values(toInsert.slice(i, i + 50));
        }
    }

    console.log(`\n--- Done ---`);
    console.log(`✅ Matched & inserted: ${matched}`);
    console.log(`⚠️  Unmatched: ${unmatched}`);
    process.exit(0);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
