import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userSignals, players } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ signals: [] });

  const results = await db.select({
    sleeper_id: userSignals.sleeper_id,
    signal: userSignals.signal,
    delta: userSignals.delta,
    owner_name: userSignals.owner_name,
    name: players.full_name,
    position: players.position,
  }).from(userSignals)
    .leftJoin(players, eq(userSignals.sleeper_id, players.sleeper_id))
    .where(eq(userSignals.user_id, user.id))
    .orderBy(userSignals.delta);

  return NextResponse.json({ signals: results });
}
