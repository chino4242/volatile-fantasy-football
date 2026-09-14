import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { weeklyRankings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getLatestWeek } from "@/lib/weekly-rankings";
import { parseDkSalariesCsv } from "@/lib/dk-salaries";
import { buildDkPool, type WeeklyRankRow } from "@/lib/dk-projection";

export const dynamic = "force-dynamic";

/**
 * POST /api/dfs/value
 * Body: { csv: string, week?: number, maxSalary?: number, position?: string }
 *
 * Value finder — answers "who's the best play at ≤ $X?". Parses the DK Classic
 * CSV, projects each player from this week's rankings (Option A), applies the
 * salary + position filters, and returns players sorted by raw projection with a
 * proj-per-$1k "value" column. Stateless; nothing is persisted.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const csv: string = body?.csv || "";
        if (!csv.trim()) return NextResponse.json({ error: "No CSV provided" }, { status: 400 });

        const maxSalary: number | null =
            body?.maxSalary != null && Number.isFinite(Number(body.maxSalary)) ? Number(body.maxSalary) : null;
        const position: string | null = body?.position ? String(body.position).toUpperCase() : null;

        const week = body?.week != null ? Number(body.week) : await getLatestWeek();
        if (week == null) return NextResponse.json({ error: "No weekly rankings uploaded yet" }, { status: 400 });

        const { entries } = parseDkSalariesCsv(csv);
        if (entries.length === 0) {
            return NextResponse.json({ error: "Could not parse any players from the CSV. Is it a DraftKings Classic export?" }, { status: 400 });
        }

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

        const { pool } = buildDkPool(entries, weekly);

        // FLEX filter means the RB/WR/TE flex-eligible pool.
        const matchesPosition = (pos: string): boolean => {
            if (position == null) return true;
            if (position === "FLEX") return pos === "RB" || pos === "WR" || pos === "TE";
            return pos === position;
        };

        // Apply filters, attach value = projection per $1k, sort by projection desc.
        const players = pool
            .filter(p => maxSalary == null || p.salary <= maxSalary)
            .filter(p => matchesPosition(p.position))
            .map(p => ({
                name: p.name,
                position: p.position,
                team: p.team,
                opponent: p.opponent ?? null,
                salary: p.salary,
                projection: p.projection,
                valuePerK: Math.round((p.projection / (p.salary / 1000)) * 100) / 100,
            }))
            .sort((a, b) => b.projection - a.projection);

        return NextResponse.json({
            week,
            maxSalary,
            position: position ?? "ALL",
            count: players.length,
            players,
        });
    } catch (err) {
        console.error("[dfs/value] error", err);
        return NextResponse.json({ error: "Failed to compute value" }, { status: 500 });
    }
}
