import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { userSources } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text, name } = await request.json();
  if (!text?.trim()) return NextResponse.json({ error: 'Text required' }, { status: 400 });

  try {
    // 1. Save the source
    const [source] = await db.insert(userSources).values({
      user_id: user.id,
      type: 'text',
      name: name || `Paste ${new Date().toLocaleDateString()}`,
      raw_content: text,
      status: 'processing',
    }).returning();

    // 2. Send to Claude for extraction
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Extract player rankings from this fantasy football content. Return ONLY valid JSON array.

Each entry: {"name": "Player Name", "rank": 1, "position": "WR", "tier": 1, "notes": "optional"}

Rules:
- Use full player names exactly as written
- If no explicit rank, infer from order (first = 1, second = 2, etc.)
- If tiers are present, capture tier number
- position must be one of: QB, RB, WR, TE
- Omit entries you cannot identify as NFL players
- If the text has position groups, set rank as position rank within that group

Content to parse:
${text}`
        }],
      }),
    });

    if (!response.ok) {
      await db.update(userSources).set({ status: 'failed' }).where(eq(userSources.id, source.id));
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 });
    }

    const aiResult = await response.json();
    const aiText = aiResult.content?.[0]?.text || '';
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    // 3. Update source with player count
    await db.update(userSources).set({
      status: 'matched',
      player_count: extracted.length,
    }).where(eq(userSources.id, source.id));

    return NextResponse.json({
      success: true,
      source_id: source.id,
      extracted,
      count: extracted.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
