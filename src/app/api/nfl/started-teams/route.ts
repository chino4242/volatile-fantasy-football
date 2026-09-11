import { NextResponse } from "next/server";
import { getLiveGameStates } from "@/lib/nfl-live";

export const dynamic = "force-dynamic";

/**
 * GET /api/nfl/started-teams
 * → { startedTeams: string[] }  (NFL team abbrs, our convention)
 *
 * Teams whose game this week has already kicked off (ESPN state != 'pre').
 * The portfolio page uses this to suppress weekly waiver-upgrade suggestions
 * for free agents who can no longer help this week. Short-lived / HTTP-only
 * (Vercel-safe); the underlying scoreboard fetch is cached with a LIVE TTL.
 */
export async function GET() {
    try {
        const states = await getLiveGameStates();
        const started = new Set<string>();
        for (const gs of states.values()) {
            if (gs.state !== "pre") {
                started.add(gs.home);
                started.add(gs.away);
            }
        }
        return NextResponse.json({ startedTeams: [...started] });
    } catch {
        // On any failure, return empty → no gating (fail open; better to show a
        // stale suggestion than to hide everything).
        return NextResponse.json({ startedTeams: [] });
    }
}
