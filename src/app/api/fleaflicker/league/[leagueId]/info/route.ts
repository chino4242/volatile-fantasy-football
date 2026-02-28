import { NextRequest, NextResponse } from "next/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> }
) {
    const { leagueId } = await params;

    try {
        const res = await fetch(
            `https://www.fleaflicker.com/api/FetchLeagueStandings?sport=NFL&league_id=${leagueId}`
        );
        if (!res.ok) throw new Error(`Fleaflicker returned ${res.status}`);
        const data = await res.json();

        return NextResponse.json({
            id: String(data.league?.id ?? leagueId),
            name: data.league?.name ?? `League ${leagueId}`,
        });
    } catch (error) {
        console.error("Fleaflicker league-info error:", error);
        return NextResponse.json(
            { error: "League not found" },
            { status: 404 }
        );
    }
}
