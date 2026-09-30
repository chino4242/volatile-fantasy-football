import { db } from "@/db";
import { playerTags } from "@/db/schema";

/**
 * Analyst signal stamped onto free-agent rows so trusted pickups stand out while
 * scrolling by value. Sourced from player_tags (Chino's Buy/Sell board, which the
 * transactions feed also populates). 'add'/'buy' = a pickup to grab; 'sell' is
 * carried too so we never mislabel, but the FA screens only surface add/buy.
 */
export interface AnalystSignal {
    tag: 'buy' | 'sell' | 'add';
    note: string | null;
    week: number | null;
}

/**
 * Load analyst signals for the whole board, keyed by sleeper_id. Cheap (single
 * table, one row per tagged player) so we fetch all and let the caller intersect
 * with its free-agent list. Returns an empty Map on any error (non-fatal — the
 * FA table renders fine without signals).
 */
export async function getAnalystSignals(): Promise<Map<string, AnalystSignal>> {
    try {
        const rows = await db
            .select({ sleeper_id: playerTags.sleeper_id, tag: playerTags.tag, note: playerTags.note, week: playerTags.week })
            .from(playerTags);
        const byId = new Map<string, AnalystSignal>();
        for (const r of rows) {
            byId.set(r.sleeper_id, {
                tag: r.tag as AnalystSignal['tag'],
                note: r.note ?? null,
                week: r.week ?? null,
            });
        }
        return byId;
    } catch {
        return new Map();
    }
}
