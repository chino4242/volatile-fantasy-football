import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

// GET — fetch user settings (fleaflicker cookie)
export async function GET(request: NextRequest) {
    const userId = request.headers.get('x-user-id') || request.nextUrl.searchParams.get('user_id');
    if (!userId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

    const result = await db.execute(sql`SELECT fleaflicker_cookie FROM user_settings WHERE user_id = ${userId}`);
    const row = (result as any[])[0];
    return NextResponse.json({ fleaflicker_cookie: row?.fleaflicker_cookie || null });
}

// POST — save user settings
export async function POST(request: NextRequest) {
    const userId = request.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'x-user-id header required' }, { status: 400 });

    const body = await request.json();
    const { fleaflicker_cookie } = body;

    await db.execute(sql`
        INSERT INTO user_settings (user_id, fleaflicker_cookie, updated_at)
        VALUES (${userId}, ${fleaflicker_cookie}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET fleaflicker_cookie = ${fleaflicker_cookie}, updated_at = NOW()
    `);

    return NextResponse.json({ success: true });
}
