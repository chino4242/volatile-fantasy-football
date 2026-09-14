import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { weeklyRankings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLatestWeek } from "@/lib/weekly-rankings";
import { parseDkSalariesCsv } from "@/lib/dk-salaries";
import { buildDkPool, type WeeklyRankRow } from "@/lib/dk-projection";
import { optimizeDkLineups } from "@/lib/dk-optimizer";

export const dynamic = "force-dynamic";

/**
 * POST /api/dfs/optimize
 * Body: { csv: string, week?: number, count?: number }
 * Parses a DraftKings Classic salary CSV, joins players to this week's rankings
 * (rank → DK projection via Option A), and returns the top-N salary-capped
 * lineups. No projections are stored; this is a stateless optimize call.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const csv: string = body?.csv || "";
        const count: number = Math.min(Math.max(Number(body?.count) || 3, 1), 10);
        if (!csv.trim()) return NextResponse.json({ error: "No CSV provided" }, { status: 400 });

        const week = body?.week != null ? Number(body.week) : await getLatestWeek();
        if (week == null) return NextResponse.json({ error: "No weekly rankings uploaded yet" }, { status: 400 });

        const { entries, skipped } = parseDkSalariesCsv(csv);
        if (entries.length === 0) {
            return NextResponse.json({ error: "Could not parse any players from the CSV. Is it a DraftKings Classic export?" }, { status: 400 });
        }

        // Load this week's ranks (flex/qb/dst) needed to project the pool.
        const rows = await db
            .select({
                kind: weeklyRankings.kind,
                rank: weeklyRankings.rank,
                player_name: weeklyRankings.player_name,
                team: weeklyRankings.team,
                sleeper_id: weeklyRankings.sleeper_id,
                total: weeklyRankings.total,
                opponent: weeklyRankings.opponent,
            })
            .from(weeklyRankings)
            .where(eq(weeklyRankings.week, week));
        const weekly: WeeklyRankRow[] = rows
            .filter(r => r.kind === "flex" || r.kind === "qb" || r.kind === "dst")
            .map(r => ({
                kind: r.kind as WeeklyRankRow["kind"],
                rank: r.rank,
                player_name: r.player_name,
                team: r.team,
                sleeper_id: r.sleeper_id,
                total: r.total != null ? Number(r.total) : null,
                opponent: r.opponent,
            }));

        const { pool, unranked } = buildDkPool(entries, weekly);
        const lineups = optimizeDkLineups(pool, { count });

        return NextResponse.json({
            week,
            count,
            lineups,
            stats: {
                csvPlayers: entries.length,
                csvSkipped: skipped,
                projected: pool.length,
                unranked: unranked.length,
            },
            // A few unranked names help the user see what was excluded.
            unrankedSample: unranked.slice(0, 20),
        });
    } catch (err) {
        console.error("[dfs/optimize] error", err);
        return NextResponse.json({ error: "Failed to optimize lineups" }, { status: 500 });
    }
}
