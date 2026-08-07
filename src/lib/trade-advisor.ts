/**
 * Rule-based trade advisor — provides roster-aware trade recommendations.
 * Analyzes positional depth, value fairness, age, auction impact, and signals.
 */

export interface TradeAdvisorInput {
    myRoster: { position: string; dynastyValue: number; auctionValue: number; age?: number | null }[];
    sending: { position: string; dynastyValue: number; auctionValue: number; age?: number | null; name: string; signal?: string | null }[];
    receiving: { position: string; dynastyValue: number; auctionValue: number; age?: number | null; name: string; signal?: string | null }[];
    sendingPickValue: number;
    receivingPickValue: number;
}

export interface TradeAdvisorResult {
    verdict: 'strong-accept' | 'accept' | 'even' | 'decline' | 'strong-decline';
    summary: string;
    reasons: string[];
    pitch: string; // why it makes sense for both sides (for negotiation)
    score: number; // -100 to +100
}

export function analyzeTradeAdvisor(input: TradeAdvisorInput): TradeAdvisorResult {
    const { myRoster, sending, receiving, sendingPickValue, receivingPickValue } = input;
    const reasons: string[] = [];
    let score = 0;

    // --- 1. Position depth analysis ---
    const posCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    myRoster.forEach(p => { if (p.position in posCounts) posCounts[p.position]++; });

    const idealMinimums: Record<string, number> = { QB: 1, RB: 3, WR: 4, TE: 1 };
    const surplusThresholds: Record<string, number> = { QB: 2, RB: 5, WR: 6, TE: 2 };

    // What positions are you sending vs receiving?
    const sendPositions: Record<string, number> = {};
    sending.forEach(p => { sendPositions[p.position] = (sendPositions[p.position] || 0) + 1; });
    const receivePositions: Record<string, number> = {};
    receiving.forEach(p => { receivePositions[p.position] = (receivePositions[p.position] || 0) + 1; });

    // Check: trading FROM surplus?
    Object.entries(sendPositions).forEach(([pos, count]) => {
        const current = posCounts[pos] || 0;
        if (current > surplusThresholds[pos]) {
            score += 15;
            reasons.push(`Trading from ${pos} surplus (have ${current})`);
        } else if (current - count < idealMinimums[pos]) {
            score -= 20;
            reasons.push(`⚠️ Leaves you thin at ${pos} (${current} → ${current - count})`);
        }
    });

    // Check: receiving INTO need?
    Object.entries(receivePositions).forEach(([pos, count]) => {
        const current = posCounts[pos] || 0;
        if (current < idealMinimums[pos]) {
            score += 20;
            reasons.push(`Fills ${pos} need (have ${current}, need ${idealMinimums[pos]}+)`);
        } else if (current < surplusThresholds[pos]) {
            score += 8;
            reasons.push(`Adds ${pos} depth (${current} → ${current + count})`);
        }
    });

    // --- 2. Value fairness ---
    const sendValue = sending.reduce((s, p) => s + p.dynastyValue, 0) + sendingPickValue;
    const receiveValue = receiving.reduce((s, p) => s + p.dynastyValue, 0) + receivingPickValue;
    const valueDiff = receiveValue - sendValue;
    const valuePct = sendValue > 0 ? (valueDiff / sendValue) * 100 : 0;

    if (valuePct > 15) {
        score += 20;
        reasons.push(`Great value — getting ${Math.round(valuePct)}% more back`);
    } else if (valuePct > 5) {
        score += 10;
        reasons.push(`Fair value — slight edge (+${Math.round(valuePct)}%)`);
    } else if (valuePct >= -5) {
        reasons.push('Value is even');
    } else if (valuePct >= -15) {
        score -= 10;
        reasons.push(`Slight overpay (${Math.round(valuePct)}%)`);
    } else {
        score -= 20;
        reasons.push(`Significant overpay (${Math.round(valuePct)}%)`);
    }

    // --- 3. Auction / win-now impact ---
    const sendAuction = sending.reduce((s, p) => s + p.auctionValue, 0);
    const receiveAuction = receiving.reduce((s, p) => s + p.auctionValue, 0);
    const auctionDiff = receiveAuction - sendAuction;

    if (auctionDiff > 10) {
        score += 10;
        reasons.push(`Win-now boost: +$${auctionDiff} auction value`);
    } else if (auctionDiff < -10) {
        score -= 5;
        reasons.push(`Redraft downgrade: -$${Math.abs(auctionDiff)} auction`);
    }

    // --- 4. Age / trajectory ---
    const avgSendAge = sending.filter(p => p.age).length > 0
        ? sending.filter(p => p.age).reduce((s, p) => s + (p.age || 0), 0) / sending.filter(p => p.age).length
        : 0;
    const avgReceiveAge = receiving.filter(p => p.age).length > 0
        ? receiving.filter(p => p.age).reduce((s, p) => s + (p.age || 0), 0) / receiving.filter(p => p.age).length
        : 0;

    if (avgSendAge > 0 && avgReceiveAge > 0) {
        const ageDiff = avgSendAge - avgReceiveAge;
        if (ageDiff > 3) {
            score += 8;
            reasons.push(`Getting younger (avg ${Math.round(avgReceiveAge)} vs sending ${Math.round(avgSendAge)})`);
        } else if (ageDiff < -3) {
            score -= 5;
            reasons.push(`Getting older (avg ${Math.round(avgReceiveAge)} vs sending ${Math.round(avgSendAge)})`);
        }
    }

    // --- 5. Signal check (RP / custom rankings) ---
    const sendSignals = sending.filter(p => p.signal);
    const receiveSignals = receiving.filter(p => p.signal);

    sendSignals.forEach(p => {
        if (p.signal === 'Super Buy' || p.signal === 'Buy') {
            score -= 8;
            reasons.push(`Selling ${p.name} who is a "${p.signal}" per film rankings`);
        } else if (p.signal === 'Sell' || p.signal === 'Super Sell') {
            score += 8;
            reasons.push(`Good time to sell ${p.name} ("${p.signal}" signal)`);
        }
    });

    receiveSignals.forEach(p => {
        if (p.signal === 'Super Buy' || p.signal === 'Buy') {
            score += 8;
            reasons.push(`Acquiring ${p.name} — film says "${p.signal}"`);
        } else if (p.signal === 'Sell' || p.signal === 'Super Sell') {
            score -= 5;
            reasons.push(`${p.name} has a "${p.signal}" signal — declining asset`);
        }
    });

    // --- Compute verdict ---
    const clampedScore = Math.max(-100, Math.min(100, score));
    let verdict: TradeAdvisorResult['verdict'];
    if (clampedScore >= 30) verdict = 'strong-accept';
    else if (clampedScore >= 10) verdict = 'accept';
    else if (clampedScore >= -10) verdict = 'even';
    else if (clampedScore >= -30) verdict = 'decline';
    else verdict = 'strong-decline';

    // --- Build summary ---
    let summary: string;
    if (verdict === 'strong-accept') {
        summary = 'Strong accept — this trade addresses a clear need at fair-or-better value.';
    } else if (verdict === 'accept') {
        summary = 'Lean accept — the trade makes roster sense and value is reasonable.';
    } else if (verdict === 'even') {
        summary = 'Coin flip — value is fair but no clear roster improvement either way.';
    } else if (verdict === 'decline') {
        summary = 'Lean decline — either the value is off or it doesn\'t improve your roster construction.';
    } else {
        summary = 'Strong decline — bad value, bad roster fit, or both.';
    }

    return { verdict, summary, reasons, pitch: buildPitch(input, sendValue, receiveValue), score: clampedScore };
}

