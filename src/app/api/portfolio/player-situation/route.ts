import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, playerTransactions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import type { PortfolioLeague, PortfolioPlayer } from "@/lib/portfolio";
import { proposeAcquire, proposeShed, type TradePlayer, type TargetedTradeResult } from "@/lib/targeted-trade";

export const dynamic = "force-dynamic";

/**
 * POST /api/portfolio/player-situation
 * Body: { sleeper_id, tag?: 'buy'|'sell', refs: [{ platform, leagueId, leagueName?, format?, type?, myRosterId? }] }
 *
 * Cross-league breakdown for ONE player: the analyst writeup + per-league status
 * (on my roster / on an opponent / available), and — for opponent/mine cases — a
 * targeted 1-for-1 trade proposal with verdict + pitch. BUY tags emphasize
 * acquiring; SELL tags emphasize shedding (trade-first, drop fallback).
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const sleeperId: string = body?.sleeper_id;
        const tag: 'buy' | 'sell' | undefined = body?.tag;
        const refs: Array<{ platform: string; leagueId: string; leagueName?: string; format?: string; type?: string; myRosterId?: string | null }> = body?.refs || [];
        if (!sleeperId) return NextResponse.json({ error: "Missing sleeper_id" }, { status: 400 });

        // Player meta + latest analyst writeup.
        const [meta] = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name, position: players.position, team: players.team, age: players.age })
            .from(players).where(eq(players.sleeper_id, sleeperId));
        const writeups = await db.select({ note: playerTransactions.note, action: playerTransactions.action, week: playerTransactions.week })
            .from(playerTransactions).where(eq(playerTransactions.sleeper_id, sleeperId)).orderBy(desc(playerTransactions.week));
        const writeup = writeups.find(w => w.note)?.note || null;

        const origin = new URL(request.url).origin;

        const perLeague = await Promise.all(refs.map(async (ref) => {
            const label = ref.leagueName || `${ref.platform} ${ref.leagueId}`;
            try {
                const qs = new URLSearchParams({ platform: ref.platform, leagueId: ref.leagueId, format: ref.format || '1qb', type: ref.type || 'dynasty' });
                if (ref.leagueName) qs.set('name', ref.leagueName);
                const res = await fetch(`${origin}/api/portfolio/league?${qs.toString()}`, { cache: 'no-store' });
                if (!res.ok) return { league: label, platform: ref.platform, status: 'error' as const };
                const league: PortfolioLeague = (await res.json()).league;
                return analyzeLeague(league, ref, sleeperId, tag, label);
            } catch {
                return { league: label, platform: ref.platform, status: 'error' as const };
            }
        }));

        return NextResponse.json({
            player: meta || { sleeper_id: sleeperId, full_name: sleeperId, position: null, team: null, age: null },
            tag: tag ?? null,
            writeup,
            perLeague,
        });
    } catch (err) {
        console.error("[player-situation] error", err);
        return NextResponse.json({ error: "Failed to build player situation" }, { status: 500 });
    }
}

type LeagueStatus = 'mine' | 'opponent' | 'available' | 'not-in-league' | 'error';

function toTradePlayer(p: PortfolioPlayer): TradePlayer {
    return {
        sleeper_id: p.sleeper_id, full_name: p.full_name, position: p.position,
        marketValue: p.marketValue, auctionValue: null, age: p.age,
        myRank: p.myRank, marketRank: p.marketRank,
    };
}

function analyzeLeague(
    league: PortfolioLeague,
    ref: { myRosterId?: string | null },
    sleeperId: string,
    tag: 'buy' | 'sell' | undefined,
    label: string,
) {
    const myTeam = ref.myRosterId ? league.teams.find(t => t.rosterId === String(ref.myRosterId)) : undefined;
    const owningTeam = league.teams.find(t => t.players.some(p => p.sleeper_id === sleeperId));
    const isFreeAgent = !owningTeam && league.freeAgents.some(p => p.sleeper_id === sleeperId);

    const base = { league: label, platform: league.platform, leagueName: league.name, myTeamKnown: !!myTeam };

    // Available → highlight to add (for buys especially).
    if (isFreeAgent) {
        return { ...base, status: 'available' as LeagueStatus };
    }
    if (!owningTeam) {
        return { ...base, status: 'not-in-league' as LeagueStatus };
    }

    // On MY roster.
    if (myTeam && owningTeam.rosterId === myTeam.rosterId) {
        let trade: TargetedTradeResult | null = null;
        if (tag === 'sell') {
            // Trade-first: try to shed to the best opponent (pick the opponent
            // with the strongest fit). Try each opponent, keep the best verdict.
            trade = bestShed(myTeam, league, sleeperId);
        }
        return { ...base, status: 'mine' as LeagueStatus, ownerName: myTeam.ownerName, trade };
    }

    // On an OPPONENT's roster.
    let trade: TargetedTradeResult | null = null;
    if (myTeam && tag !== 'sell') {
        const target = owningTeam.players.find(p => p.sleeper_id === sleeperId)!;
        trade = proposeAcquire(toTradePlayer(target), myTeam.players.map(toTradePlayer), owningTeam.players.map(toTradePlayer));
    }
    return { ...base, status: 'opponent' as LeagueStatus, ownerName: owningTeam.ownerName, trade };
}

/** Try shedding `mine` to each opponent; return the best-verdict proposal. */
function bestShed(myTeam: PortfolioLeague['teams'][number], league: PortfolioLeague, sleeperId: string): TargetedTradeResult | null {
    const mine = myTeam.players.find(p => p.sleeper_id === sleeperId);
    if (!mine) return null;
    const opponents = league.teams.filter(t => t.rosterId !== myTeam.rosterId);
    let best: TargetedTradeResult | null = null;
    for (const opp of opponents) {
        const r = proposeShed(toTradePlayer(mine), myTeam.players.map(toTradePlayer), opp.players.map(toTradePlayer));
        if (r.proposal && (!best || (r.advisor?.score ?? -999) > (best.advisor?.score ?? -999))) {
            best = { ...r, reason: `${r.reason} (partner: ${opp.ownerName})` };
        }
    }
    return best;
}
