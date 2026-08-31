'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ArrowRightLeft } from 'lucide-react';
import type { BasePlayer } from '@/types/player';

type Player = BasePlayer;

interface TradeSuggestionsProps {
    myPlayers: Player[];
    allLeaguePlayers: Player[];
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
    scoringFormat: '1qb' | 'sf';
}

interface PositionalProfile {
    QB: number; RB: number; WR: number; TE: number;
    total: number;
}

interface TradePartner {
    rosterId: number;
    name: string;
    profile: PositionalProfile;
    complementScore: number; // how well they complement you
    theyNeed: string[];     // positions they're weak at (that you're strong at)
    theyHave: string[];     // positions they're strong at (that you're weak at)
}

interface SuggestedTrade {
    partner: TradePartner;
    send: Player[];
    receive: Player[];
    dynastyDelta: number;       // positive = you gain dynasty value
    auctionDelta: number;       // positive = you gain auction value
    fairnessGap: number;        // absolute % gap from even (0 = perfectly fair)
    reason: string;
    partnerReason: string;
    complexity: 1 | 2;          // 1-for-1 or 2-for-2
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TradeSuggestions({
    myPlayers, allLeaguePlayers, playerOwnershipMap, rosterToOwnerMap, currentRosterId, scoringFormat,
}: TradeSuggestionsProps) {
    const [open, setOpen] = useState(false);
    const [fairnessThreshold, setFairnessThreshold] = useState(15); // % allowed gap
    const [showCount, setShowCount] = useState(8);

    const sf = scoringFormat === 'sf';

    // ── Helpers ────────────────────────────────────────────────────────────────
    const getVal = (p: Player) => (sf ? (p.fc_value_sf ?? p.fc_value) : (p.fc_value_1qb ?? p.fc_value)) || 0;
    const getAuction = (p: Player) => p.redraft_auction_value || 0;

    // ── Positional Profiles ────────────────────────────────────────────────────
    const buildProfile = (playerList: Player[]): PositionalProfile => {
        const profile: PositionalProfile = { QB: 0, RB: 0, WR: 0, TE: 0, total: 0 };
        for (const p of playerList) {
            const val = getVal(p);
            const pos = p.position as keyof Omit<PositionalProfile, 'total'>;
            if (pos in profile) profile[pos] += val;
            profile.total += val;
        }
        return profile;
    };

    // ── Team Data ──────────────────────────────────────────────────────────────
    const { myProfile, leagueAvg, teams } = useMemo(() => {
        const myProfile = buildProfile(myPlayers);

        // Build all teams
        const teamMap = new Map<number, Player[]>();
        for (const p of allLeaguePlayers) {
            const owner = playerOwnershipMap.get(p.sleeper_id);
            if (owner == null) continue;
            if (!teamMap.has(owner)) teamMap.set(owner, []);
            teamMap.get(owner)!.push(p);
        }

        // League averages
        const teamProfiles: PositionalProfile[] = [];
        const teams: { rosterId: number; name: string; players: Player[]; profile: PositionalProfile }[] = [];
        teamMap.forEach((players, rosterId) => {
            const profile = buildProfile(players);
            teamProfiles.push(profile);
            teams.push({ rosterId, name: rosterToOwnerMap.get(rosterId) || 'Unknown', players, profile });
        });

        const n = teamProfiles.length || 1;
        const leagueAvg: PositionalProfile = {
            QB: teamProfiles.reduce((s, p) => s + p.QB, 0) / n,
            RB: teamProfiles.reduce((s, p) => s + p.RB, 0) / n,
            WR: teamProfiles.reduce((s, p) => s + p.WR, 0) / n,
            TE: teamProfiles.reduce((s, p) => s + p.TE, 0) / n,
            total: teamProfiles.reduce((s, p) => s + p.total, 0) / n,
        };

        return { myProfile, leagueAvg, teams };
    }, [myPlayers, allLeaguePlayers, playerOwnershipMap, rosterToOwnerMap, sf]);

    // ── Strengths/Weaknesses ───────────────────────────────────────────────────
    const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
    const getStrengthScore = (profile: PositionalProfile, pos: typeof POSITIONS[number]) => {
        const avg = leagueAvg[pos];
        if (avg === 0) return 0;
        return (profile[pos] - avg) / avg; // positive = strong, negative = weak
    };

    const myStrengths = POSITIONS.filter(p => getStrengthScore(myProfile, p) > 0.15);
    const myWeaknesses = POSITIONS.filter(p => getStrengthScore(myProfile, p) < -0.15);

    // ── Find Trade Partners ────────────────────────────────────────────────────
    const tradePartners = useMemo((): TradePartner[] => {
        return teams
            .filter(t => t.rosterId !== currentRosterId)
            .map(t => {
                // What they need = positions where they're below average AND you're above average
                const theyNeed = POSITIONS.filter(pos =>
                    getStrengthScore(t.profile, pos) < -0.10 && getStrengthScore(myProfile, pos) > 0.10
                );
                // What they have = positions where they're above average AND you're below average
                const theyHave = POSITIONS.filter(pos =>
                    getStrengthScore(t.profile, pos) > 0.10 && getStrengthScore(myProfile, pos) < -0.10
                );
                // Complement score = how many position matchups align (higher = better partner)
                const complementScore = theyNeed.length + theyHave.length;
                return { rosterId: t.rosterId, name: t.name, profile: t.profile, complementScore, theyNeed, theyHave };
            })
            .filter(p => p.complementScore >= 2) // at least one position each way
            .sort((a, b) => b.complementScore - a.complementScore);
    }, [teams, currentRosterId, myProfile, leagueAvg]);

    // ── Generate Trade Suggestions ─────────────────────────────────────────────
    const suggestions = useMemo((): SuggestedTrade[] => {
        const results: SuggestedTrade[] = [];

        for (const partner of tradePartners) {
            const theirPlayers = allLeaguePlayers
                .filter(p => playerOwnershipMap.get(p.sleeper_id) === partner.rosterId)
                .sort((a, b) => getVal(b) - getVal(a));

            // Players I'd send (from my strength positions that they need)
            const sendCandidates = myPlayers
                .filter(p => p.position && partner.theyNeed.includes(p.position))
                .filter(p => getVal(p) > 500) // minimum value threshold
                .sort((a, b) => getVal(b) - getVal(a));

            // Players I'd receive (from their strength positions that I need)
            const receiveCandidates = theirPlayers
                .filter(p => p.position && partner.theyHave.includes(p.position))
                .filter(p => getVal(p) > 500)
                .sort((a, b) => getVal(b) - getVal(a));

            if (sendCandidates.length === 0 || receiveCandidates.length === 0) continue;

            // 1-for-1 trades
            for (const send of sendCandidates.slice(0, 5)) {
                for (const recv of receiveCandidates.slice(0, 5)) {
                    const sendVal = getVal(send);
                    const recvVal = getVal(recv);
                    const mid = (sendVal + recvVal) / 2 || 1;
                    const gap = Math.abs(sendVal - recvVal) / mid * 100;
                    if (gap > fairnessThreshold) continue;

                    // Check auction angle: if dynasty is slightly uneven, does auction compensate?
                    const auctionDelta = getAuction(recv) - getAuction(send);
                    const dynastyDelta = recvVal - sendVal;
                    let reason = '';
                    let partnerReason = '';

                    if (dynastyDelta < -100 && auctionDelta > 3) {
                        reason = `You send more dynasty value but gain $${auctionDelta} auction (win-now upgrade)`;
                    } else if (dynastyDelta > 100) {
                        reason = `You gain ${dynastyDelta.toLocaleString()} dynasty value`;
                    } else {
                        reason = `Fair swap — fills your ${recv.position} need`;
                    }
                    partnerReason = `Fills their ${send.position} need${dynastyDelta < -100 ? ` (+${Math.abs(dynastyDelta).toLocaleString()} dynasty for them)` : ''}`;

                    results.push({ partner, send: [send], receive: [recv], dynastyDelta, auctionDelta, fairnessGap: gap, reason, partnerReason, complexity: 1 });
                }
            }

            // 2-for-2 trades (combine 2 send + 2 receive within fairness)
            if (sendCandidates.length >= 2 && receiveCandidates.length >= 2) {
                for (let i = 0; i < Math.min(sendCandidates.length, 4); i++) {
                    for (let j = i + 1; j < Math.min(sendCandidates.length, 5); j++) {
                        const send1 = sendCandidates[i], send2 = sendCandidates[j];
                        const sendTotal = getVal(send1) + getVal(send2);
                        // Find a pair to receive that's close in total value
                        for (let k = 0; k < Math.min(receiveCandidates.length, 4); k++) {
                            for (let l = k + 1; l < Math.min(receiveCandidates.length, 5); l++) {
                                const recv1 = receiveCandidates[k], recv2 = receiveCandidates[l];
                                const recvTotal = getVal(recv1) + getVal(recv2);
                                const mid = (sendTotal + recvTotal) / 2 || 1;
                                const gap = Math.abs(sendTotal - recvTotal) / mid * 100;
                                if (gap > fairnessThreshold) continue;

                                const dynastyDelta = recvTotal - sendTotal;
                                const auctionDelta = (getAuction(recv1) + getAuction(recv2)) - (getAuction(send1) + getAuction(send2));
                                let reason = '';
                                if (dynastyDelta < -200 && auctionDelta > 5) {
                                    reason = `Package deal: send dynasty surplus, gain $${auctionDelta} auction (win-now)`;
                                } else if (dynastyDelta > 200) {
                                    reason = `Package deal: gain ${dynastyDelta.toLocaleString()} dynasty value`;
                                } else {
                                    reason = `Package deal — balances your ${recv1.position}/${recv2.position} needs`;
                                }
                                const partnerReason = `Fills their ${send1.position}${send1.position !== send2.position ? `/${send2.position}` : ''} need`;

                                results.push({ partner, send: [send1, send2], receive: [recv1, recv2], dynastyDelta, auctionDelta, fairnessGap: gap, reason, partnerReason, complexity: 2 });
                            }
                        }
                    }
                }
            }
        }

        // Sort: 1-for-1 first, then by lowest fairness gap (most fair), then by mutual benefit
        results.sort((a, b) => {
            if (a.complexity !== b.complexity) return a.complexity - b.complexity;
            return a.fairnessGap - b.fairnessGap;
        });

        // Deduplicate: don't show trades that are just reorderings of the same players
        const seen = new Set<string>();
        return results.filter(t => {
            const key = [...t.send.map(p => p.sleeper_id).sort(), '|', ...t.receive.map(p => p.sleeper_id).sort()].join(',');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [tradePartners, allLeaguePlayers, myPlayers, playerOwnershipMap, fairnessThreshold, sf]);

    // ── Render ─────────────────────────────────────────────────────────────────
    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
                <ArrowRightLeft className="w-4 h-4" />
                Trade Suggestions
            </button>
        );
    }

    const posColor = (pos: string | null) =>
        pos === 'QB' ? 'text-green-600' : pos === 'RB' ? 'text-blue-600' : pos === 'WR' ? 'text-red-600' : pos === 'TE' ? 'text-orange-600' : 'text-zinc-500';
    const strengthLabel = (score: number) =>
        score > 0.4 ? 'Very Strong' : score > 0.15 ? 'Strong' : score > -0.15 ? 'Average' : score > -0.4 ? 'Weak' : 'Very Weak';
    const strengthColor = (score: number) =>
        score > 0.15 ? 'text-green-600 dark:text-green-400' : score < -0.15 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setOpen(false)}>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full my-8" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 rounded-t-xl z-10">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-violet-600" />
                                Trade Suggestions
                            </h2>
                            <p className="text-xs text-zinc-500 mt-0.5">
                                {suggestions.length} trades found · {tradePartners.length} complementary partners
                            </p>
                        </div>
                        <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600 text-xl">✕</button>
                    </div>

                    {/* Your profile + fairness slider */}
                    <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                        {/* Positional strengths */}
                        <div className="flex gap-3 text-xs">
                            {POSITIONS.map(pos => {
                                const score = getStrengthScore(myProfile, pos);
                                return (
                                    <div key={pos} className="text-center">
                                        <div className={`font-bold ${posColor(pos)}`}>{pos}</div>
                                        <div className={`font-medium ${strengthColor(score)}`}>{strengthLabel(score)}</div>
                                        <div className="text-[10px] text-zinc-400 font-mono">{myProfile[pos as keyof PositionalProfile].toLocaleString()}</div>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Fairness slider */}
                        <div className="sm:ml-auto flex items-center gap-2">
                            <span className="text-[10px] font-medium text-zinc-500 uppercase">Fairness:</span>
                            <input
                                type="range" min={5} max={40} step={5}
                                value={fairnessThreshold}
                                onChange={(e) => setFairnessThreshold(parseInt(e.target.value))}
                                className="w-24 h-1.5 accent-violet-500 cursor-pointer"
                            />
                            <span className="text-xs font-mono text-zinc-600 dark:text-zinc-400 w-8">±{fairnessThreshold}%</span>
                        </div>
                    </div>
                </div>

                {/* Trade list */}
                <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
                    {suggestions.length === 0 && (
                        <div className="text-center py-8 text-sm text-zinc-400">
                            No trades found within ±{fairnessThreshold}% fairness. Try widening the threshold.
                        </div>
                    )}
                    {suggestions.slice(0, showCount).map((trade, idx) => (
                        <div key={idx} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
                            {/* Partner + complexity badge */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{trade.partner.name}</span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${trade.complexity === 1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                                        {trade.complexity === 1 ? '1-for-1' : '2-for-2'}
                                    </span>
                                    <span className={`text-[9px] font-mono ${trade.fairnessGap <= 5 ? 'text-green-600' : trade.fairnessGap <= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                                        {trade.fairnessGap <= 3 ? '≈ Even' : `${trade.fairnessGap.toFixed(0)}% gap`}
                                    </span>
                                </div>
                            </div>

                            {/* Trade details */}
                            <div className="grid grid-cols-2 gap-3">
                                {/* You send */}
                                <div className="bg-red-50/50 dark:bg-red-950/10 rounded-lg p-2">
                                    <div className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase mb-1">You Send</div>
                                    {trade.send.map(p => (
                                        <div key={p.sleeper_id} className="flex items-center justify-between text-xs">
                                            <span className={`font-medium ${posColor(p.position)}`}>{p.full_name}</span>
                                            <span className="font-mono text-zinc-500">{getVal(p).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="text-[10px] font-mono text-zinc-400 mt-1 pt-1 border-t border-red-200 dark:border-red-900">
                                        {trade.send.reduce((s, p) => s + getVal(p), 0).toLocaleString()} dynasty
                                        {trade.send.some(p => getAuction(p) > 0) && ` · $${trade.send.reduce((s, p) => s + getAuction(p), 0)} auction`}
                                    </div>
                                </div>
                                {/* You receive */}
                                <div className="bg-green-50/50 dark:bg-green-950/10 rounded-lg p-2">
                                    <div className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase mb-1">You Receive</div>
                                    {trade.receive.map(p => (
                                        <div key={p.sleeper_id} className="flex items-center justify-between text-xs">
                                            <span className={`font-medium ${posColor(p.position)}`}>{p.full_name}</span>
                                            <span className="font-mono text-zinc-500">{getVal(p).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="text-[10px] font-mono text-zinc-400 mt-1 pt-1 border-t border-green-200 dark:border-green-900">
                                        {trade.receive.reduce((s, p) => s + getVal(p), 0).toLocaleString()} dynasty
                                        {trade.receive.some(p => getAuction(p) > 0) && ` · $${trade.receive.reduce((s, p) => s + getAuction(p), 0)} auction`}
                                    </div>
                                </div>
                            </div>

                            {/* Reasoning */}
                            <div className="mt-2 flex flex-col sm:flex-row gap-2 text-[10px]">
                                <div className="flex-1 px-2 py-1 bg-violet-50 dark:bg-violet-950/20 rounded text-violet-700 dark:text-violet-300">
                                    <span className="font-bold">For you:</span> {trade.reason}
                                </div>
                                <div className="flex-1 px-2 py-1 bg-zinc-50 dark:bg-zinc-800/50 rounded text-zinc-600 dark:text-zinc-400">
                                    <span className="font-bold">For them:</span> {trade.partnerReason}
                                </div>
                            </div>
                        </div>
                    ))}

                    {suggestions.length > showCount && (
                        <button
                            onClick={() => setShowCount(prev => prev + 8)}
                            className="w-full py-2 text-xs font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 rounded-lg transition-colors"
                        >
                            Show more ({suggestions.length - showCount} remaining)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
