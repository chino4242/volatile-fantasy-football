import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userLeagues } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ leagues: [] });

  const leagues = await db.select({
    id: userLeagues.id,
    league_name: userLeagues.league_name,
    platform: userLeagues.platform,
    scoring_format: userLeagues.scoring_format,
  }).from(userLeagues).where(eq(userLeagues.user_id, user.id));

  return NextResponse.json({ leagues });
}
