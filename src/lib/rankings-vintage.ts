import { db } from "@/db";
import { playerValues } from "@/db/schema";
import { isNotNull } from "drizzle-orm";

/**
 * Returns the VFF rankings vintage date for a given format.
 * Grabs the first non-null rank_*_updated_at from player_values.
 */
export async function getRankingsVintage(format: '1qb' | 'sf'): Promise<Date | null> {
    const col = format === '1qb' ? playerValues.rank_1qb_updated_at : playerValues.rank_sf_updated_at;
    const row = await db.select({ updated_at: col })
        .from(playerValues)
        .where(isNotNull(col))
        .limit(1);
    return row[0]?.updated_at || null;
}

/**
 * Formats a vintage date as "Mon YYYY" (e.g., "Mar 2026")
 */
export function formatVintage(date: Date | null): string | null {
    if (!date) return null;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
