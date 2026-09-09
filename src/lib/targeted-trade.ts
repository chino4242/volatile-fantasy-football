/**
 * Targeted 1-for-1 trade generator — "build a fair deal centered on ONE player."
 *
 * Unlike TradeFinderCard.findTrades (team-surplus-driven, proposes arbitrary
 * swaps), this is driven by a specific target: acquire a player from an
 * opponent, or shed one of my players to an opponent. It picks the best single
 * counter-asset from the relevant roster whose MARKET value (fc_value) is closest
 * to the target within a fairness tolerance, preferring to trade from my surplus
 * into a position the other team needs, then runs analyzeTradeAdvisor for the
 * verdict + both-sides pitch + reasons.
 *
 * v1 is 1-for-1 and judges fairness by MARKET value (what the opponent will
 * accept). Rest-of-season value is NOT yet factored (data not wired) — noted in
 * the result so the UI can be honest. Multi-player packages are a future step.
 */

import { analyzeTradeAdvisor, type TradeAdvisorResult } from './trade-advisor';

export interface TradePlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    /** Market dynasty value (format-resolved fc_value; higher = better). */
    marketValue: number | null;
    /** Win-now auction value, if known (redraft_auction_value). */
    auctionValue?: number | null;
    age?: number | null;
    /** My board rank (lower = better), for the "good for me" edge note. */
    myRank?: number | null;
    marketRank?: number | null;
}

export interface TargetedTradeResult {
    /** null when no fair 1-for-1 exists (see reason). */
    proposal: {
        /** From my roster → to them. */
        iSend: TradePlayer;
        /** The target (or my sell) → the other direction. */
        iReceive: TradePlayer;
    } | null;
    advisor: TradeAdvisorResult | null;
    /** Market value gap of the proposal, % relative to the target. */
    valueGapPct: number | null;
    /** Human explanation, esp. when proposal is null. */
    reason: string;
    /** True if RoS was considered (always false for now — data not wired). */
    rosConsidered: boolean;
}

const IDEAL_MIN: Record<string, number> = { QB: 1, RB: 3, WR: 4, TE: 1 };

/** Rough positional surplus/need for a roster (by count vs ideal minimum). */
function positionCounts(players: TradePlayer[]): Record<string, number> {
    const c: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of players) if (p.position && p.position in c) c[p.position]++;
    return c;
}

/**
 * Build a trade to ACQUIRE `target` (currently on the opponent's roster) using
 * one player from `myRoster`.
 */
export function proposeAcquire(
    target: TradePlayer,
    myRoster: TradePlayer[],
    opponentRoster: TradePlayer[],
    tolerancePct = 0.15,
): TargetedTradeResult {
    const tv = target.marketValue || 0;
    if (tv <= 0) {
        return { proposal: null, advisor: null, valueGapPct: null, rosConsidered: false,
            reason: 'No market value for the target, so a fair value cannot be computed.' };
    }

    const myCounts = positionCounts(myRoster);
    const oppCounts = positionCounts(opponentRoster);

    // Candidate assets I could send: skill players with a value, not the target.
    const candidates = myRoster
        .filter(p => (p.marketValue || 0) > 0 && p.sleeper_id !== target.sleeper_id)
        .map(p => {
            const gap = Math.abs((p.marketValue || 0) - tv) / tv;
            // Prefer: within tolerance; trading from my surplus; into their need.
            const fromSurplus = p.position ? myCounts[p.position] > (IDEAL_MIN[p.position] ?? 99) : false;
            const theirNeed = p.position ? oppCounts[p.position] < (IDEAL_MIN[p.position] ?? 0) : false;
            const fitBonus = (fromSurplus ? 1 : 0) + (theirNeed ? 1 : 0);
            return { p, gap, fitBonus };
        })
        // closest value first, then better positional fit
        .sort((a, b) => (a.gap - b.gap) || (b.fitBonus - a.fitBonus));

    const best = candidates.find(c => c.gap <= tolerancePct) || candidates[0];
    if (!best) {
        return { proposal: null, advisor: null, valueGapPct: null, rosConsidered: false,
            reason: 'You have no tradeable asset with market value to offer here.' };
    }

    if (best.gap > tolerancePct) {
        // Closest single player is outside fairness → a 1-for-1 won't be fair.
        const dir = (best.p.marketValue || 0) > tv ? 'overpay' : 'underpay';
        return {
            proposal: null, advisor: null, valueGapPct: Math.round(best.gap * 100), rosConsidered: false,
            reason: `No fair 1-for-1: your closest asset (${best.p.full_name}) is a ${Math.round(best.gap * 100)}% ${dir} vs ${target.full_name}. A multi-player package would be needed.`,
        };
    }

    const advisor = analyzeTradeAdvisor({
        myRoster: myRoster.map(toAdvisorRosterPlayer),
        sending: [toAdvisorNamedPlayer(best.p)],
        receiving: [toAdvisorNamedPlayer(target)],
        sendingPickValue: 0,
        receivingPickValue: 0,
    });

    const gapPct = Math.round((((target.marketValue || 0) - (best.p.marketValue || 0)) / tv) * 100);
    return {
        proposal: { iSend: best.p, iReceive: target },
        advisor,
        valueGapPct: gapPct,
        rosConsidered: false,
        reason: describeFairness(best.p, target, best.fitBonus),
    };
}

