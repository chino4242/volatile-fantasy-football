import { NextResponse } from 'next/server';
import { read, utils } from 'xlsx';
import { db } from '@/db';
import { players, playerValues, rankingsHistory } from '@/db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const category = formData.get('category') as string;

        if (!file || !category) {
            return NextResponse.json({ error: 'Missing file or category' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = read(buffer);

        const sheetName = 'Rankings and Tiers';
        if (!workbook.Sheets[sheetName]) {
            return NextResponse.json({
                error: `Sheet "${sheetName}" not found. Rankings must be on a sheet exactly named "${sheetName}".`
            }, { status: 400 });
        }

        const worksheet = workbook.Sheets[sheetName];
        // Skip hidden headers, get raw JSON
        const rawData = utils.sheet_to_json(worksheet, { defval: null });

        // Load all players to build lookup map
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);

        const playerMap = new Map<string, string>();
        for (const p of allPlayers) {
            if (p.full_name) {
                playerMap.set(cleanseName(p.full_name), p.sleeper_id);
            }
        }

        // ── Snapshot current rankings into history before overwriting ──
        const rankCol = category === '1qb' ? playerValues.rank_1qb_overall : playerValues.rank_sf_overall;
        const existingRanks = await db.select({
            sleeper_id: playerValues.sleeper_id,
            overall: category === '1qb' ? playerValues.rank_1qb_overall : playerValues.rank_sf_overall,
            pos_rank: category === '1qb' ? playerValues.rank_1qb_pos : playerValues.rank_sf_pos,
            tier: category === '1qb' ? playerValues.rank_1qb_tier : playerValues.rank_sf_tier,
            updated_at: category === '1qb' ? playerValues.rank_1qb_updated_at : playerValues.rank_sf_updated_at,
        }).from(playerValues).where(isNotNull(rankCol));

        if (existingRanks.length > 0) {
            // Use the stored updated_at as recorded_at, or fall back to now
            const snapshotDate = existingRanks[0].updated_at || new Date();
            const historyRows = existingRanks.map(r => ({
                sleeper_id: r.sleeper_id,
                category,
                overall: r.overall,
                pos_rank: r.pos_rank,
                tier: r.tier,
                recorded_at: snapshotDate,
            }));

            // Insert in batches of 500
            for (let i = 0; i < historyRows.length; i += 500) {
                await db.insert(rankingsHistory).values(historyRows.slice(i, i + 500));
            }
        }

        // ── Apply new rankings ──
        const now = new Date();
        let matchCount = 0;
        const updatePromises = [];

        for (const row of rawData as any[]) {
            const playerName = row['Player'] || row['Name'];
            const overallStr = row['Overall'];
            const positionalRankStr = row['Positional Rank'];
            const tierStr = row['Tier'];

            if (!playerName || overallStr === undefined || overallStr === null) continue;

            const cleansedRowName = cleanseName(playerName);
            const sleeperId = playerMap.get(cleansedRowName);

            if (!sleeperId) continue;
            matchCount++;

            let posRank = null;
            if (positionalRankStr) {
                const match = String(positionalRankStr).match(/\d+/);
                if (match) posRank = parseInt(match[0], 10);
            }

            const overall = parseInt(overallStr, 10);
            const tier = tierStr ? parseInt(tierStr, 10) : null;

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
            }

            // Queue up the drizzle update query
            updatePromises.push(
                db.update(playerValues)
                    .set(updateData)
                    .where(eq(playerValues.sleeper_id, sleeperId))
            );
        }

        // Execute all updates. 
        // For ~400 players, Promise.all easily works within serverless limits.
        await Promise.all(updatePromises);

        return NextResponse.json({
            success: true,
            totalRows: rawData.length,
            matches: matchCount,
            updatedCount: updatePromises.length,
            matchRate: rawData.length > 0 ? Math.round((matchCount / rawData.length) * 100) : 0,
            archivedCount: existingRanks.length,
        });

    } catch (error: any) {
        console.error('Error processing upload:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
