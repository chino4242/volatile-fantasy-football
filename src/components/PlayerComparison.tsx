'use client';

import React, { useState, useMemo } from 'react';
import { comparePlayerStats, type PlayerAdvStats, type ComparisonMetric } from '@/lib/advanced-stats';

interface PlayerComparisonProps {
    playerA: { id: string; full_name: string; position: string | null };
    playerAStats: PlayerAdvStats | null;
    allPlayers: Array<{ id: string; full_name: string; position: string | null }>;
    onClose: () => void;
}

export function PlayerComparison({ playerA, playerAStats, allPlayers, onClose }: PlayerComparisonProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [playerBSelection, setPlayerBSelection] = useState<{ id: string; full_name: string; position: string | null } | null>(null);
    const [playerBStats, setPlayerBStats] = useState<PlayerAdvStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [comparisonResults, setComparisonResults] = useState<ComparisonMetric[] | null>(null);

    const searchResults = useMemo(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) return [];
        const q = searchQuery.toLowerCase();
        return allPlayers
            .filter(p => p.id !== playerA.id && p.full_name.toLowerCase().includes(q))
            .slice(0, 8);
    }, [searchQuery, allPlayers, playerA.id]);

    const selectPlayerB = async (player: { id: string; full_name: string; position: string | null }) => {
        setPlayerBSelection(player);
        setSearchQuery('');
        setLoading(true);

        try {
            const res = await fetch(`/api/player-advanced-stats?sleeper_id=${player.id}`);
            if (res.ok) {
                const data = await res.json();
                if (data?.stats?.length > 0) {
                    const bStats = data.stats[0] as PlayerAdvStats;
                    setPlayerBStats(bStats);
                    if (playerAStats) {
                        const results = comparePlayerStats(playerAStats, bStats);
                        setComparisonResults(results);
                    }
                } else {
                    setPlayerBStats(null);
                    setComparisonResults(null);
                }
            }
        } catch {
            setPlayerBStats(null);
            setComparisonResults(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-zinc-500 uppercase">Player Comparison</div>
                <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">✕ Close</button>
            </div>

            {/* Player A header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{playerA.full_name}</span>
                <span className="text-xs text-zinc-400">vs</span>
                {playerBSelection ? (
                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{playerBSelection.full_name}</span>
                ) : (
                    <span className="text-xs text-zinc-400 italic">Select a player to compare</span>
                )}
            </div>

            {/* Search for player B */}
            {!playerBSelection && (
                <div className="relative mb-3">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search for a player to compare..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    {searchResults.length > 0 && (
                        <div className="absolute z-20 top-full mt-1 w-full bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
                            {searchResults.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => selectPlayerB(p)}
                                    className="w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 flex items-center gap-2"
                                >
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.position === 'QB' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : p.position === 'RB' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : p.position === 'WR' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}`}>
                                        {p.position}
                                    </span>
                                    <span className="text-sm text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Change player B button */}
            {playerBSelection && (
                <button
                    onClick={() => { setPlayerBSelection(null); setPlayerBStats(null); setComparisonResults(null); }}
                    className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 mb-3"
                >
                    ← Change comparison player
                </button>
            )}

            {/* Loading state */}
            {loading && (
                <div className="text-xs text-zinc-400 py-4 text-center">Loading stats...</div>
            )}

            {/* No stats available */}
            {playerBSelection && !loading && !playerAStats && (
                <div className="text-xs text-amber-600 dark:text-amber-400 py-2">No advanced stats available for {playerA.full_name}</div>
            )}
            {playerBSelection && !loading && !playerBStats && playerAStats && (
                <div className="text-xs text-amber-600 dark:text-amber-400 py-2">No advanced stats available for {playerBSelection.full_name}</div>
            )}

            {/* Comparison table */}
            {comparisonResults && comparisonResults.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-700">
                                <th className="text-left py-2 px-2 text-zinc-500 font-medium">Metric</th>
                                <th className="text-right py-2 px-2 text-zinc-700 dark:text-zinc-300 font-semibold">{playerA.full_name}</th>
                                <th className="text-right py-2 px-2 text-indigo-600 dark:text-indigo-400 font-semibold">{playerBSelection!.full_name}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {comparisonResults.map((metric, i) => (
                                <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                                    <td className="py-1.5 px-2 text-zinc-500">{metric.label}</td>
                                    <td className={`py-1.5 px-2 text-right font-mono ${metric.winner === 'a' ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                        {metric.playerA !== null ? formatMetricValue(metric.playerA, metric.unit) : '—'}
                                    </td>
                                    <td className={`py-1.5 px-2 text-right font-mono ${metric.winner === 'b' ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                        {metric.playerB !== null ? formatMetricValue(metric.playerB, metric.unit) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function formatMetricValue(value: number, unit: string): string {
    if (unit === '%') {
        // If the value is already > 1, it's a percentage, otherwise multiply by 100
        const display = value > 1 ? value : value * 100;
        return `${display.toFixed(1)}%`;
    }
    if (unit === 'pts') return value.toFixed(1);
    if (unit === 'yds') return value.toFixed(2);
    if (unit === 's') return value.toFixed(2);
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(2);
}
