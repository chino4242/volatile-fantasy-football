import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, prospectWriteups } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
    try {
        const { playerName, position, source, draftYear, analysisText } = await request.json();

        if (!playerName || !source || !draftYear || !analysisText) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Try to match player by name
        const normalized = playerName.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
        const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
            .from(players);
        const match = allPlayers.find(p =>
            p.full_name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim() === normalized
        );

        await db.execute(sql`
            INSERT INTO prospect_writeups (id, sleeper_id, full_name, position, source, draft_year, analysis_text)
            VALUES (gen_random_uuid(), ${match?.sleeper_id || null}, ${playerName}, ${position || null}, ${source}, ${parseInt(draftYear)}, ${analysisText})
            ON CONFLICT (full_name, source, draft_year) DO UPDATE SET
                sleeper_id = COALESCE(EXCLUDED.sleeper_id, prospect_writeups.sleeper_id),
                position = COALESCE(EXCLUDED.position, prospect_writeups.position),
                analysis_text = EXCLUDED.analysis_text
        `);

        return NextResponse.json({
            success: true,
            matched: !!match,
            sleeperId: match?.sleeper_id || null,
        });
    } catch (error) {
        console.error("Writeup submission error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
