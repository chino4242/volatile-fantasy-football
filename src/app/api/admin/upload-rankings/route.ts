import { NextResponse } from 'next/server';
import { read, utils } from 'xlsx';
import { db } from '@/db';
import { players, playerValues, rankingsHistory } from '@/db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';

function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === ',' && !inQuotes) { fields.push(current.trim()); current = ''; }
        else { current += char; }
    }
    fields.push(current.trim());
    return fields;
}

function parseCSV(text: string): Record<string, any>[] {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    // Strip BOM if present
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    const headers = parseCSVLine(headerLine);
    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row: Record<string, any> = {};
        headers.forEach((h, i) => { row[h] = values[i] ?? null; });
        return row;
    });
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const category = formData.get('category') as string;

        if (!file || !category) {
            return NextResponse.json({ error: 'Missing file or category' }, { status: 400 });
        }

        // ── Parse file (CSV or XLSX) ──
        let rawData: Record<string, any>[];
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
            const text = await file.text();
            rawData = parseCSV(text);
        } else {
            // XLSX path
            const buffer = await file.arrayBuffer();
            const workbook = read(buffer);
            const sheetName = 'Rankings and Tiers';
            if (!workbook.Sheets[sheetName]) {
                // Try first sheet as fallback
                const firstSheet = workbook.SheetNames[0];
                if (!firstSheet) return NextResponse.json({ error: 'No sheets found in workbook' }, { status: 400 });
                rawData = utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: null }) as Record<string, any>[];
            } else {
                rawData = utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }) as Record<string, any>[];
            }
        }

        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ error: 'No data found in file.' }, { status: 400 });
        }

        // Log detected columns
        const firstRowKeys = Object.keys(rawData[0]);
        console.log('Upload columns detected:', firstRowKeys);

        // ── Normalize column names ──
        // Handle variants: "Pos Rank" / "Positional Rank", "Auction (Out of $200)" / "Auction Value"
        const getCol = (row: any, ...names: string[]) => {
            for (const name of names) {
                if (row[name] !== undefined && row[name] !== null) return row[name];
            }
            return null;
        };

        // Load all players to build lookup map
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);

        const playerMap = new Map<string, string>();
        for (const p of allPlayers) {
            if (p.full_name) {
                playerMap.set(cleanseName(p.full_name), p.sleeper_id);
            }
        }

        // ── Snapshot current rankings into history before overwriting ──
        const rankCol = category === '1qb' ? playerValues.rank_1qb_overall
            : category === 'sf' ? playerValues.rank_sf_overall
            : playerValues.redraft_rank_overall;
        const existingRanks = await db.select({
            sleeper_id: playerValues.sleeper_id,
            overall: category === '1qb' ? playerValues.rank_1qb_overall
                : category === 'sf' ? playerValues.rank_sf_overall
                : playerValues.redraft_rank_overall,
            pos_rank: category === '1qb' ? playerValues.rank_1qb_pos
                : category === 'sf' ? playerValues.rank_sf_pos
                : playerValues.redraft_rank_pos,
            tier: category === '1qb' ? playerValues.rank_1qb_tier
                : category === 'sf' ? playerValues.rank_sf_tier
                : playerValues.redraft_rank_tier,
            updated_at: category === '1qb' ? playerValues.rank_1qb_updated_at
                : category === 'sf' ? playerValues.rank_sf_updated_at
                : playerValues.redraft_rank_updated_at,
        }).from(playerValues).where(isNotNull(rankCol));

        if (existingRanks.length > 0) {
            const snapshotDate = existingRanks[0].updated_at || new Date();
            const historyRows = existingRanks.map(r => ({
                sleeper_id: r.sleeper_id,
                category,
                overall: r.overall,
                pos_rank: r.pos_rank,
                tier: r.tier,
                recorded_at: snapshotDate,
            }));

            for (let i = 0; i < historyRows.length; i += 500) {
                await db.insert(rankingsHistory).values(historyRows.slice(i, i + 500));
            }
        }

        // ── Apply new rankings ──
        const now = new Date();
        let matchCount = 0;
        const updatePromises = [];
        const unmatchedNames: string[] = [];

        for (const row of rawData) {
            const playerName = getCol(row, 'Player', 'Name');
            const overallStr = getCol(row, 'Overall', 'Rank');
            const positionalRankStr = getCol(row, 'Positional Rank', 'Pos Rank', 'Position Rank');
            const tierStr = getCol(row, 'Tier');
            const auctionStr = getCol(row, 'Auction (Out of $200)', 'Auction Value', 'Auction');

            if (!playerName || overallStr === undefined || overallStr === null) continue;

            const cleansedRowName = cleanseName(playerName);
            const sleeperId = playerMap.get(cleansedRowName);

            if (!sleeperId) {
                unmatchedNames.push(playerName);
                continue;
            }
            matchCount++;

            let posRank = null;
            if (positionalRankStr) {
                const match = String(positionalRankStr).match(/\d+/);
                if (match) posRank = parseInt(match[0], 10);
            }

            const overall = parseInt(String(overallStr), 10);
            const tier = tierStr ? parseInt(String(tierStr), 10) : null;

            // Parse auction value: strip "$", spaces, and parse as integer
            let auctionValue: number | null = null;
            if (auctionStr) {
                const cleaned = String(auctionStr).replace(/[$\s,]/g, '');
                const parsed = parseInt(cleaned, 10);
                if (!isNaN(parsed)) auctionValue = parsed;
            }

            const updateData: any = { updated_at: now };

            if (category === '1qb') {
                updateData.rank_1qb_overall = overall;
                updateData.rank_1qb_tier = tier;
                updateData.rank_1qb_updated_at = now;
                if (posRank !== null) updateData.rank_1qb_pos = posRank;
            } else if (category === 'sf') {
                updateData.rank_sf_overall = overall;
                updateData.rank_sf_tier = tier;
                updateData.rank_sf_updated_at = now;
                if (posRank !== null) updateData.rank_sf_pos = posRank;
            } else if (category === 'redraft') {
                updateData.redraft_rank_overall = overall;
                updateData.redraft_rank_tier = tier;
                updateData.redraft_rank_updated_at = now;
                if (posRank !== null) updateData.redraft_rank_pos = posRank;
                if (auctionValue !== null) updateData.redraft_auction_value = auctionValue;
            }

            updatePromises.push(
                db.update(playerValues)
                    .set(updateData)
                    .where(eq(playerValues.sleeper_id, sleeperId))
            );
        }

        await Promise.all(updatePromises);

        return NextResponse.json({
            success: true,
            totalRows: rawData.length,
            matches: matchCount,
            updatedCount: updatePromises.length,
            matchRate: rawData.length > 0 ? Math.round((matchCount / rawData.length) * 100) : 0,
            archivedCount: existingRanks.length,
            unmatchedNames,
        });

    } catch (error: any) {
        console.error('Error processing upload:', error?.stack || error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
