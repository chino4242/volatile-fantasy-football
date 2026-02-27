import { NextRequest, NextResponse } from "next/server";
import { getFleaflickerLeague } from "@/lib/fleaflicker";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> }
) {
    const { leagueId } = await params;

    try {
        const data = await getFleaflickerLeague(leagueId);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Fleaflicker API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch Fleaflicker data" },
            { status: 500 }
        );
    }
}
