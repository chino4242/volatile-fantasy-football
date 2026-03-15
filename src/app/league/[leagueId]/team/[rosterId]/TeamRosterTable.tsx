'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { PlayerStatsModal } from '@/components/PlayerStatsModal';
import { ColumnPicker, useColumnState } from '@/components/ColumnPicker';
import type { ColumnDef } from '@/components/ColumnPicker';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlayerData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    fc_rank: number | null;
    fc_rank_sf: number | null;
    fc_rank_1qb: number | null;
    // FC Position Ranks (new)
    fc_position_rank_sf: number | null;
    fc_position_rank_1qb: number | null;
    // FC Combined Value & Trade Frequency (new)
    fc_combined_value: number | null;
    fc_trade_frequency: number | null;
    // 30-day trend (new)
    fc_trend_30_day: number | null;
    // Proprietary ranks
    rank_1qb_overall: number | null;
    rank_1qb_pos: number | null;
    rank_1qb_tier: number | null;
    rank_sf_overall: number | null;
    rank_sf_pos: number | null;
    rank_sf_tier: number | null;
}

// ── Column definitions ─────────────────────────────────────────────────────────

type ColKey =
    | 'market_value'
    | 'fc_rank'
    | 'fc_pos_rank'
    | 'combined_value'
    | 'trend_30d'
    | 'trade_freq'
    | 'internal_rank'
    | 'internal_pos'
    | 'tier'
    | 'value_gap'
    | string; // Allow dynamic custom ranking keys

interface ColDef {
    key: string;
    label: string;
    description: string;
    defaultOn: boolean;
    group: 'core' | 'fc' | 'internal' | 'custom';
}

