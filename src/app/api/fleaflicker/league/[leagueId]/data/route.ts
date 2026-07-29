import { NextRequest, NextResponse } from "next/server";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players } from "@/db/schema";
import { sql } from "drizzle-orm";
import { cleanseName } from "@/lib/nameUtils";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ leagueId: string }> }
) {
    const { leagueId } = await params;
    const username = request.nextUrl.searchParams.get('username');
    const teamId = request.nextUrl.searchParams.get('teamId');

    try {
        const data = await getFleaflickerLeague(leagueId);

        // If username or teamId provided, find their roster and return sleeper_ids
        if (username || teamId) {
            let userTeam;
            if (teamId) {
                userTeam = data.rosters.find(r => String(r.id) === teamId);
            } else if (username) {
                const lowerUser = username.toLowerCase();
                userTeam = data.rosters.find(r =>
                    r.owners.some(o => {
                        const ownerName = o.display_name.toLowerCase();
                        return ownerName === lowerUser || 
                               ownerName.includes(lowerUser) || 
                               lowerUser.includes(ownerName);
                    }) || r.name?.toLowerCase().includes(lowerUser)
                );
            }
            if (userTeam) {
                const playerNames = userTeam.players
                    .map(p => p.full_name)
                    .filter(Boolean);

                // Match names to sleeper_ids from DB
                if (playerNames.length > 0) {
                    const normalizedNames = playerNames.map(n => cleanseName(n));
                    const dbPlayers = await db
                        .select({ sleeper_id: players.sleeper_id, full_name: players.full_name })
                        .from(players)
                        .where(sql`${players.position} IN ('QB', 'RB', 'WR', 'TE', 'DEF')`);

                    const nameToId = new Map(dbPlayers.map(p => [cleanseName(p.full_name), p.sleeper_id]));
                    const myPlayerIds = normalizedNames
                        .map(n => nameToId.get(n))
                        .filter(Boolean) as string[];

                    return NextResponse.json({ myPlayerIds });
                }
            }
            return NextResponse.json({ myPlayerIds: [] });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Fleaflicker API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch Fleaflicker data" },
            { status: 500 }
        );
    }
}
