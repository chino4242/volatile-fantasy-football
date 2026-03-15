'use client';

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { ColumnPicker, useColumnState } from '@/components/ColumnPicker';
import type { ColumnDef } from '@/components/ColumnPicker';

const COLUMNS: ColumnDef[] = [
    { key: 'fc_rank', label: 'FC Overall', defaultOn: true, group: 'fc' },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', defaultOn: false, group: 'fc' },
    { key: 'combined_value', label: 'Combined', defaultOn: false, group: 'fc' },
    { key: 'trend_30d', label: '30d Trend', defaultOn: false, group: 'fc' },
    { key: 'trade_freq', label: 'Trade Freq', defaultOn: false, group: 'fc' },
    { key: 'internal_rank', label: 'VFF Rank', defaultOn: false, group: 'internal' },
    { key: 'internal_pos', label: 'VFF Pos', defaultOn: false, group: 'internal' },
    { key: 'tier', label: 'Tier', defaultOn: false, group: 'internal' },
    { key: 'value_gap', label: 'Signal', defaultOn: false, group: 'internal' },
];

function PlayerAvatar({ sleeperId, name }: { sleeperId: string; name: string }) {
    const [imgError, setImgError] = useState(false);
    const showImg = sleeperId && !sleeperId.includes('pick') && !imgError;
    return (
        <div className="relative w-8 h-8 sm:w-10 sm:h-10 mr-3 flex-shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700">
            {showImg ? (
                <img src={`https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`} alt={name} className="absolute inset-0 w-full h-full object-cover" onError={() => setImgError(true)} />
            ) : (
                <span className="text-[10px] sm:text-xs font-medium text-zinc-400 dark:text-zinc-500">{name?.[0] || '?'}</span>
            )}
        </div>
    );
}

export interface FreeAgentData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    years_exp: number | null;
    fc_value: number | null;
    fc_rank: number | null;
    fc_position_rank?: number | null;
    fc_combined_value?: number | null;
    fc_trend_30_day?: number | null;
    fc_trade_frequency?: string | null;
    rank_overall?: number | null;
    rank_pos?: number | null;
    rank_tier?: number | null;
}

interface FreeAgentTableProps {
    players: FreeAgentData[];
    rankingsVintage?: string | null;
}

type SortColumn = 'fc_value' | 'fc_rank' | 'full_name' | 'position';
type SortDirection = 'asc' | 'desc';

