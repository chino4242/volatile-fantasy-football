import Link from "next/link";
import { getFleaflickerLeague } from "@/lib/fleaflicker";
import { db } from "@/db";
import { players, playerValues } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { TeamRosterTable } from "@/app/league/[leagueId]/team/[rosterId]/TeamRosterTable";

export const dynamic = "force-dynamic";

export default async function FleaflickerTeamPage({
    params,
}: {
    params: Promise<{ leagueId: string; teamId: string }>;
}) {
    const { leagueId, teamId } = await params;
    const fleaflickerData = await getFleaflickerLeague(leagueId);

    const roster = fleaflickerData.rosters.find(r => r.id === parseInt(teamId));
    if (!roster) {
        return <div className="p-8 text-center">Team not found</div>;
    }

    // Get player names
    const playerNames = roster.players
        .map(p => p.full_name.toLowerCase())
        .filter(Boolean);

    // Fetch from DB
    const allPlayers = await db.select().from(players);
    const matchedPlayers = allPlayers.filter(p => 
        playerNames.includes(p.full_name.toLowerCase())
    );

    const playerIds = matchedPlayers.map(p => p.sleeper_id);
    const values = await db
        .select()
        .from(playerValues)
        .where(inArray(playerValues.sleeper_id, playerIds));

    const valueMap = new Map(values.map(v => [v.sleeper_id, v]));
    const nameToPlayerMap = new Map(
        matchedPlayers.map(p => [p.full_name.toLowerCase(), p])
    );

    // Transform to TeamRosterTable format
    const playersWithData = roster.players
        .map(player => {
            const dbPlayer = nameToPlayerMap.get(player.full_name.toLowerCase());
            if (!dbPlayer) return null;
            
            const valueData = valueMap.get(dbPlayer.sleeper_id);
            
            return {
                sleeper_id: dbPlayer.sleeper_id,
                full_name: player.full_name,
                position: dbPlayer.position,
                team: player.team || dbPlayer.team,
                fc_value: valueData?.fc_value_1qb || null, // Use 1QB values for Fleaflicker
                fc_rank: valueData?.fc_rank_1qb || null,
                rank_1qb_overall: valueData?.rank_1qb_overall || null,
                rank_1qb_pos: valueData?.rank_1qb_pos || null,
                rank_1qb_tier: valueData?.rank_1qb_tier || null,
                rank_sf_overall: valueData?.rank_sf_overall || null,
                rank_sf_pos: valueData?.rank_sf_pos || null,
                rank_sf_tier: valueData?.rank_sf_tier || null,
            };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    const totalValue = playersWithData.reduce((sum, p) => sum + (p.fc_value || 0), 0);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 p-4 md:p-8">
            <div className="mx-auto max-w-7xl">
                <div className="mb-6">
                    <Link
                        href={`/fleaflicker/${leagueId}`}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        ← Back to League
                    </Link>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 md:text-3xl">
                        {roster.name}
                    </h1>
                    <p className="mt-2 text-lg font-semibold text-zinc-700 dark:text-zinc-300">
                        Total Value: {totalValue.toLocaleString()}
                    </p>
                </div>

                <TeamRosterTable players={playersWithData} scoringFormat="1qb" />
            </div>
        </div>
    );
}