const BASE_COLUMNS: ColDef[] = [
    { key: 'market_value', label: 'Market Value', description: 'FantasyCalc dynasty trade value', defaultOn: true, group: 'core' },
    { key: 'fc_rank', label: 'FC Overall', description: 'FantasyCalc overall rank', defaultOn: true, group: 'fc' },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', description: 'FantasyCalc position rank (e.g. RB5)', defaultOn: true, group: 'fc' },
    { key: 'combined_value', label: 'Combined', description: 'Dynasty + redraft combined value', defaultOn: false, group: 'fc' },
    { key: 'trend_30d', label: '30d Trend', description: 'Value change over last 30 days', defaultOn: true, group: 'fc' },
    { key: 'trade_freq', label: 'Trade Freq', description: 'How often this player trades (liquidity)', defaultOn: false, group: 'fc' },
    { key: 'internal_rank', label: 'VFF Rank', description: 'Volatile FF proprietary overall rank', defaultOn: false, group: 'internal' },
    { key: 'internal_pos', label: 'VFF Pos', description: 'Volatile FF proprietary position rank', defaultOn: false, group: 'internal' },
    { key: 'tier', label: 'Tier', description: 'Tier grouping (1 = elite)', defaultOn: false, group: 'internal' },
    { key: 'value_gap', label: 'Value Gap', description: 'Difference between FC rank and VFF rank', defaultOn: true, group: 'internal' },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface TeamRosterTableProps {
    players: PlayerData[];
    scoringFormat?: '1qb' | 'sf';
    positionValues: Record<string, number>;
    allLeaguePlayers: PlayerData[];
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
    customRankingsMap: Map<string, any[]>;
    rankingSources: Array<{ id: string; name: string; display_name: string; description: string | null }>;
    keeperCount?: number; // Number of keepers for keeper leagues
    rankingsVintage?: string | null; // e.g. "Mar 2026"
}

// ── Signal filter ──────────────────────────────────────────────────────────────

type SignalFilter = 'ALL' | 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

const SIGNAL_FILTERS: { label: SignalFilter; activeColor: string }[] = [
    { label: 'ALL', activeColor: 'bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-900' },
    { label: 'STRONG BUY', activeColor: 'bg-green-600 text-white' },
    { label: 'BUY', activeColor: 'bg-green-500 text-white' },
    { label: 'HOLD', activeColor: 'bg-zinc-400 text-white' },
    { label: 'SELL', activeColor: 'bg-red-500 text-white' },
    { label: 'STRONG SELL', activeColor: 'bg-red-600 text-white' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const getValueColorClass = (value: number | null) => {
    if (!value) return 'text-zinc-900 dark:text-zinc-100';
    if (value >= 7500) return 'bg-fuchsia-100/80 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-600/20';
    if (value >= 5000) return 'bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20';
    if (value >= 2500) return 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20';
    if (value >= 1000) return 'bg-sky-100/80 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20';
    return 'text-zinc-500 dark:text-zinc-400';
};

const getTierColorClass = (tier: number | null) => {
    if (!tier) return 'text-zinc-500 dark:text-zinc-400';
    if (tier === 1) return 'text-yellow-600 dark:text-yellow-400 font-bold';
    if (tier === 2) return 'text-slate-500 dark:text-slate-300 font-semibold';
    if (tier === 3) return 'text-amber-700/80 dark:text-amber-600/80 font-medium';
    return 'text-zinc-500 dark:text-zinc-400';
};

const getPositionBgClass = (position: string | null) => {
    const colors: Record<string, string> = {
        QB: 'bg-[#9de89f]/30', RB: 'bg-[#ffadad]/30',
        WR: 'bg-[#9bf6ff]/30', TE: 'bg-[#ffd6a5]/30', PICK: 'bg-[#6fffe9]/30',
    };
    return colors[position || ''] || '';
};

const getValueGap = (player: PlayerData, format: '1qb' | 'sf') => {
    const marketRank = format === '1qb' ? player.fc_rank_1qb : player.fc_rank_sf;
    const analysisRank = format === '1qb' ? player.rank_1qb_overall : player.rank_sf_overall;
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

// ── Trend cell ─────────────────────────────────────────────────────────────────

function TrendCell({ value }: { value: number | null }) {
    if (value === null || value === undefined) return <span className="text-zinc-400">–</span>;
    if (value > 0) return (
        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-mono font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            +{value.toLocaleString()}
        </span>
    );
    if (value < 0) return (
        <span className="inline-flex items-center gap-0.5 text-red-500 dark:text-red-400 font-mono font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            {value.toLocaleString()}
        </span>
    );
    return (
        <span className="inline-flex items-center gap-0.5 text-zinc-400 font-mono">
            <Minus className="w-3.5 h-3.5" />0
        </span>
    );
}

// ── Trade Frequency cell ───────────────────────────────────────────────────────

function TradeFreqCell({ value }: { value: number | null }) {
    if (!value) return <span className="text-zinc-400">–</span>;
    const pct = (Number(value) * 100).toFixed(1);
    const num = Number(pct);
    const color = num > 1.5
        ? 'text-emerald-600 dark:text-emerald-400'
        : num > 0.5
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-zinc-500 dark:text-zinc-400';
    return <span className={`font-mono text-sm ${color}`}>{pct}%</span>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TeamRosterTable({
    players,
    scoringFormat = 'sf',
    positionValues,
    allLeaguePlayers,
    playerOwnershipMap,
    rosterToOwnerMap,
    currentRosterId,
    customRankingsMap,
    rankingSources,
    keeperCount,
    rankingsVintage,
}: TeamRosterTableProps) {
    // Build dynamic columns including custom rankings
    const COLUMNS = [
        ...BASE_COLUMNS,
        ...rankingSources.map(source => ({
            key: `custom_${source.id}`,
            label: source.display_name,
            description: source.description || `${source.display_name} rankings`,
            defaultOn: false,
            group: 'custom' as const,
        }))
    ];

    const [activePositions, setActivePositions] = useState<Set<string>>(
        new Set(['QB', 'RB', 'WR', 'TE'])
    );
    const [selectedPick, setSelectedPick] = useState<PlayerData | null>(null);
    const [tradeTargetOffset, setTradeTargetOffset] = useState(0);
    const [tolerance, setTolerance] = useState(0.05);
    const [viewMode, setViewMode] = useState<'position' | 'team'>('position');
    const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null);
    const [sortColumn, setSortColumn] = useState<string>('fc_value');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Column visibility + order — shared hook
    const vffLabel = rankingsVintage ? `VFF Rankings (${rankingsVintage})` : 'VFF Rankings';
    const COLUMN_GROUPS = [
        { id: 'core', label: 'Core' },
        { id: 'fc', label: 'FantasyCalc' },
        { id: 'internal', label: vffLabel },
        { id: 'custom', label: 'Custom Rankings' },
    ];
    const { visibleCols, columnOrder, toggle: toggleCol, reorder, show, orderedVisible } = useColumnState(COLUMNS, 'vff_column_visibility');

    // Sorting
    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    // Signal filter
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');

    const sf = scoringFormat === 'sf';
    const fmtLabel = sf ? 'SF' : '1QB';

    const handlePlayerClick = async (player: PlayerData) => {
        if (player.position === 'PICK') {
            setSelectedPick(player);
            setTradeTargetOffset(0);
            return;
        }
        
        setSelectedPlayer(player);
    };

    const togglePosition = (pos: string) => {
        setActivePositions(prev => {
            const next = new Set(prev);
            next.has(pos) ? next.delete(pos) : next.add(pos);
            return next;
        });
    };

    const filteredPlayers = players.filter(p => {
        if (!activePositions.has(p.position || '')) return false;
        if (signalFilter === 'ALL') return true;
        // Picks have no signal — exclude from specific-signal views
        if (p.position === 'PICK') return false;
        const gap = getValueGap(p, scoringFormat);
        const lbl = getValueGapLabel(gap);
        return lbl?.label === signalFilter;
    }).sort((a, b) => {
        let valA: any = a[sortColumn as keyof PlayerData];
        let valB: any = b[sortColumn as keyof PlayerData];

        // Handle null/undefined
        if (valA === null || valA === undefined) valA = sortDirection === 'desc' ? -Infinity : Infinity;
        if (valB === null || valB === undefined) valB = sortDirection === 'desc' ? -Infinity : Infinity;

        // String comparison
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }

        // Numeric comparison
        return sortDirection === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });
    
    const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PICK'];

    // ── Column renderers (order-driven) ────────────────────────────────────────
    const fcBg = 'bg-blue-50/50 dark:bg-blue-950/20';
    const fcBgCell = 'bg-blue-50/20 dark:bg-blue-950/10';
    const vffBg = 'bg-purple-50/50 dark:bg-purple-950/20';
    const vffBgCell = 'bg-purple-50/20 dark:bg-purple-950/10';
    const vintageTitle = rankingsVintage ? `VFF Rankings from ${rankingsVintage}` : undefined;
    const signalTitle = rankingsVintage ? `Signal based on ${rankingsVintage} VFF rankings vs. current FantasyCalc market ranks` : undefined;

    const renderHeader = (key: string): React.ReactNode => {
        const customSource = key.startsWith('custom_') ? rankingSources.find(s => `custom_${s.id}` === key) : null;
        const headers: Record<string, React.ReactNode> = {
            market_value: <th key={key} className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('fc_value')}>Value <SortIcon column="fc_value" /></th>,
            fc_rank: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg} cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors`} onClick={() => handleSort(sf ? 'fc_rank_sf' : 'fc_rank_1qb')}>{fmtLabel} Rank <SortIcon column={sf ? 'fc_rank_sf' : 'fc_rank_1qb'} /></th>,
            fc_pos_rank: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg} cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors`} onClick={() => handleSort(sf ? 'fc_position_rank_sf' : 'fc_position_rank_1qb')}>{fmtLabel} Pos <SortIcon column={sf ? 'fc_position_rank_sf' : 'fc_position_rank_1qb'} /></th>,
            combined_value: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg} hidden md:table-cell cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors`} onClick={() => handleSort('fc_combined_value')}>Combined <SortIcon column="fc_combined_value" /></th>,
            trend_30d: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg} cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors`} onClick={() => handleSort('fc_trend_30_day')}>30d <SortIcon column="fc_trend_30_day" /></th>,
            trade_freq: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg} cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors`} onClick={() => handleSort('fc_trade_frequency')}>Traded <SortIcon column="fc_trade_frequency" /></th>,
            internal_rank: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>VFF Rank</th>,
            internal_pos: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>VFF Pos</th>,
            tier: <th key={key} className={`px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider ${vffBg}`} title={vintageTitle}>Tier</th>,
            value_gap: <th key={key} className={`px-3 sm:px-6 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider ${vffBg}`} title={signalTitle}>Signal{rankingsVintage ? <span className="ml-1 text-[9px] font-normal normal-case text-purple-400">({rankingsVintage})</span> : null}</th>,
        };
        if (headers[key]) return headers[key];
        if (customSource) return <th key={key} className={`px-3 sm:px-6 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-wider ${fcBg}`}>{customSource.display_name}</th>;
        return null;
    };

    const renderCell = (key: string, player: PlayerData): React.ReactNode => {
        const fcPosRank = sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb;
        const fcOverall = sf ? player.rank_sf_overall : player.rank_1qb_overall;
        const fcPosInternal = sf ? player.rank_sf_pos : player.rank_1qb_pos;
        const fcTier = sf ? player.rank_sf_tier : player.rank_1qb_tier;
        const gap = getValueGap(player, scoringFormat);
        const gapLabel = getValueGapLabel(gap);

        const customSource = key.startsWith('custom_') ? rankingSources.find(s => `custom_${s.id}` === key) : null;

        const cells: Record<string, React.ReactNode> = {
            market_value: <td key={key} className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right"><span className={`inline-flex items-center rounded-md px-2 py-1 text-sm sm:text-base font-mono font-medium ${getValueColorClass(player.fc_value)}`}>{player.fc_value?.toLocaleString() || '–'}</span></td>,
            fc_rank: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${fcBgCell}`}><div className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">{sf ? (player.fc_rank_sf || '–') : (player.fc_rank_1qb || '–')}</div></td>,
            fc_pos_rank: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${fcBgCell} hidden sm:table-cell`}><span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{fcPosRank ? `${player.position}${fcPosRank}` : '–'}</span></td>,
            combined_value: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${fcBgCell}`}><span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{player.fc_combined_value?.toLocaleString() || '–'}</span></td>,
            trend_30d: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${fcBgCell}`}><TrendCell value={player.fc_trend_30_day} /></td>,
            trade_freq: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${fcBgCell}`}><TradeFreqCell value={player.fc_trade_frequency} /></td>,
            internal_rank: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${vffBgCell}`}><span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{fcOverall || '–'}</span></td>,
            internal_pos: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${vffBgCell}`}><span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">{fcPosInternal ? `${player.position}${fcPosInternal}` : '–'}</span></td>,
            tier: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right ${vffBgCell} font-mono text-sm ${getTierColorClass(fcTier)}`}>{fcTier ? `T${fcTier}` : '–'}</td>,
            value_gap: <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center ${vffBgCell}`}>{gapLabel ? <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${gapLabel.color}`} title={rankingsVintage ? `Based on ${rankingsVintage} VFF ranks vs. current FC market ranks` : undefined}>{gapLabel.label}</span> : '–'}</td>,
        };
        if (cells[key]) return cells[key];
        if (customSource) {
            const rankings = customRankingsMap.get(player.sleeper_id) || [];
            const ranking = rankings.find(r => r.source_name === customSource.name);
            return (
                <td key={key} className={`px-3 sm:px-6 py-3 sm:py-4 text-center ${fcBgCell}`}>
                    {ranking ? (
                        <div className="space-y-1">
                            <div className="font-mono text-sm font-semibold">#{ranking.rank}</div>
                            {ranking.signal && (
                                <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    ranking.signal.includes('Super Buy') ? 'bg-green-600 text-white' :
                                    ranking.signal === 'Buy' ? 'bg-green-500 text-white' :
                                    ranking.signal === 'Hold' ? 'bg-zinc-400 text-white' :
                                    ranking.signal === 'Sell' ? 'bg-red-500 text-white' :
                                    ranking.signal.includes('Super Sell') ? 'bg-red-600 text-white' :
                                    'bg-zinc-600 text-white'
                                }`}>{ranking.signal}</span>
                            )}
                        </div>
                    ) : <span className="text-zinc-400">–</span>}
                </td>
            );
        }
        return null;
    };

    const getTradeTargets = (pickValue: number, offset: number = 0) => {
        const minValue = pickValue * (1 - tolerance);
        const maxValue = pickValue * (1 + tolerance);
        const targets = allLeaguePlayers
            .filter(p => {
                const value = p.fc_value || 0;
                const ownerId = playerOwnershipMap.get(p.sleeper_id);
                return value >= minValue && value <= maxValue && ownerId !== currentRosterId && p.position !== 'PICK';
            })
            .sort((a, b) => Math.abs((a.fc_value || 0) - pickValue) - Math.abs((b.fc_value || 0) - pickValue));

        if (viewMode === 'team') {
            const byTeam: Record<string, typeof targets> = {};
            targets.forEach(target => {
                const ownerId = playerOwnershipMap.get(target.sleeper_id);
                const teamName = ownerId ? rosterToOwnerMap.get(ownerId) || 'Unknown' : 'Unknown';
                if (!byTeam[teamName]) byTeam[teamName] = [];
                byTeam[teamName].push(target);
            });
            Object.keys(byTeam).forEach(team => { byTeam[team] = byTeam[team].slice(0, 3 + offset); });
            return byTeam;
        }

        return {
            QB: targets.filter(p => p.position === 'QB').slice(0, 3 + offset),
            RB: targets.filter(p => p.position === 'RB').slice(0, 3 + offset),
            WR: targets.filter(p => p.position === 'WR').slice(0, 3 + offset),
            TE: targets.filter(p => p.position === 'TE').slice(0, 3 + offset),
        };
    };

    return (
        <div className="space-y-4">
            {/* Position value tiles */}
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {POSITIONS.map(pos => {
                    const isActive = activePositions.has(pos);
                    const colors: Record<string, string> = {
                        QB: 'bg-[#9de89f] text-zinc-900', RB: 'bg-[#ffadad] text-zinc-900',
                        WR: 'bg-[#9bf6ff] text-zinc-900', TE: 'bg-[#ffd6a5] text-zinc-900', PICK: 'bg-[#6fffe9] text-zinc-900',
                    };
                    return (
                        <button key={pos} onClick={() => togglePosition(pos)}
                            className={`px-2 sm:px-4 py-2 rounded-lg text-center sm:text-left transition-all ${isActive ? colors[pos] : 'bg-zinc-100 dark:bg-zinc-800 opacity-40 hover:opacity-60'}`}>
                            <div className={`text-[10px] sm:text-xs font-semibold ${isActive ? 'text-zinc-900' : 'text-zinc-500'}`}>{pos}</div>
                            <div className={`font-mono font-medium text-xs sm:text-base ${isActive ? 'text-zinc-900' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                {positionValues[pos]?.toLocaleString() || 0}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Signal / Gap filter chips */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mr-1">Signal</span>
                {SIGNAL_FILTERS.map(({ label, activeColor }) => {
                    const isActive = signalFilter === label;
                    // Count players matching this signal (for badges on non-ALL filters)
                    const count = label === 'ALL' ? null : players.filter(p => {
                        if (!activePositions.has(p.position || '')) return false;
                        if (p.position === 'PICK') return false;
                        const gap = getValueGap(p, scoringFormat);
                        const lbl = getValueGapLabel(gap);
                        return lbl?.label === label;
                    }).length;

                    return (
                        <button
                            key={label}
                            onClick={() => setSignalFilter(isActive && label !== 'ALL' ? 'ALL' : label)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${isActive
                                    ? activeColor
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                        >
                            {label}
                            {count !== null && count > 0 && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${isActive ? 'bg-white/30' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                                    }`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
                {signalFilter !== 'ALL' && (
                    <button
                        onClick={() => setSignalFilter('ALL')}
                        className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline ml-1"
                    >
                        Clear
                    </button>
                )}
            </div>

            {/* Table + column picker */}
            <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden -mx-4 sm:mx-0">
                {/* Column picker toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30">
                    <span className="text-xs text-zinc-500">{filteredPlayers.length} players</span>
                    <ColumnPicker columns={COLUMNS} visibleCols={visibleCols} columnOrder={columnOrder} onToggle={toggleCol} onReorder={reorder} groups={COLUMN_GROUPS} />
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                            <tr>
                                <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider w-12">#</th>
                                {/* Always-visible: Player */}
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('full_name')}>
                                    Player <SortIcon column="full_name" />
                                </th>
                                <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('position')}>
                                    Pos <SortIcon column="position" />
                                </th>
                                <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('team')}>
                                    Team <SortIcon column="team" />
                                </th>

                                {orderedVisible.map(key => renderHeader(key))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {filteredPlayers.map((player, index) => {
                                // Show keeper line after the Nth player (excluding picks)
                                const playersOnly = filteredPlayers.filter(p => p.position !== 'PICK');
                                const isKeeperLine = keeperCount && keeperCount > 0 && 
                                                     player.position !== 'PICK' && 
                                                     playersOnly.indexOf(player) === keeperCount - 1;

                                return (
                                    <React.Fragment key={player.sleeper_id}>
                                    <tr
                                        className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${getPositionBgClass(player.position)}`}
                                        onClick={() => handlePlayerClick(player)}
                                    >
                                        {/* Row number */}
                                        <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-400 dark:text-zinc-500 font-mono">
                                            {index + 1}
                                        </td>
                                        {/* Player name */}
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                            <div className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">{player.full_name}</div>
                                            <div className="sm:hidden text-[11px] text-zinc-400 mt-0.5">{player.position} · {player.team || 'FA'}</div>
                                        </td>
                                        <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {player.position}
                                        </td>
                                        <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                            {player.team || 'FA'}
                                        </td>

                                        {orderedVisible.map(key => renderCell(key, player))}
                                    </tr>
                                    {isKeeperLine && (
                                        <tr>
                                            <td colSpan={100} className="px-0 py-0">
                                                <div className="relative h-2 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500">
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="bg-white dark:bg-zinc-900 px-3 py-0.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-700">
                                                            KEEPER LINE ({keeperCount} keepers)
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pick trade targets modal */}
            {selectedPick && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPick(null)}>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedPick.full_name}</h2>
                                    <p className="text-sm text-zinc-500 mt-1">Value: {selectedPick.fc_value?.toLocaleString()} pts</p>
                                </div>
                                <button onClick={() => setSelectedPick(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-3 items-center">
                                <span className="text-xs font-medium text-zinc-500 uppercase">Reach:</span>
                                {[0.05, 0.10, 0.15].map(t => (
                                    <button key={t} onClick={() => setTolerance(t)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${tolerance === t ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                                        {(t * 100).toFixed(0)}%
                                    </button>
                                ))}
                                <span className="text-xs font-medium text-zinc-500 uppercase ml-4">View:</span>
                                {(['position', 'team'] as const).map(mode => (
                                    <button key={mode} onClick={() => setViewMode(mode)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${viewMode === mode ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                                        By {mode === 'position' ? 'Position' : 'Team'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 sm:p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">Trade targets within {(tolerance * 100).toFixed(0)}% of pick value:</p>
                                <button onClick={() => setTradeTargetOffset(prev => prev + 3)}
                                    className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">
                                    Show More
                                </button>
                            </div>
                            {Object.entries(getTradeTargets(selectedPick.fc_value || 0, tradeTargetOffset)).map(([groupName, targets]) => (
                                targets.length > 0 && (
                                    <div key={groupName}>
                                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{groupName}</h3>
                                        <div className="space-y-2">
                                            {targets.map(target => {
                                                const ownerId = playerOwnershipMap.get(target.sleeper_id);
                                                const ownerName = ownerId ? rosterToOwnerMap.get(ownerId) : 'Unknown';
                                                const tGap = getValueGap(target, scoringFormat);
                                                const tLabel = getValueGapLabel(tGap);
                                                return (
                                                    <div key={target.sleeper_id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                                        <div className="flex-1">
                                                            <div className="font-medium text-zinc-900 dark:text-zinc-100">{target.full_name}</div>
                                                            <div className="text-xs text-zinc-500">
                                                                {target.position} · {target.team || 'FA'} · {ownerName}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {tLabel && (
                                                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${tLabel.color}`}>
                                                                    {tLabel.label}
                                                                </span>
                                                            )}
                                                            <div className="text-right">
                                                                <div className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{target.fc_value?.toLocaleString()}</div>
                                                                <div className="text-xs text-zinc-500">
                                                                    {((Math.abs((target.fc_value || 0) - (selectedPick.fc_value || 0)) / (selectedPick.fc_value || 1)) * 100).toFixed(1)}% diff
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Player Stats Modal */}
            {selectedPlayer && (
                <PlayerStatsModal
                    playerName={selectedPlayer.full_name}
                    position={selectedPlayer.position || 'N/A'}
                    team={selectedPlayer.team}
                    sleeperId={selectedPlayer.sleeper_id}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
        </div>
    );
}
