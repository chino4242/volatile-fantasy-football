import { NextRequest, NextResponse } from 'next/server';
import { getFleaflickerTrades } from '@/lib/fleaflicker';

export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio/pending-trades?platform=fleaflicker&leagueId=&myTeamId=
 *
 * Returns normalized pending/incoming trade offers for the Action Center's
 * "Trades to review" group. Fleaflicker is the only platform that exposes open
 * offers today; others return []. `myTeamId` (the portfolio rosterId, = FF team
 * id as a string) identifies which side of each trade is mine so the headline
 * reads "you get … ↔ give …".
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const leagueId = searchParams.get('leagueId');
    const myTeamId = searchParams.get('myTeamId');

    if (platform !== 'fleaflicker' || !leagueId) {
        return NextResponse.json({ trades: [] });
    }

    try {
        const open = await getFleaflickerTrades(leagueId, 'TRADES_OWNER_OPEN');
        const trades = open.map(t => {
            const mine = myTeamId ? t.teams.find(tt => String(tt.teamId) === String(myTeamId)) : undefined;
            const other = t.teams.find(tt => tt !== mine);
            // "Obtained" is what each side receives. I get what MY side obtains.
            const iGet = (mine?.playersObtained ?? []).map(p => p.name).filter(Boolean);
            const iGive = (other?.playersObtained ?? []).map(p => p.name).filter(Boolean);
            const headline = iGet.length || iGive.length
                ? `You get ${iGet.join(', ') || '—'} ↔ give ${iGive.join(', ') || '—'}`
                : `Open trade with ${other?.teamName ?? 'a rival'}`;
            return {
                id: String(t.id),
                headline,
                detail: other?.teamName ? `with ${other.teamName}` : undefined,
            };
        });
        return NextResponse.json({ trades });
    } catch (err) {
        console.error('[pending-trades] error', err);
        return NextResponse.json({ trades: [] });
    }
}
