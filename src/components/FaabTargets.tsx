'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FreeAgent {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    redraft_rank_overall?: number | null;
    redraft_auction_value?: number | null;
    rank_overall?: number | null;
    zap_category?: string | null;
}

interface RosterPlayer {
    full_name: string;
    position: string | null;
    fc_value: number | null;
    redraft_rank_overall?: number | null;
    redraft_auction_value?: number | null;
}

interface FaabTargetsProps {
    freeAgents: FreeAgent[];
    myRoster: RosterPlayer[];
    rosterSlots?: { QB: number; RB: number; WR: number; TE: number; FLEX: number };
    totalBudget?: number; // FAAB budget remaining (default $200)
}

interface FaabRecommendation {
    player: FreeAgent;
    suggestedBid: number;
    bidPct: number;
    reason: string;
    impact: string; // e.g., "Upgrades your RB3"
    needScore: number; // for sorting
}

export function FaabTargets({ freeAgents, myRoster, rosterSlots, totalBudget = 200 }: FaabTargetsProps) {
    const [expanded, setExpanded] = useState(true);
    const [posFilter, setPosFilter] = useState<string>('ALL');

    const recommendations = useMemo(() => {
        if (!myRoster.length) return [];

        const slots = rosterSlots || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 };
        const effectiveSlots = {
            QB: slots.QB,
            RB: slots.RB + slots.FLEX * 0.33,
            WR: slots.WR + slots.FLEX * 0.5,
            TE: slots.TE + slots.FLEX * 0.17,
        };

        // Get user's roster sorted by position
        const rosterByPos: Record<string, RosterPlayer[]> = { QB: [], RB: [], WR: [], TE: [] };
        myRoster.forEach(p => {
            if (p.position && p.position in rosterByPos) {
                rosterByPos[p.position].push(p);
            }
        });
        // Sort each position group by redraft rank (lower = better)
        Object.values(rosterByPos).forEach(group => {
            group.sort((a, b) => (a.redraft_rank_overall || 999) - (b.redraft_rank_overall || 999));
        });

        // For each position, find the "worst starter" value — this is replacement level
        const replacementLevel: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const starterCount = Math.round(effectiveSlots[pos]);
            const starters = rosterByPos[pos].slice(0, starterCount);
            // Replacement level = worst starter's redraft rank (or 200 if you don't have enough)
            const worstStarter = starters[starters.length - 1];
            replacementLevel[pos] = worstStarter?.redraft_rank_overall || 200;
        });

        // Positional need: how far below target depth are you?
        const needByPos: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const target = Math.round(effectiveSlots[pos]);
            const have = rosterByPos[pos].length;
            // Need 0-1 scale: 0 = full, 1 = empty at this position
            needByPos[pos] = have < target ? (target - have) / target : 0;
        });

        // Score each free agent
        const recs: FaabRecommendation[] = [];

        for (const fa of freeAgents) {
            if (!fa.position || !['QB', 'RB', 'WR', 'TE'].includes(fa.position)) continue;
            const pos = fa.position;
            const faRdRank = fa.redraft_rank_overall;
            if (!faRdRank) continue; // Can't assess without redraft rank

            // Value over replacement: how much better is this FA than your worst starter?
            const repLevel = replacementLevel[pos];
            const vor = repLevel - faRdRank; // positive = better than your worst starter

            // Only recommend if they'd actually improve your lineup
            if (vor <= 0 && needByPos[pos] === 0) continue;

            // Position need multiplier
            const needMultiplier = 1 + needByPos[pos] * 0.5;

            // Scarcity: how many quality FAs remain at this position?
            const qualityFAsAtPos = freeAgents.filter(p => p.position === pos && (p.redraft_rank_overall || 999) < repLevel).length;
            const scarcityMultiplier = qualityFAsAtPos <= 2 ? 1.4 : qualityFAsAtPos <= 5 ? 1.15 : 1.0;

            // Combined score
            const needScore = (Math.max(vor, 5) * needMultiplier * scarcityMultiplier);

            // Suggested bid: based on auction value as anchor, adjusted by need
            const auctionBase = fa.redraft_auction_value || Math.max(1, Math.round((200 - faRdRank) * 0.8));
            const suggestedBid = Math.min(totalBudget, Math.max(1, Math.round(auctionBase * needMultiplier * scarcityMultiplier)));
            const bidPct = Math.round((suggestedBid / totalBudget) * 100);

            // Generate reason and impact
            const starterCount = Math.round(effectiveSlots[pos as keyof typeof effectiveSlots]);
            const currentAtPos = rosterByPos[pos].length;
            let impact: string;
            let reason: string;

            if (currentAtPos < starterCount) {
                impact = `Fills ${pos}${currentAtPos + 1} starter hole`;
                reason = `You only have ${currentAtPos} ${pos}${currentAtPos !== 1 ? 's' : ''}, need ${starterCount}`;
            } else if (vor > 30) {
                impact = `Major upgrade to your ${pos}${starterCount} slot`;
                reason = `Ranked ${faRdRank} positions above your ${pos}${starterCount}`;
            } else if (vor > 10) {
                impact = `Upgrade to ${pos}${starterCount}`;
                reason = `Better than your current ${pos}${starterCount} by ${vor} ranks`;
            } else {
                impact = `Depth add at ${pos}`;
                reason = `Solid ${pos}${currentAtPos + 1} option`;
            }

            if (qualityFAsAtPos <= 2) reason += ' · Scarce position';

            recs.push({ player: fa, suggestedBid, bidPct, reason, impact, needScore });
        }

        // Sort by need score (best recommendations first)
        return recs.sort((a, b) => b.needScore - a.needScore);
    }, [freeAgents, myRoster, rosterSlots, totalBudget]);

    const filtered = posFilter === 'ALL' ? recommendations : recommendations.filter(r => r.player.position === posFilter);

    if (recommendations.length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden mb-6">
            <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-left">
                <div className="flex items-center gap-2">
                    <span className="text-lg">💰</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">FAAB Targets</h3>
                    <span className="text-[10px] text-zinc-500">Personalized for your roster</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    {/* Position filter */}
                    <div className="flex gap-1 mb-3">
                        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                            <button key={pos} onClick={() => setPosFilter(pos)}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${posFilter === pos ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                                {pos}
                            </button>
                        ))}
                    </div>

                    {/* Recommendations list */}
                    <div className="space-y-2">
                        {filtered.slice(0, 15).map((rec, i) => (
                            <div key={rec.player.sleeper_id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                                i === 0 ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20' :
                                i < 3 ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30' :
                                'border-zinc-100 dark:border-zinc-800'
                            }`}>
                                {/* Rank */}
                                <div className="text-xs font-mono text-zinc-400 w-5 text-center flex-shrink-0">
                                    {i + 1}
                                </div>

                                {/* Bid */}
                                <div className="flex-shrink-0 w-12 text-center">
                                    <div className="text-sm font-bold text-green-700 dark:text-green-400 font-mono">${rec.suggestedBid}</div>
                                    <div className="text-[8px] text-zinc-400">{rec.bidPct}%</div>
                                </div>

                                {/* Player info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{rec.player.full_name}</span>
                                        <span className={`text-[10px] font-medium px-1 rounded ${
                                            rec.player.position === 'QB' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            rec.player.position === 'RB' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                            rec.player.position === 'WR' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                        }`}>{rec.player.position}</span>
                                        <span className="text-[10px] text-zinc-400">{rec.player.team || 'FA'}</span>
                                    </div>
                                    <div className="text-[10px] text-zinc-500 mt-0.5">
                                        <span className="font-medium text-indigo-600 dark:text-indigo-400">{rec.impact}</span>
                                        <span className="mx-1">·</span>
                                        <span>{rec.reason}</span>
                                    </div>
                                </div>

                                {/* Redraft rank */}
                                <div className="flex-shrink-0 text-right">
                                    <div className="text-[10px] text-zinc-400">RD Rank</div>
                                    <div className="text-xs font-mono text-zinc-600 dark:text-zinc-300">#{rec.player.redraft_rank_overall}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filtered.length > 15 && (
                        <div className="text-center mt-3 text-[10px] text-zinc-400">
                            Showing top 15 of {filtered.length} recommendations
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