function buildPitch(input: TradeAdvisorInput, sendValue: number, receiveValue: number): string {
    const { sending, receiving, sendingPickValue, receivingPickValue } = input;
    
    const parts: string[] = [];

    // Determine team windows based on age profiles
    const avgSendAge = sending.filter(p => p.age).reduce((s, p) => s + (p.age || 0), 0) / (sending.filter(p => p.age).length || 1);
    const avgReceiveAge = receiving.filter(p => p.age).reduce((s, p) => s + (p.age || 0), 0) / (receiving.filter(p => p.age).length || 1);

    // What THEY get (your sends) — frame as benefit to them
    if (sending.length === 1) {
        const p = sending[0];
        if (p.age && p.age <= 25) {
            // Young player — pitch rebuild value
            parts.push(`You get ${p.name} — a ${p.age}-year-old ${p.position} with years of production ahead. Perfect for a rebuild or sustained contention window`);
        } else if (p.auctionValue >= 20) {
            parts.push(`You get ${p.name} — a proven ${p.position} producing $${p.auctionValue} in redraft. Immediate impact for a win-now push`);
        } else if (p.dynastyValue >= 3000) {
            parts.push(`You get ${p.name} — a top-tier dynasty ${p.position} (${p.dynastyValue.toLocaleString()} value)`);
        } else {
            parts.push(`You get ${p.name} (${p.position}) — upside asset with room to grow`);
        }
    } else if (sending.length > 1) {
        const youngSends = sending.filter(p => p.age && p.age <= 25);
        const prodSends = sending.filter(p => p.auctionValue >= 15);
        if (youngSends.length > 0) {
            parts.push(`You get young pieces (${youngSends.map(p => p.name).join(', ')}) — dynasty building blocks`);
        } else if (prodSends.length > 0) {
            parts.push(`You get proven producers (${prodSends.map(p => p.name).join(', ')}) for your win-now window`);
        } else {
            parts.push(`You get ${sending.map(p => p.name).join(' + ')}`);
        }
    }

    if (sendingPickValue > 0) {
        parts.push('Plus draft capital to build around — flexibility to target your specific needs');
    }

    // What YOU get — frame the mutual benefit
    if (receiving.length === 1) {
        const p = receiving[0];
        if (p.age && p.age >= 28 && p.auctionValue >= 20) {
            // Older productive player — frame as them selling high on a declining asset
            parts.push(`${p.name} is in his prime window now — better fit for a team pushing for a championship this year`);
        } else if (p.age && p.age <= 25) {
            parts.push(`I\'m betting on ${p.name}\'s long-term upside — fits my timeline`);
        }
    }

    // Window-based framing
    if (avgSendAge > 0 && avgReceiveAge > 0) {
        if (avgSendAge < avgReceiveAge - 2) {
            // You're sending young, getting old = you're win-now, they're rebuilding
            parts.push('This works for both windows — you get the young asset for your rebuild, I get the proven production for my championship push');
        } else if (avgReceiveAge < avgSendAge - 2) {
            // You're getting young, sending old = you're rebuilding, they're win-now
            parts.push('You get the immediate production you need for your window, I\'m investing in youth for the long run');
        }
    }

    // Pick-based framing
    if (receivingPickValue > 0 && sendingPickValue === 0) {
        parts.push('You consolidate value into a proven player instead of waiting on a draft pick to develop');
    } else if (sendingPickValue > 0 && receivingPickValue === 0) {
        parts.push('You get draft flexibility to target exactly who fits your roster');
    }

    // Position-based mutual benefit
    const sendPos = [...new Set(sending.map(p => p.position).filter(Boolean))][0];
    const receivePos = [...new Set(receiving.map(p => p.position).filter(Boolean))][0];
    if (sendPos && receivePos && sendPos !== receivePos) {
        parts.push(`Straightforward positional swap — I have ${sendPos} depth to spare, you have ${receivePos} depth to spare`);
    }

    return parts.length > 0 ? parts.join('. ') + '.' : 'Fair deal for both sides based on current values.';
}
