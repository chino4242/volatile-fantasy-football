import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { playerTags, players } from "@/db/schema";
import { eq, inArray, or, ilike } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET  /api/portfolio/tags                → list all tags (joined w/ player name/pos)
 * GET  /api/portfolio/tags?search=mahomes → search players to tag (name match)
 * POST /api/portfolio/tags  {sleeper_id, tag:'buy'|'sell', note?}  → upsert a tag
 * DELETE /api/portfolio/tags?sleeper_id=  → remove a tag
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    if (search && search.trim().length >= 2) {
        // Player search for the tagging UI (skill positions only).
        const rows = await db
            .select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team })
            .from(players)
            .where(or(ilike(players.full_name, `%${search.trim()}%`)))
            .limit(20);
        const filtered = rows.filter(r => ["QB", "RB", "WR", "TE"].includes(r.position || ""));
        return NextResponse.json({ players: filtered });
    }

    // List all current tags, enriched with player info.
    const tags = await db.select().from(playerTags);
    if (tags.length === 0) return NextResponse.json({ tags: [] });
    const ids = tags.map(t => t.sleeper_id);
    const info = await db
        .select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team })
        .from(players)
        .where(inArray(players.sleeper_id, ids));
    const infoById = new Map(info.map(p => [p.sleeper_id, p]));
    const enriched = tags.map(t => ({
        sleeper_id: t.sleeper_id,
        tag: t.tag,
        note: t.note,
        full_name: infoById.get(t.sleeper_id)?.full_name || t.sleeper_id,
        position: infoById.get(t.sleeper_id)?.position || null,
        team: infoById.get(t.sleeper_id)?.team || null,
    }));
    return NextResponse.json({ tags: enriched });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sleeper_id, tag, note } = body || {};
        if (!sleeper_id || (tag !== "buy" && tag !== "sell")) {
            return NextResponse.json({ error: "sleeper_id and tag ('buy'|'sell') required" }, { status: 400 });
        }
        await db
            .insert(playerTags)
            .values({ sleeper_id, tag, note: note ?? null })
            .onConflictDoUpdate({
                target: playerTags.sleeper_id,
                set: { tag, note: note ?? null, updated_at: new Date() },
            });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[portfolio/tags] POST error", err);
        return NextResponse.json({ error: "Failed to save tag" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const sleeper_id = searchParams.get("sleeper_id");
    if (!sleeper_id) return NextResponse.json({ error: "sleeper_id required" }, { status: 400 });
    await db.delete(playerTags).where(eq(playerTags.sleeper_id, sleeper_id));
    return NextResponse.json({ ok: true });
}