export function FreeAgentTable({ players, rankingsVintage }: FreeAgentTableProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('fc_value');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filterPosition, setFilterPosition] = useState<string>('ALL');

    const vffLabel = rankingsVintage ? `VFF Rankings (${rankingsVintage})` : 'VFF Rankings';
    const COLUMN_GROUPS = [
        { id: 'fc', label: 'FantasyCalc' },
        { id: 'internal', label: vffLabel },
    ];
    const { visibleCols, columnOrder, toggle: toggleCol, reorder, show, orderedVisible } = useColumnState(COLUMNS, 'vff_free_agent_columns');

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortColumn(column);
            setSortDirection(column === 'fc_rank' || column === 'full_name' ? 'asc' : 'desc');
        }
    };

    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    const filteredPlayers = filterPosition === 'ALL' ? players
        : filterPosition === 'ROOKIES' ? players.filter(p => p.years_exp === 0)
        : players.filter(p => p.position === filterPosition);

    const sortedPlayers = [...filteredPlayers].sort((a, b) => {
        let valA: any = a[sortColumn]; let valB: any = b[sortColumn];
        if (valA === null) valA = sortDirection === 'desc' ? -Infinity : Infinity;
        if (valB === null) valB = sortDirection === 'desc' ? -Infinity : Infinity;
        if (typeof valA === 'string' && typeof valB === 'string') return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        return sortDirection === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });

    const posBadgeClass = (pos: string | null) => {
        switch (pos) {
            case 'QB': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            case 'RB': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case 'WR': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            case 'TE': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
            default: return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400';
        }
    };

    const getValueGapLabel = (player: FreeAgentData) => {
        const marketRank = player.fc_rank; const analysisRank = player.rank_overall;
        if (!marketRank || !analysisRank) return null;
        const gap = marketRank - analysisRank;
        if (gap >= 20) return { label: 'STRONG BUY', color: 'text-green-700 dark:text-green-400' };
        if (gap >= 10) return { label: 'BUY', color: 'text-green-600 dark:text-green-400' };
        if (gap <= -20) return { label: 'STRONG SELL', color: 'text-red-700 dark:text-red-400' };
        if (gap <= -10) return { label: 'SELL', color: 'text-red-600 dark:text-red-400' };
        return { label: 'HOLD', color: 'text-zinc-500 dark:text-zinc-400' };
    };

    const getTierColorClass = (tier: number | null | undefined) => {
        if (!tier) return 'text-zinc-400';
        if (tier === 1) return 'text-purple-600 dark:text-purple-400 font-bold';
        if (tier === 2) return 'text-blue-600 dark:text-blue-400';
        if (tier === 3) return 'text-green-600 dark:text-green-400';
        return 'text-zinc-500 dark:text-zinc-400';
    };

    const vintageTitle = rankingsVintage ? `VFF Rankings from ${rankingsVintage}` : undefined;
    const vffBg = 'bg-purple-50/20 dark:bg-purple-950/10';

    const renderHeader = (key: string): React.ReactNode => {
        const h: Record<string, React.ReactNode> = {
            fc_rank: <th key={key} className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">FC Rank</th>,
            fc_pos_rank: <th key={key} className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">FC Pos</th>,
            combined_value: <th key={key} className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Combined</th>,
            trend_30d: <th key={key} className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">30d Trend</th>,
            trade_freq: <th key={key} className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Trade Freq</th>,
            internal_rank: <th key={key} className={`px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>VFF Rank</th>,
            internal_pos: <th key={key} className={`px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>VFF Pos</th>,
            tier: <th key={key} className={`px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>Tier</th>,
            value_gap: <th key={key} className={`px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider ${vffBg}`} title={rankingsVintage ? `Signal based on ${rankingsVintage} VFF ranks vs. current FC market ranks` : undefined}>Signal{rankingsVintage ? <span className="ml-1 text-[9px] font-normal normal-case text-purple-400">({rankingsVintage})</span> : null}</th>,
        };
        return h[key] || null;
    };

    const renderCell = (key: string, player: FreeAgentData): React.ReactNode => {
        const valueGap = getValueGapLabel(player);
        const c: Record<string, React.ReactNode> = {
            fc_rank: <td key={key} className="px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-mono">{player.fc_rank ? `#${player.fc_rank}` : '-'}</td>,
            fc_pos_rank: <td key={key} className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_position_rank ? `${player.position}${player.fc_position_rank}` : '-'}</td>,
            combined_value: <td key={key} className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_combined_value?.toLocaleString() || '-'}</td>,
            trend_30d: <td key={key} className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono">{player.fc_trend_30_day ? <span className={player.fc_trend_30_day > 0 ? 'text-green-600 dark:text-green-400' : player.fc_trend_30_day < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}>{player.fc_trend_30_day > 0 ? '↑+' : player.fc_trend_30_day < 0 ? '↓' : ''}{player.fc_trend_30_day}</span> : '-'}</td>,
            trade_freq: <td key={key} className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono">{player.fc_trade_frequency ? <span className={parseFloat(player.fc_trade_frequency) > 0.015 ? 'text-green-600 dark:text-green-400' : parseFloat(player.fc_trade_frequency) > 0.005 ? 'text-yellow-600 dark:text-yellow-400' : 'text-zinc-400'}>{(parseFloat(player.fc_trade_frequency) * 100).toFixed(2)}%</span> : '-'}</td>,
            internal_rank: <td key={key} className={`px-3 py-3 sm:py-4 whitespace-nowrap text-right ${vffBg} text-sm font-mono text-zinc-700 dark:text-zinc-300`}>{player.rank_overall || '-'}</td>,
            internal_pos: <td key={key} className={`px-3 py-3 sm:py-4 whitespace-nowrap text-right ${vffBg} text-sm font-mono text-zinc-700 dark:text-zinc-300`}>{player.rank_pos ? `${player.position}${player.rank_pos}` : '-'}</td>,
            tier: <td key={key} className={`px-3 py-3 sm:py-4 whitespace-nowrap text-right ${vffBg} font-mono text-sm ${getTierColorClass(player.rank_tier)}`}>{player.rank_tier || '-'}</td>,
            value_gap: <td key={key} className={`px-3 py-3 sm:py-4 whitespace-nowrap text-right ${vffBg}`}>{valueGap ? <span className={`text-xs font-bold ${valueGap.color}`} title={rankingsVintage ? `Based on ${rankingsVintage} VFF ranks vs. current FC market ranks` : undefined}>{valueGap.label}</span> : '-'}</td>,
        };
        return c[key] || null;
    };

    return (
        <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
                <div className="flex gap-2 overflow-x-auto">
                    {['ALL', 'QB', 'RB', 'WR', 'TE', 'ROOKIES'].map(pos => (
                        <button key={pos} onClick={() => setFilterPosition(pos)}
                            className={`px-3 py-1 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${filterPosition === pos ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                            {pos}
                        </button>
                    ))}
                </div>
                <ColumnPicker columns={COLUMNS} visibleCols={visibleCols} columnOrder={columnOrder} onToggle={toggleCol} onReorder={reorder} groups={COLUMN_GROUPS} />
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/50 select-none">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-12">#</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Player</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Pos</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Value</th>
                            {orderedVisible.map(key => renderHeader(key))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                        {sortedPlayers.map((player, index) => (
                            <tr key={player.sleeper_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 font-mono">{index + 1}</td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <PlayerAvatar sleeperId={player.sleeper_id} name={player.full_name || ''} />
                                        <div>
                                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{player.full_name}</div>
                                            <div className="text-xs text-zinc-500 flex items-center gap-1 sm:hidden">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${posBadgeClass(player.position)}`}>{player.position}</span>
                                                <span>{player.team || 'FA'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${posBadgeClass(player.position)}`}>{player.position}</span>
                                        <span>{player.team || 'FA'}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono font-medium text-green-600 dark:text-green-400">{player.fc_value?.toLocaleString() || '0'}</td>
                                {orderedVisible.map(key => renderCell(key, player))}
                            </tr>
                        ))}
                        {sortedPlayers.length === 0 && (
                            <tr><td colSpan={100} className="px-3 py-8 text-center text-sm text-zinc-500">No available players found for this criteria.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
