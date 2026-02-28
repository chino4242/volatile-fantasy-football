import { cache } from '@/lib/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leagueId, platform } = body;

    if (!leagueId || !platform) {
      return NextResponse.json(
        { error: 'Missing leagueId or platform' },
        { status: 400 }
      );
    }

    // Clear cache for specific league
    if (platform === 'sleeper') {
      cache.clear(`sleeper:users:${leagueId}`);
      cache.clear(`sleeper:rosters:${leagueId}`);
      cache.clear(`sleeper:picks:${leagueId}`);
    } else if (platform === 'fleaflicker') {
      cache.clear(`fleaflicker:league:${leagueId}`);
      cache.clear(`fleaflicker:picks:${leagueId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
