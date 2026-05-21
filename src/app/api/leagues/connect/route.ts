import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userLeagues } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const SLEEPER_API = 'https://api.sleeper.app/v1';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sleeper_username } = await request.json();
  if (!sleeper_username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  try {
    // 1. Get Sleeper user ID from username
    const userRes = await fetch(`${SLEEPER_API}/user/${sleeper_username}`);
    if (!userRes.ok) return NextResponse.json({ error: 'Sleeper user not found' }, { status: 404 });
    const sleeperUser = await userRes.json();

    // 2. Get all leagues for this user (current NFL season)
    const season = new Date().getFullYear();
    const leaguesRes = await fetch(`${SLEEPER_API}/user/${sleeperUser.user_id}/leagues/nfl/${season}`);
    if (!leaguesRes.ok) return NextResponse.json({ error: 'Failed to fetch leagues' }, { status: 502 });
    const leagues = await leaguesRes.json();

    // 3. Store each league in user_leagues
    const connected = [];
    for (const league of leagues) {
      // Fetch rosters for this league
      const rostersRes = await fetch(`${SLEEPER_API}/league/${league.league_id}/rosters`);
      const rosters = rostersRes.ok ? await rostersRes.json() : [];

      // Fetch users to map roster_id → display_name
      const usersRes = await fetch(`${SLEEPER_API}/league/${league.league_id}/users`);
      const users = usersRes.ok ? await usersRes.json() : [];
      const userMap = Object.fromEntries(users.map((u: any) => [u.user_id, u.display_name]));

      // Enrich rosters with owner names
      const enrichedRosters = rosters.map((r: any) => ({
        roster_id: r.roster_id,
        owner_id: r.owner_id,
        owner_name: userMap[r.owner_id] || 'Unknown',
        players: r.players || [],
        starters: r.starters || [],
      }));

      // Find user's roster
      const myRoster = enrichedRosters.find((r: any) => r.owner_id === sleeperUser.user_id);

      await db.insert(userLeagues).values({
        user_id: user.id,
        platform: 'sleeper',
        external_league_id: league.league_id,
        league_name: league.name,
        scoring_format: league.settings?.num_qbs >= 2 ? 'sf' : '1qb',
        roster_data: { rosters: enrichedRosters, my_roster_id: myRoster?.roster_id },
        synced_at: new Date(),
      }).onConflictDoUpdate({
        target: [userLeagues.user_id, userLeagues.platform, userLeagues.external_league_id] as any,
        set: {
          league_name: league.name,
          roster_data: { rosters: enrichedRosters, my_roster_id: myRoster?.roster_id },
          synced_at: new Date(),
        },
      });

      connected.push({ id: league.league_id, name: league.name, teams: rosters.length });
    }

    return NextResponse.json({ success: true, leagues: connected });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
