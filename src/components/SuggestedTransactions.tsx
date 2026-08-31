'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ArrowRight, Plus } from 'lucide-react';
import { getPositionColor } from '@/lib/positionColors';
import {
    generateTransactionSuggestions,
    type TxnPlayer,
    type RosterConfig,
    type TransactionSuggestion,
} from '@/lib/transaction-suggestions';

interface SuggestedTransactionsProps {
    myPlayers: TxnPlayer[];
    freeAgents: TxnPlayer[];
    rosterConfig: RosterConfig | null;
    /**
     * True number of players on the core roster. Pass this when some rostered
     * players may not be matched into `myPlayers` (e.g. name-match gaps), so
     * capacity math reflects the real roster size.
     */
    actualCoreCount?: number;
}

export function SuggestedTransactions({
    myPlayers,
    freeAgents,
    rosterConfig,
    actualCoreCount,
}: SuggestedTransactionsProps) {
    const [expanded, setExpanded] = useState(true);
    const [posFilter, setPosFilter] = useState<string>('ALL');

    const suggestions = useMemo<TransactionSuggestion[]>(() => {
        if (!rosterConfig) return [];
        return generateTransactionSuggestions(myPlayers, freeAgents, rosterConfig, {
            thresholdPct: 5,
            maxSuggestions: 30,
            actualCoreCount,
        });
    }, [myPlayers, freeAgents, rosterConfig, actualCoreCount]);

    const filtered = posFilter === 'ALL'
        ? suggestions
        : suggestions.filter(s => s.addPlayer.position === posFilter);

    if (!rosterConfig) {
        return null;
    }

    const matchedCore = myPlayers.filter(p => p.position !== 'PICK').length;
    const coreCount = Math.max(actualCoreCount ?? 0, matchedCore);
    const openSpots = Math.max(0, rosterConfig.coreCapacity - coreCount);

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden mb-6">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg">🔄</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Suggested Transactions</h3>
                    <span className="text-[10px] text-zinc-500 truncate">
                        {openSpots > 0
                            ? `${openSpots} open spot${openSpots !== 1 ? 's' : ''} · ${coreCount}/${rosterConfig.coreCapacity} roster`
                            : `Roster full (${coreCount}/${rosterConfig.coreCapacity}) · swaps only`}
                    </span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-zinc-400 flex-shrink-0" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    {suggestions.length === 0 ? (
                        <div className="text-center py-6 text-sm text-zinc-400">
                            No value-adding transactions available. Your roster is stronger than the free agent pool at every spot.
                        </div>
                    ) : (
                        <>
                            {/* Position filter */}
                            <div className="flex gap-1 mb-3">
                                {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                                    <button
                                        key={pos}
                                        onClick={() => setPosFilter(pos)}
                                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                                            posFilter === pos
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {pos}
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-2">
                                {filtered.map((s, i) => (
                                    <SuggestionRow key={`${s.addPlayer.sleeper_id}-${i}`} suggestion={s} rank={i + 1} />
                                ))}
                            </div>

                            {filtered.length === 0 && (
                                <div className="text-center py-4 text-xs text-zinc-400">
                                    No suggestions at {posFilter}.
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function SuggestionRow({ suggestion, rank }: { suggestion: TransactionSuggestion; rank: number }) {
    const { type, addPlayer, dropPlayer, valueGain, valueGainPct } = suggestion;

    return (
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
            rank === 1
                ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
                : rank <= 3
                    ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30'
                    : 'border-zinc-100 dark:border-zinc-800'
        }`}>
            {/* Rank */}
            <div className="text-xs font-mono text-zinc-400 w-5 text-center flex-shrink-0">
                {rank}
            </div>

            {/* Add / Drop visualization */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Add player */}
                    <div className="flex items-center gap-1.5 min-w-0">
                        <Plus size={12} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${getPositionColor(addPlayer.position)}`}>
                            {addPlayer.position}
                        </span>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {addPlayer.full_name}
                        </span>
                        <span className="text-[10px] text-zinc-400 flex-shrink-0">{addPlayer.team || 'FA'}</span>
                        <span className="text-[10px] font-mono text-zinc-500 flex-shrink-0">
                            {(addPlayer.fc_value || 0).toLocaleString()}
                        </span>
                    </div>

                    {type === 'swap' && dropPlayer && (
                        <>
                            <ArrowRight size={12} className="text-zinc-400 flex-shrink-0" />
                            {/* Drop player */}
                            <div className="flex items-center gap-1.5 min-w-0 opacity-70">
                                <span className="text-[10px] font-medium text-red-600 dark:text-red-400 flex-shrink-0">DROP</span>
                                <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${getPositionColor(dropPlayer.position)}`}>
                                    {dropPlayer.position}
                                </span>
                                <span className="text-sm text-zinc-600 dark:text-zinc-400 line-through truncate">
                                    {dropPlayer.full_name}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400 flex-shrink-0">
                                    {(dropPlayer.fc_value || 0).toLocaleString()}
                                </span>
                            </div>
                        </>
                    )}
                </div>
                {type === 'add' && (
                    <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5 ml-4">
                        Open roster spot — free add
                    </div>
                )}
            </div>

            {/* Value gain */}
            <div className="flex-shrink-0 text-right">
                <div className="text-sm font-bold text-green-700 dark:text-green-400 font-mono">
                    +{valueGain.toLocaleString()}
                </div>
                {type === 'swap' && (
                    <div className="text-[8px] text-zinc-400">+{Math.round(valueGainPct)}%</div>
                )}
            </div>
        </div>
    );
}
