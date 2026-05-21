import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userLeagues } from '@/db/schema';
import { getSleeperUserId, getUserLeagues, getLeagueUsers, getLeagueRosters } from '@/lib/sleeper';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sleeper_username } = await request.json();
  if (!sleeper_username) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  try {
    const sleeperUserId = await getSleeperUserId(sleeper_username);
    if (!sleeperUserId) return NextResponse.json({ error: 'Sleeper user not found' }, { status: 404 });

    const leagues = await getUserLeagues(sleeperUserId);

    const connected = [];
    for (const league of leagues) {
      const [rosters, users] = await Promise.all([
        getLeagueRosters(league.league_id),
        getLeagueUsers(league.league_id),
      ]);

      const userMap = Object.fromEntries(users.map(u => [u.user_id, u.display_name]));
      const enrichedRosters = rosters.map(r => ({
        roster_id: r.roster_id,
        owner_id: r.owner_id,
        owner_name: userMap[r.owner_id] || 'Unknown',
        players: r.players || [],
        starters: r.starters || [],
      }));

      const myRoster = enrichedRosters.find(r => r.owner_id === sleeperUserId);

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
