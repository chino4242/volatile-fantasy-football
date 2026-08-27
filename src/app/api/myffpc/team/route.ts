import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, leagues, rosters, rosterPlayers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseMyFFPCRoster } from "@/lib/myffpc-parser";
import { cleanseName } from "@/lib/nameUtils";

export const dynamic = "force-dynamic";

/**
 * POST /api/myffpc/team
 * Add a single team to an existing MyFFPC league.
 * Body: { leagueId: string, teamName: string, rosterText: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { leagueId, teamName, rosterText } = body;

        if (!leagueId || !teamName || !rosterText) {
            return NextResponse.json(
                { error: "Missing required fields: leagueId, teamName, rosterText" },
                { status: 400 }
            );
        }

        // Verify league exists
        const [league] = await db.select().from(leagues).where(eq(leagues.league_id, leagueId));
        if (!league) {
            return NextResponse.json({ error: "League not found" }, { status: 404 });
        }

        // Parse the roster (prepend team name header if not present)
        let textToParse = rosterText;
        if (!rosterText.includes('Team Notes')) {
            textToParse = `${teamName} Team Notes\nStarters\n${rosterText}`;
        }
        const parsed = parseMyFFPCRoster(textToParse);
        
        // Use the provided team name — always prefer what the user typed
        const finalTeamName = teamName.trim();
        const finalOwner = finalTeamName;

        if (parsed.players.length === 0) {
            return NextResponse.json(
                { error: "No players found in paste. Check the format." },
                { status: 400 }
            );
        }

        // Build player name -> sleeper_id lookup map
        const allPlayers = await db.select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
        }).from(players);

        const nameToSleeperIdMap = new Map<string, string>();
        for (const p of allPlayers) {
            nameToSleeperIdMap.set(cleanseName(p.full_name), p.sleeper_id);
        }

        // Check how many rosters exist already for numbering
        const existingRosters = await db.select().from(rosters).where(eq(rosters.league_id, leagueId));
        const rosterNum = existingRosters.length + 1;
        const rosterId = `${leagueId}_roster_${rosterNum}`;

        // Insert roster
        const [insertedRoster] = await db.insert(rosters).values({
            league_id: leagueId,
            roster_id: rosterId,
            owner_name: finalOwner,
        }).returning({ id: rosters.id });

        // Match and insert players
        const matched: string[] = [];
        const unmatched: string[] = [];
        const playerInserts: { roster_id: string; sleeper_id: string; is_starter: boolean }[] = [];

        for (const player of parsed.players) {
            const sleeperId = nameToSleeperIdMap.get(player.normalizedName);
            if (sleeperId) {
                playerInserts.push({
                    roster_id: insertedRoster.id,
                    sleeper_id: sleeperId,
                    is_starter: player.isStarter,
                });
                matched.push(player.rawName);
            } else {
                unmatched.push(player.rawName);
            }
        }

        if (playerInserts.length > 0) {
            await db.insert(rosterPlayers).values(playerInserts);
        }

        // Update league total_rosters count
        await db.update(leagues)
            .set({ total_rosters: rosterNum })
            .where(eq(leagues.league_id, leagueId));

        return NextResponse.json({
            teamName: finalTeamName,
            matched: matched.length,
            unmatched,
            total: parsed.players.length,
        });
    } catch (error) {
        console.error("Error adding MyFFPC team:", error);
        return NextResponse.json(
            { error: "Failed to add team" },
            { status: 500 }
        );
    }
}
