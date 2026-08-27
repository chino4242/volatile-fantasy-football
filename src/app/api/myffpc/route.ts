import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, playerValues, leagues, rosters, rosterPlayers } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseMultiTeamPaste } from "@/lib/myffpc-parser";
import { cleanseName } from "@/lib/nameUtils";

export const dynamic = "force-dynamic";

/**
 * POST /api/myffpc
 * Create a new MyFFPC league from pasted roster data.
 * Body: { name: string, rosters: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, rosters: rosterText } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Missing required field: name" },
                { status: 400 }
            );
        }

        // Generate league ID
        const leagueId = `myffpc_${Date.now()}`;

        // Insert league
        await db.insert(leagues).values({
            league_id: leagueId,
            platform: "myffpc",
            scoring_format: "1qb",
            league_type: "dynasty",
            name,
            total_rosters: 0,
            start_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "PK", "DST"],
            roster_positions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "PK", "DST", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "IR", "IR", "IR"],
        });

        // If rosters text is provided, parse and insert teams
        if (rosterText) {
            const parsedRosters = parseMultiTeamPaste(rosterText);
            if (parsedRosters.length > 0) {
                // Build player name -> sleeper_id lookup map
                const allPlayers = await db.select({
                    sleeper_id: players.sleeper_id,
                    full_name: players.full_name,
                }).from(players);

                const nameToSleeperIdMap = new Map<string, string>();
                for (const p of allPlayers) {
                    nameToSleeperIdMap.set(cleanseName(p.full_name), p.sleeper_id);
                }

                // Insert rosters and players
                for (let i = 0; i < parsedRosters.length; i++) {
                    const parsed = parsedRosters[i];
                    const rosterId = `${leagueId}_roster_${i + 1}`;

                    const [insertedRoster] = await db.insert(rosters).values({
                        league_id: leagueId,
                        roster_id: rosterId,
                        owner_name: parsed.owner || parsed.teamName,
                    }).returning({ id: rosters.id });

                    const playerInserts: { roster_id: string; sleeper_id: string; is_starter: boolean }[] = [];
                    for (const player of parsed.players) {
                        const sleeperId = nameToSleeperIdMap.get(player.normalizedName);
                        if (sleeperId) {
                            playerInserts.push({
                                roster_id: insertedRoster.id,
                                sleeper_id: sleeperId,
                                is_starter: player.isStarter,
                            });
                        }
                    }

                    if (playerInserts.length > 0) {
                        await db.insert(rosterPlayers).values(playerInserts);
                    }
                }

                // Update total_rosters count
                await db.update(leagues)
                    .set({ total_rosters: parsedRosters.length })
                    .where(eq(leagues.league_id, leagueId));
            }
        }

        return NextResponse.json({ league_id: leagueId });
    } catch (error) {
        console.error("Error creating MyFFPC league:", error);
        return NextResponse.json(
            { error: "Failed to create league" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/myffpc?id=leagueId
 * Fetch league info + all rosters with matched player data and values.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const leagueId = searchParams.get("id");

        if (!leagueId) {
            return NextResponse.json(
                { error: "Missing required query param: id" },
                { status: 400 }
            );
        }

        // Fetch league
        const [league] = await db
            .select()
            .from(leagues)
            .where(eq(leagues.league_id, leagueId));

        if (!league) {
            return NextResponse.json(
                { error: "League not found" },
                { status: 404 }
            );
        }

        // Fetch rosters
        const leagueRosters = await db
            .select()
            .from(rosters)
            .where(eq(rosters.league_id, leagueId));

        // Fetch all roster players
        const rosterIds = leagueRosters.map(r => r.id);
        const allRosterPlayers = rosterIds.length > 0
            ? await db
                .select()
                .from(rosterPlayers)
                .where(inArray(rosterPlayers.roster_id, rosterIds))
            : [];

        // Get unique player IDs
        const sleeperIds = [...new Set(allRosterPlayers.map(rp => rp.sleeper_id).filter(Boolean) as string[])];

        // Fetch player info + values
        const playerData = sleeperIds.length > 0
            ? await db
                .select({
                    sleeper_id: players.sleeper_id,
                    full_name: players.full_name,
                    position: players.position,
                    team: players.team,
                    fc_value_1qb: playerValues.fc_value_1qb,
                    fc_rank_1qb: playerValues.fc_rank_1qb,
                    rank_1qb_overall: playerValues.rank_1qb_overall,
                    rank_1qb_tier: playerValues.rank_1qb_tier,
                    redraft_auction_value: playerValues.redraft_auction_value,
                })
                .from(players)
                .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
                .where(inArray(players.sleeper_id, sleeperIds))
            : [];

        const playerMap = new Map(playerData.map(p => [p.sleeper_id, p]));

        // Build response
        const rostersWithPlayers = leagueRosters.map(roster => {
            const rosterPlayerList = allRosterPlayers
                .filter(rp => rp.roster_id === roster.id)
                .map(rp => {
                    const player = playerMap.get(rp.sleeper_id!);
                    return player ? { ...player, is_starter: rp.is_starter } : null;
                })
                .filter(Boolean);

            const totalValue = rosterPlayerList.reduce(
                (sum, p) => sum + ((p as any)?.fc_value_1qb || 0), 0
            );

            return {
                ...roster,
                players: rosterPlayerList,
                totalValue,
            };
        });

        return NextResponse.json({ league, rosters: rostersWithPlayers });
    } catch (error) {
        console.error("Error fetching MyFFPC league:", error);
        return NextResponse.json(
            { error: "Failed to fetch league" },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/myffpc
 * Update/re-paste rosters for an existing league.
 * Body: { league_id: string, rosters: string }
 */
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { league_id: leagueId, rosters: rosterText } = body;

        if (!leagueId || !rosterText) {
            return NextResponse.json(
                { error: "Missing required fields: league_id, rosters" },
                { status: 400 }
            );
        }

        // Verify league exists
        const [league] = await db
            .select()
            .from(leagues)
            .where(eq(leagues.league_id, leagueId));

        if (!league) {
            return NextResponse.json(
                { error: "League not found" },
                { status: 404 }
            );
        }

        // Parse the new rosters
        const parsedRosters = parseMultiTeamPaste(rosterText);
        if (parsedRosters.length === 0) {
            return NextResponse.json(
                { error: "No valid rosters found in paste." },
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

        // Delete old rosters (cascade will delete roster_players)
        await db.delete(rosters).where(eq(rosters.league_id, leagueId));

        // Re-insert rosters and players
        for (let i = 0; i < parsedRosters.length; i++) {
            const parsed = parsedRosters[i];
            const rosterId = `${leagueId}_roster_${i + 1}`;

            const [insertedRoster] = await db.insert(rosters).values({
                league_id: leagueId,
                roster_id: rosterId,
                owner_name: parsed.owner || parsed.teamName,
            }).returning({ id: rosters.id });

            const playerInserts: { roster_id: string; sleeper_id: string; is_starter: boolean }[] = [];
            for (const player of parsed.players) {
                const sleeperId = nameToSleeperIdMap.get(player.normalizedName);
                if (sleeperId) {
                    playerInserts.push({
                        roster_id: insertedRoster.id,
                        sleeper_id: sleeperId,
                        is_starter: player.isStarter,
                    });
                }
            }

            if (playerInserts.length > 0) {
                await db.insert(rosterPlayers).values(playerInserts);
            }
        }

        // Update league roster count
        await db.update(leagues)
            .set({ total_rosters: parsedRosters.length })
            .where(eq(leagues.league_id, leagueId));

        return NextResponse.json({ league_id: leagueId, teams: parsedRosters.length });
    } catch (error) {
        console.error("Error updating MyFFPC league:", error);
        return NextResponse.json(
            { error: "Failed to update league" },
            { status: 500 }
        );
    }
}
