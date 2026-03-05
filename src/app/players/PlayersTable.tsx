'use client';

import { useState } from 'react';
import { Settings2, TrendingUp, TrendingDown } from 'lucide-react';

interface PlayerData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    age: number | null;
    fc_value: number | null;
    fc_rank: number | null;
    fc_position_rank: number | null;
    fc_combined_value: number | null;
    fc_trade_frequency: string | null;
    fc_trend_30_day: number | null;
    rank_overall: number | null;
    rank_pos: number | null;
    rank_tier: number | null;
}

interface PlayersTableProps {
    players: PlayerData[];
    format: '1qb' | 'sf';
}

type SignalFilter = 'ALL' | 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

const SIGNAL_FILTERS: { label: SignalFilter; activeColor: string }[] = [
    { label: 'ALL', activeColor: 'bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-900' },
    { label: 'STRONG BUY', activeColor: 'bg-green-600 text-white' },
    { label: 'BUY', activeColor: 'bg-green-500 text-white' },
    { label: 'HOLD', activeColor: 'bg-zinc-400 text-white' },
    { label: 'SELL', activeColor: 'bg-red-500 text-white' },
    { label: 'STRONG SELL', activeColor: 'bg-red-600 text-white' },
];

type ColKey = 'market_value' | 'fc_rank' | 'fc_pos_rank' | 'combined_value' | 'trend_30d' | 'trade_freq' | 'internal_rank' | 'internal_pos' | 'tier' | 'value_gap';

interface ColDef {
    key: ColKey;
    label: string;
    defaultOn: boolean;
}

const COLUMNS: ColDef[] = [
    { key: 'market_value', label: 'Market Value', defaultOn: true },
    { key: 'fc_rank', label: 'FC Overall', defaultOn: true },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', defaultOn: false },
    { key: 'combined_value', label: 'Combined', defaultOn: false },
    { key: 'trend_30d', label: '30d Trend', defaultOn: false },
    { key: 'trade_freq', label: 'Trade Freq', defaultOn: false },
    { key: 'internal_rank', label: 'VFF Rank', defaultOn: false },
    { key: 'internal_pos', label: 'VFF Pos', defaultOn: false },
    { key: 'tier', label: 'Tier', defaultOn: false },
    { key: 'value_gap', label: 'Signal', defaultOn: true },
];

const getValueGap = (player: PlayerData) => {
    const marketRank = player.fc_rank;
    const analysisRank = player.rank_overall;
    if (!marketRank || !analysisRank) return null;
    return marketRank - analysisRank;
};

const getValueGapLabel = (gap: number | null) => {
    if (gap === null) return null;
    if (gap >= 20) return { label: 'STRONG BUY', color: 'bg-green-600 text-white' };
    if (gap >= 10) return { label: 'BUY', color: 'bg-green-500 text-white' };
    if (gap <= -20) return { label: 'STRONG SELL', color: 'bg-red-600 text-white' };
    if (gap <= -10) return { label: 'SELL', color: 'bg-red-500 text-white' };
    return { label: 'HOLD', color: 'bg-zinc-400 text-white' };
};