/**
 * Build a trade to SHED `mine` (a sell-tagged player on my roster) to an
 * opponent, receiving one fair asset back.
 */
export function proposeShed(
    mine: TradePlayer,
    myRoster: TradePlayer[],
    opponentRoster: TradePlayer[],
    tolerancePct = 0.15,
): TargetedTradeResult {
    const mv = mine.marketValue || 0;
    if (mv <= 0) {
        return { proposal: null, advisor: null, valueGapPct: null, rosConsidered: false,
            reason: 'No market value for this player, so no fair trade can be computed — a drop is the likely move.' };
    }

    const myCounts = positionCounts(myRoster);
    const oppCounts = positionCounts(opponentRoster);

    // What could I get back? An opponent asset close in value, ideally at a
    // position I NEED and they can spare.
    const candidates = opponentRoster
        .filter(p => (p.marketValue || 0) > 0)
        .map(p => {
            const gap = Math.abs((p.marketValue || 0) - mv) / mv;
            const myNeed = p.position ? myCounts[p.position] < (IDEAL_MIN[p.position] ?? 0) : false;
            const theirSurplus = p.position ? oppCounts[p.position] > (IDEAL_MIN[p.position] ?? 99) : false;
            const fitBonus = (myNeed ? 1 : 0) + (theirSurplus ? 1 : 0);
            return { p, gap, fitBonus };
        })
        .sort((a, b) => (a.gap - b.gap) || (b.fitBonus - a.fitBonus));

    const best = candidates.find(c => c.gap <= tolerancePct) || candidates[0];
    if (!best || best.gap > tolerancePct) {
        return {
            proposal: null, advisor: null, valueGapPct: best ? Math.round(best.gap * 100) : null, rosConsidered: false,
            reason: `No fair 1-for-1 return from this opponent for ${mine.full_name}. Consider a package, another partner, or a drop if he's low value.`,
        };
    }

    const advisor = analyzeTradeAdvisor({
        myRoster: myRoster.map(toAdvisorRosterPlayer),
        sending: [toAdvisorNamedPlayer(mine)],
        receiving: [toAdvisorNamedPlayer(best.p)],
        sendingPickValue: 0,
        receivingPickValue: 0,
    });

    const gapPct = Math.round((((best.p.marketValue || 0) - mv) / mv) * 100);
    return {
        proposal: { iSend: mine, iReceive: best.p },
        advisor,
        valueGapPct: gapPct,
        rosConsidered: false,
        reason: describeFairness(mine, best.p, best.fitBonus),
    };
}

function describeFairness(sending: TradePlayer, receiving: TradePlayer, fitBonus: number): string {
    const parts: string[] = ['Roughly even market value.'];
    if (fitBonus >= 2) parts.push('Strong positional fit for both sides (your surplus ↔ their need).');
    else if (fitBonus === 1) parts.push('Reasonable positional fit.');
    // Dual-value edge: does MY board rate the incoming player higher than market?
    if (receiving.myRank != null && receiving.marketRank != null && receiving.myRank < receiving.marketRank) {
        parts.push(`Your board rates ${receiving.full_name} higher than the market (#${receiving.myRank} vs mkt #${receiving.marketRank}) — a win for you.`);
    }
    return parts.join(' ');
}

function toAdvisorRosterPlayer(p: TradePlayer) {
    return { position: p.position || 'UNK', dynastyValue: p.marketValue || 0, auctionValue: p.auctionValue || 0, age: p.age ?? null };
}
function toAdvisorNamedPlayer(p: TradePlayer) {
    return { position: p.position || 'UNK', dynastyValue: p.marketValue || 0, auctionValue: p.auctionValue || 0, age: p.age ?? null, name: p.full_name, signal: null };
}
