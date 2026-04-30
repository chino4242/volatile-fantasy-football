'use client';

import { useState, useMemo } from 'react';
import { ArrowRightLeft, Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface Player {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    redraft_rank_overall?: number | null;
}

interface Team {
    rosterId: number;
    ownerName: string;
    players: Player[];
}

interface TradeSuggestion {
    teamA: { rosterId: number; name: string; gives: Player; archetype: string };
    teamB: { rosterId: number; name: string; gives: Player; archetype: string };
    valueDiff: number;
    reason: string;
}

interface Props {
    teams: Team[];
    currentRosterId?: number;
    format: '1qb' | 'sf';
}

function getTeamArchetype(players: Player[], format: string): { archetype: 'competing' | 'rebuilding' | 'balanced'; strengths: string[]; weaknesses: string[] } {
    const sf = format === 'sf';
    const byPos: Record<string, Player[]> = { QB: [], RB: [], WR: [], TE: [] };
    players.forEach(p => { if (p.position && byPos[p.position]) byPos[p.position].push(p); });

    // Determine if competing or rebuilding based on redraft vs dynasty rank gap
    let rdBetter = 0, dynBetter = 0;
    players.forEach(p => {
        const fcRank = sf ? p.fc_rank_sf : p.fc_rank_1qb;
        const rdRank = p.redraft_rank_overall;
        if (fcRank && rdRank) {
            if (rdRank < fcRank - 10) rdBetter++;
            if (fcRank < rdRank - 10) dynBetter++;
        }
    });

    const archetype = rdBetter > dynBetter + 2 ? 'competing' : dynBetter > rdBetter + 2 ? 'rebuilding' : 'balanced';

    // Positional strength/weakness by total value
    const posValues: Record<string, number> = {};
    const posCounts: Record<string, number> = {};
    Object.entries(byPos).forEach(([pos, pls]) => {
        posValues[pos] = pls.reduce((s, p) => s + (p.fc_value || 0), 0);
        posCounts[pos] = pls.filter(p => (p.fc_value || 0) > 2000).length;
    });

    const totalValue = Object.values(posValues).reduce((s, v) => s + v, 0) || 1;
    const pcts: Record<string, number> = {};
    Object.entries(posValues).forEach(([pos, val]) => { pcts[pos] = val / totalValue; });

    // Ideal allocation roughly: QB 15%, RB 30%, WR 40%, TE 15%
    const ideal: Record<string, number> = { QB: 0.15, RB: 0.30, WR: 0.40, TE: 0.15 };
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    Object.entries(pcts).forEach(([pos, pct]) => {
        if (pct > ideal[pos] * 1.15) strengths.push(pos);
        if (pct < ideal[pos] * 0.85) weaknesses.push(pos);
    });

    return { archetype, strengths, weaknesses };
}

function findTrades(teams: Team[], format: string): TradeSuggestion[] {
    const analyses = teams.map(t => ({
        ...t,
        analysis: getTeamArchetype(t.players, format),
    }));

    const suggestions: TradeSuggestion[] = [];
    const tolerance = 0.15;

    for (let i = 0; i < analyses.length; i++) {
        for (let j = i + 1; j < analyses.length; j++) {
            const a = analyses[i];
            const b = analyses[j];

            // Find complementary needs
            const aNeeds = a.analysis.weaknesses;
            const bNeeds = b.analysis.weaknesses;
            const aHas = a.analysis.strengths;
            const bHas = b.analysis.strengths;

            // A has what B needs AND B has what A needs
            const aCanHelp = aHas.filter(pos => bNeeds.includes(pos));
            const bCanHelp = bHas.filter(pos => aNeeds.includes(pos));

            if (aCanHelp.length > 0 && bCanHelp.length > 0) {
                // Find specific player swaps
                for (const posFromA of aCanHelp) {
                    for (const posFromB of bCanHelp) {
                        const aCandidates = a.players
                            .filter(p => p.position === posFromA && (p.fc_value || 0) > 1500)
                            .sort((x, y) => (x.fc_value || 0) - (y.fc_value || 0)); // lowest value surplus player
                        const bCandidates = b.players
                            .filter(p => p.position === posFromB && (p.fc_value || 0) > 1500)
                            .sort((x, y) => (x.fc_value || 0) - (y.fc_value || 0));

                        for (const pa of aCandidates) {
                            for (const pb of bCandidates) {
                                const aVal = pa.fc_value || 0;
                                const bVal = pb.fc_value || 0;
                                const diff = Math.abs(aVal - bVal);
                                const avg = (aVal + bVal) / 2;
                                if (avg > 0 && diff / avg <= tolerance) {
                                    const reason = getTradeReason(a.analysis, b.analysis, posFromA, posFromB);
                                    suggestions.push({
                                        teamA: { rosterId: a.rosterId, name: a.ownerName, gives: pa, archetype: a.analysis.archetype },
                                        teamB: { rosterId: b.rosterId, name: b.ownerName, gives: pb, archetype: b.analysis.archetype },
                                        valueDiff: Math.round((diff / avg) * 100),
                                        reason,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            // Competing vs Rebuilding: competing team sends young player, gets proven vet
            if ((a.analysis.archetype === 'competing' && b.analysis.archetype === 'rebuilding') ||
                (a.analysis.archetype === 'rebuilding' && b.analysis.archetype === 'competing')) {
                const competing = a.analysis.archetype === 'competing' ? a : b;
                const rebuilding = a.analysis.archetype === 'competing' ? b : a;

                // Competing wants: low redraft rank (good this year). Rebuilding wants: high dynasty value young players
                const compGives = competing.players
                    .filter(p => p.position !== 'PICK' && (p.fc_value || 0) > 2000 && !p.redraft_rank_overall)
                    .slice(0, 3);
                const rebGives = rebuilding.players
                    .filter(p => p.position !== 'PICK' && (p.fc_value || 0) > 2000 && p.redraft_rank_overall && p.redraft_rank_overall <= 50)
                    .slice(0, 3);

                for (const cg of compGives) {
                    for (const rg of rebGives) {
                        const diff = Math.abs((cg.fc_value || 0) - (rg.fc_value || 0));
                        const avg = ((cg.fc_value || 0) + (rg.fc_value || 0)) / 2;
                        if (avg > 0 && diff / avg <= tolerance) {
                            suggestions.push({
                                teamA: { rosterId: competing.rosterId, name: competing.ownerName, gives: cg, archetype: 'competing' },
                                teamB: { rosterId: rebuilding.rosterId, name: rebuilding.ownerName, gives: rg, archetype: 'rebuilding' },
                                valueDiff: Math.round((diff / avg) * 100),
                                reason: `Win-now swap: ${competing.ownerName} gets redraft upside, ${rebuilding.ownerName} gets dynasty value`,
                            });
                        }
                    }
                }
            }
        }
    }

    // Deduplicate and sort by lowest value diff (fairest trades first)
    const seen = new Set<string>();
    return suggestions
        .filter(s => {
            const key = [s.teamA.gives.sleeper_id, s.teamB.gives.sleeper_id].sort().join('-');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.valueDiff - b.valueDiff)
        .slice(0, 50);
}

function getTradeReason(a: ReturnType<typeof getTeamArchetype>, b: ReturnType<typeof getTeamArchetype>, posFromA: string, posFromB: string): string {
    return `Positional balance: ${posFromA} depth for ${posFromB} depth`;
}

const ARCHETYPE_BADGE: Record<string, { label: string; color: string }> = {
    competing: { label: 'Win Now', color: 'bg-amber-500/20 text-amber-400' },
    rebuilding: { label: 'Rebuilding', color: 'bg-blue-500/20 text-blue-400' },
    balanced: { label: 'Balanced', color: 'bg-zinc-500/20 text-zinc-400' },
};

export default function TradeFinderCard({ teams, currentRosterId, format }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [filterTeamId, setFilterTeamId] = useState<number | null>(null);

    const suggestions = useMemo(() => findTrades(teams, format), [teams, format]);

    const filtered = filterTeamId
        ? suggestions.filter(s => s.teamA.rosterId === filterTeamId || s.teamB.rosterId === filterTeamId)
        : suggestions;

    // Group by trade partner pair
    const grouped = useMemo(() => {
        const map = new Map<string, TradeSuggestion[]>();
        filtered.forEach(s => {
            const key = [s.teamA.name, s.teamB.name].sort().join(' ↔ ');
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(s);
        });
        return [...map.entries()].map(([pair, trades]) => ({ pair, trades: trades.slice(0, 5) })).slice(0, 15);
    }, [filtered]);

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden">
            <button onClick={() => setExpanded(!expanded)} className="w-full p-4 flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Trade Finder</h3>
                    <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-bold">{suggestions.length}</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3">
                    {/* Filter */}
                    <div className="flex items-center gap-2">
                        <Filter size={12} className="text-zinc-400" />
                        <select
                            value={filterTeamId ?? ''}
                            onChange={e => setFilterTeamId(e.target.value ? Number(e.target.value) : null)}
                            className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-300 focus:border-indigo-500 outline-none"
                        >
                            <option value="">All Teams</option>
                            {teams.map(t => (
                                <option key={t.rosterId} value={t.rosterId}>{t.ownerName}</option>
                            ))}
                        </select>
                    </div>

                    {grouped.length === 0 && (
                        <p className="text-sm text-zinc-500 text-center py-4">No trade opportunities found within value tolerance.</p>
                    )}

                    {grouped.map(({ pair, trades }) => (
                        <div key={pair} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-xs font-bold text-zinc-500">{pair}</div>
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {trades.map((t, i) => {
                                    const aBadge = ARCHETYPE_BADGE[t.teamA.archetype];
                                    const bBadge = ARCHETYPE_BADGE[t.teamB.archetype];
                                    return (
                                        <div key={i} className="px-3 py-2.5 space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xs font-bold text-red-500">{t.teamA.name}</span>
                                                        <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${aBadge.color}`}>{aBadge.label}</span>
                                                    </div>
                                                    <div className="text-[11px] text-zinc-700 dark:text-zinc-300">sends <span className="font-semibold">{t.teamA.gives.full_name}</span> <span className="text-zinc-500">({t.teamA.gives.position} · {(t.teamA.gives.fc_value || 0).toLocaleString()})</span></div>
                                                </div>
                                                <ArrowRightLeft size={12} className="text-zinc-400 flex-shrink-0" />
                                                <div className="flex-1 min-w-0 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${bBadge.color}`}>{bBadge.label}</span>
                                                        <span className="text-xs font-bold text-green-500">{t.teamB.name}</span>
                                                    </div>
                                                    <div className="text-[11px] text-zinc-700 dark:text-zinc-300">sends <span className="font-semibold">{t.teamB.gives.full_name}</span> <span className="text-zinc-500">({t.teamB.gives.position} · {(t.teamB.gives.fc_value || 0).toLocaleString()})</span></div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[9px] text-zinc-500 italic">{t.reason}</span>
                                                <span className={`text-[9px] font-bold ${t.valueDiff <= 5 ? 'text-green-500' : t.valueDiff <= 10 ? 'text-amber-500' : 'text-zinc-500'}`}>
                                                    {t.valueDiff}% gap {t.valueDiff <= 10 && '✓'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