export function PlayersTable({ players, format }: PlayersTableProps) {
    const [activePositions, setActivePositions] = useState<Set<string>>(new Set(['QB', 'RB', 'WR', 'TE']));
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
    
    // Load column visibility from localStorage
    const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
        if (typeof window === 'undefined') return new Set(COLUMNS.filter(c => c.defaultOn).map(c => c.key));
        const saved = localStorage.getItem('vff_column_visibility');
        if (saved) {
            try {
                return new Set(JSON.parse(saved));
            } catch {
                return new Set(COLUMNS.filter(c => c.defaultOn).map(c => c.key));
            }
        }
        return new Set(COLUMNS.filter(c => c.defaultOn).map(c => c.key));
    });
    
    const [showColumnPicker, setShowColumnPicker] = useState(false);

    const togglePosition = (pos: string) => {
        setActivePositions(prev => {
            const next = new Set(prev);
            next.has(pos) ? next.delete(pos) : next.add(pos);
            return next;
        });
    };

    const toggleCol = (key: ColKey) => {
        setVisibleCols(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            // Save to localStorage
            localStorage.setItem('vff_column_visibility', JSON.stringify([...next]));
            return next;
        });
    };

    const show = (key: ColKey) => visibleCols.has(key);

    const filteredPlayers = players.filter(p => {
        if (!activePositions.has(p.position || '')) return false;
        if (signalFilter === 'ALL') return true;
        if (p.position === 'PICK') return false;
        const gap = getValueGap(p);
        const lbl = getValueGapLabel(gap);
        return lbl?.label === signalFilter;
    });

    const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PICK'];

    return (
        <div>
            {/* Filters */}
            <div className="mb-6 space-y-4">
                {/* Position Filters */}
                <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Position</h3>
                    <div className="flex flex-wrap gap-2">
                        {POSITIONS.map(pos => {
                            const isActive = activePositions.has(pos);
                            const colors: Record<string, string> = {
                                QB: 'bg-[#9de89f] text-zinc-900',
                                RB: 'bg-[#ffadad] text-zinc-900',
                                WR: 'bg-[#9bf6ff] text-zinc-900',
                                TE: 'bg-[#ffd6a5] text-zinc-900',
                                PICK: 'bg-[#6fffe9] text-zinc-900',
                            };
                            return (
                                <button
                                    key={pos}
                                    onClick={() => togglePosition(pos)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                        isActive
                                            ? colors[pos]
                                            : 'bg-zinc-100 text-zinc-600 opacity-40 hover:opacity-60 dark:bg-zinc-800 dark:text-zinc-400'
                                    }`}
                                >
                                    {pos}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Signal Filters */}
                <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Signal</h3>
                    <div className="flex flex-wrap gap-2">
                        {SIGNAL_FILTERS.map(({ label, activeColor }) => (
                            <button
                                key={label}
                                onClick={() => setSignalFilter(label)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    signalFilter === label
                                        ? activeColor
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Column Picker */}
                <div className="relative">
                    <button
                        onClick={() => setShowColumnPicker(!showColumnPicker)}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                    >
                        <Settings2 className="w-4 h-4" />
                        Columns
                    </button>
                    {showColumnPicker && (
                        <div className="absolute top-full mt-2 left-0 bg-white dark:bg-zinc-900 rounded-lg shadow-lg ring-1 ring-zinc-900/5 p-4 z-10 min-w-[200px]">
                            {COLUMNS.map(col => (
                                <label key={col.key} className="flex items-center gap-2 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 px-2 rounded">
                                    <input
                                        type="checkbox"
                                        checked={show(col.key)}
                                        onChange={() => toggleCol(col.key)}
                                        className="rounded"
                                    />
                                    <span className="text-sm text-zinc-700 dark:text-zinc-300">{col.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Results count */}
            <div className="mb-4 text-sm text-zinc-500">
                Showing {filteredPlayers.length} players
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                            <tr>
                                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase w-12">#</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Player</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Pos</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Team</th>
                                {show('market_value') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Value</th>}
                                {show('fc_rank') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">FC Rank</th>}
                                {show('fc_pos_rank') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">FC Pos</th>}
                                {show('combined_value') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Combined</th>}
                                {show('trend_30d') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">30d Trend</th>}
                                {show('trade_freq') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Trade Freq</th>}
                                {show('internal_rank') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">VFF Rank</th>}
                                {show('internal_pos') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">VFF Pos</th>}
                                {show('tier') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Tier</th>}
                                {show('value_gap') && <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Signal</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {filteredPlayers.map((player, index) => {
                                const gap = getValueGap(player);
                                const gapLabel = getValueGapLabel(gap);
                                const trend = player.fc_trend_30_day;

                                return (
                                    <tr key={player.sleeper_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="px-3 py-4 whitespace-nowrap text-sm text-zinc-400 dark:text-zinc-500 font-mono">
                                            {index + 1}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {player.full_name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                                            {player.position}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                                            {player.team || 'FA'}
                                        </td>
                                        {show('market_value') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-900 dark:text-zinc-100">
                                                {player.fc_value?.toLocaleString() || '–'}
                                            </td>
                                        )}
                                        {show('fc_rank') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.fc_rank || '–'}
                                            </td>
                                        )}
                                        {show('fc_pos_rank') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.fc_position_rank ? `${player.position}${player.fc_position_rank}` : '–'}
                                            </td>
                                        )}
                                        {show('combined_value') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.fc_combined_value?.toLocaleString() || '–'}
                                            </td>
                                        )}
                                        {show('trend_30d') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                {trend ? (
                                                    <span className={`inline-flex items-center gap-1 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-zinc-500'}`}>
                                                        {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                                                        {trend > 0 ? '+' : ''}{trend}
                                                    </span>
                                                ) : '–'}
                                            </td>
                                        )}
                                        {show('trade_freq') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.fc_trade_frequency ? `${(parseFloat(player.fc_trade_frequency) * 100).toFixed(2)}%` : '–'}
                                            </td>
                                        )}
                                        {show('internal_rank') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.rank_overall || '–'}
                                            </td>
                                        )}
                                        {show('internal_pos') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.rank_pos ? `${player.position}${player.rank_pos}` : '–'}
                                            </td>
                                        )}
                                        {show('tier') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">
                                                {player.rank_tier || '–'}
                                            </td>
                                        )}
                                        {show('value_gap') && (
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                {gapLabel ? (
                                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${gapLabel.color}`}>
                                                        {gapLabel.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-zinc-400">–</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
