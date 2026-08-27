import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { rosters } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/myffpc/rename
 * Rename a roster (team name).
 * Body: { rosterId: string (uuid), name: string }
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { rosterId, name } = body;

        if (!rosterId || !name) {
            return NextResponse.json(
                { error: "Missing required fields: rosterId, name" },
                { status: 400 }
            );
        }

        await db.update(rosters)
            .set({ owner_name: name.trim() })
            .where(eq(rosters.id, rosterId));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error renaming roster:", error);
        return NextResponse.json(
            { error: "Failed to rename" },
            { status: 500 }
        );
    }
}
