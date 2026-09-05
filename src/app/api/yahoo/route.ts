import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leagues } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo?list=true
 * List all Yahoo leagues synced into the shared leagues table (for the home dashboard).
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        if (searchParams.get("list")) {
            const yahooLeagues = await db
                .select({
                    league_id: leagues.league_id,
                    name: leagues.name,
                    total_rosters: leagues.total_rosters,
                    scoring_format: leagues.scoring_format,
                })
                .from(leagues)
                .where(eq(leagues.platform, "yahoo"));
            return NextResponse.json({ leagues: yahooLeagues });
        }
        return NextResponse.json({ error: "Missing query param: list" }, { status: 400 });
    } catch (error) {
        console.error("Error listing Yahoo leagues:", error);
        return NextResponse.json({ error: "Failed to list Yahoo leagues" }, { status: 500 });
    }
}
