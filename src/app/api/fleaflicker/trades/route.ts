import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy endpoint for authenticated Fleaflicker trade requests.
 * The client passes the Fleaflicker session cookie which we forward to the API.
 * 
 * GET /api/fleaflicker/trades?league_id=197269&filter=TRADES_OWNER_OPEN
 * Header: x-ff-cookie: <session cookie value from Fleaflicker>
 */
export async function GET(request: NextRequest) {
    const leagueId = request.nextUrl.searchParams.get('league_id');
    const filter = request.nextUrl.searchParams.get('filter') || 'TRADES_OWNER_OPEN';
    const ffCookie = request.headers.get('x-ff-cookie');

    if (!leagueId) {
        return NextResponse.json({ error: 'league_id required' }, { status: 400 });
    }
    if (!ffCookie) {
        return NextResponse.json({ error: 'x-ff-cookie header required (Fleaflicker session cookie)' }, { status: 401 });
    }

    try {
        const url = `https://www.fleaflicker.com/api/FetchTrades?sport=NFL&league_id=${leagueId}&filter=${filter}`;
        // Ensure cookie is formatted correctly (cookieId=value)
        const cookieHeader = ffCookie.includes('=') ? ffCookie : `cookieId=${ffCookie}`;
        const res = await fetch(url, {
            headers: {
                'Cookie': cookieHeader,
                'Accept': 'application/json',
            },
            cache: 'no-store',
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Fleaflicker returned ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Fleaflicker trades proxy error:', error);
        return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }
}
