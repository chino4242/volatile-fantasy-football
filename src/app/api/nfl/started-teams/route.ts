import { NextResponse } from "next/server";
import { getStartedTeams } from "@/lib/nfl-live";

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
    // getStartedTeams fails open (empty set → no gating).
    const started = await getStartedTeams();
    return NextResponse.json({ startedTeams: [...started] });
}
