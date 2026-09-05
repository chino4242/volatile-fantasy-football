'use client';

import React, { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Star } from 'lucide-react';
import { ColumnPicker, useColumnState } from '@/components/ColumnPicker';
import type { ColumnDef } from '@/components/ColumnPicker';

const MOCK_DRAFT_COLUMNS: ColumnDef[] = [
    { key: 'position', label: 'Position', defaultOn: true, group: 'core' },
    { key: 'team', label: 'Team', defaultOn: true, group: 'core' },
    { key: 'market_value', label: 'Market Value', defaultOn: true, group: 'core' },
    { key: 'auction_value', label: 'Auction $', defaultOn: true, group: 'core' },
    { key: 'fc_rank', label: 'FC Overall', defaultOn: true, group: 'fc' },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', defaultOn: true, group: 'fc' },
    { key: 'combined_value', label: 'Combined', defaultOn: false, group: 'fc' },
    { key: 'trend_30d', label: '30d Trend', defaultOn: false, group: 'fc' },
    { key: 'ranks', label: 'Rank (Dyn / RD)', defaultOn: true, group: 'internal' },
    { key: 'pos_ranks', label: 'Pos (Dyn / RD)', defaultOn: true, group: 'internal' },
    { key: 'tiers', label: 'Tier (Dyn / RD)', defaultOn: true, group: 'internal' },
    { key: 'prospect', label: 'Prospect', defaultOn: true, group: 'prospect' },
    { key: 'signal', label: 'LR Rank', defaultOn: true, group: 'prospect' },
    { key: 'market_score_lr', label: 'Market Score', defaultOn: true, group: 'prospect' },
];

interface AvailablePlayersTableProps {
    availablePlayers: any[];
    watchList: Set<string>;
    toggleWatchList: (playerId: string) => void;
    makePick: (playerId: string) => void;
    setSelectedDraftPlayer: (player: any) => void;
    sf: boolean;
    customRankingsMap?: Record<string, any[]>;
    rankingsVintage?: string | null;
    redraftVintage?: string | null;
    isLive: boolean;
    leagueId: string;
    defaultSortColumn?: string;
    defaultTierMode?: 'dynasty' | 'zap' | 'redraft' | 'off';
}

export { MOCK_DRAFT_COLUMNS };

export default function AvailablePlayersTable({
    availablePlayers,
    watchList,
    toggleWatchList,
    makePick,
    setSelectedDraftPlayer,
    sf,
    customRankingsMap,
    rankingsVintage,
    redraftVintage,
    isLive,
    leagueId,
    defaultSortColumn = 'fc_value',
    defaultTierMode = 'dynasty',
}: AvailablePlayersTableProps) {
    const [sortColumn, setSortColumn] = useState<string>(defaultSortColumn);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [positionFilter, setPositionFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [showWatchListOnly, setShowWatchListOnly] = useState(false);
    const [draftTierMode, setDraftTierMode] = useState<'dynasty' | 'zap' | 'redraft' | 'off'>(defaultTierMode);
    const [expandedProspect, setExpandedProspect] = useState<string | null>(null);
    const [activeWriteupTab, setActiveWriteupTab] = useState<string>('late_round');

    const vffLabel = rankingsVintage ? `VFF Rankings (${rankingsVintage})` : 'VFF Rankings';
    const MD_GROUPS = [
        { id: 'core', label: 'Core' },
        { id: 'fc', label: 'FantasyCalc' },
        { id: 'internal', label: vffLabel },
        { id: 'prospect', label: 'Prospect' },
    ];
    const { visibleCols: visibleColumns, columnOrder, toggle: toggleCol, reorder, orderedVisible } = useColumnState(MOCK_DRAFT_COLUMNS, 'vff_mock_draft_columns');

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

    const coreTh = "px-2 sm:px-4 py-2 sm:py-3 text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors";
    const fcTh = "px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors";
    const vffTh = "px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors";
    const vffTitle = rankingsVintage ? `VFF Rankings from ${rankingsVintage}` : undefined;
    const redraftTh = "px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer group hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors";
    const redraftTitle = redraftVintage ? `Redraft Rankings from ${redraftVintage}` : undefined;
    const combinedTh = "px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors";
    const prospectTh = `${fcTh.replace('bg-blue-50/50 dark:bg-blue-950/20', 'bg-emerald-50/50 dark:bg-emerald-950/20').replace('hover:bg-blue-100/50 dark:hover:bg-blue-900/30', 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30')}`;

    const headerMap: Record<string, { className: string; sortKey: string; label: string; title?: string }> = {
        position: { className: `${coreTh} text-left`, sortKey: 'position', label: 'Pos' },
        team: { className: `${coreTh} text-left`, sortKey: 'team', label: 'Team' },
        market_value: { className: `${coreTh} text-right`, sortKey: 'fc_value', label: 'Value' },
        auction_value: { className: `${coreTh} text-right`, sortKey: 'redraft_auction_value', label: 'Auction $' },
        fc_rank: { className: fcTh, sortKey: sf ? 'fc_rank_sf' : 'fc_rank_1qb', label: 'FC Rank' },
        fc_pos_rank: { className: fcTh, sortKey: sf ? 'fc_position_rank_sf' : 'fc_position_rank_1qb', label: 'FC Pos' },
        combined_value: { className: `${fcTh}`, sortKey: 'fc_combined_value', label: 'Combined' },
        trend_30d: { className: `${fcTh}`, sortKey: 'fc_trend_30_day', label: '30d' },
        trade_freq: { className: `${fcTh}`, sortKey: 'fc_trade_frequency', label: 'Traded' },
        ranks: { className: combinedTh, sortKey: sf ? 'rank_sf_overall' : 'rank_1qb_overall', label: 'Rank', title: vffTitle },
        pos_ranks: { className: combinedTh, sortKey: sf ? 'rank_sf_pos' : 'rank_1qb_pos', label: 'Pos Rank', title: vffTitle },
        tiers: { className: combinedTh, sortKey: sf ? 'rank_sf_tier' : 'rank_1qb_tier', label: 'Tier', title: vffTitle },
        prospect: { className: prospectTh, sortKey: 'zap_score', label: 'Prospect' },
        signal: { className: prospectTh, sortKey: 'signal', label: 'LR Rank' },
        market_score_lr: { className: prospectTh, sortKey: 'market_score_lr', label: 'Mkt Score' },
    };

    const renderHeader = (key: string) => {
        const h = headerMap[key];
        if (!h) return null;
        return <th key={key} className={h.className} onClick={() => handleSort(h.sortKey)} title={h.title}>{h.label} <SortIcon column={h.sortKey} /></th>;
    };

    const fcTd = "px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20";
    const combinedTd = "px-4 py-2 text-right bg-purple-50/50 dark:bg-purple-950/20";
    const prospectTdCls = "px-4 py-2 text-right bg-emerald-50/50 dark:bg-emerald-950/20";

    const renderCell = (key: string, player: any) => {
        const dynRank = sf ? player.rank_sf_overall : player.rank_1qb_overall;
        const dynPos = sf ? player.rank_sf_pos : player.rank_1qb_pos;
        const dynTier = sf ? player.rank_sf_tier : player.rank_1qb_tier;
        const rdRank = player.redraft_rank_overall;
        const rdPos = player.redraft_rank_pos;
        const rdTier = player.redraft_rank_tier;

        switch (key) {
            case 'position': return <td key={key} className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">{player.position}</td>;
            case 'team': return <td key={key} className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{player.team || '—'}</td>;
            case 'market_value': return <td key={key} className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-zinc-900 dark:text-zinc-100">{player.fc_value?.toFixed(0) || '—'}</td>;
            case 'auction_value': return <td key={key} className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right font-mono text-green-700 dark:text-green-400">{player.redraft_auction_value ? `$${player.redraft_auction_value}` : '—'}</td>;
            case 'fc_rank': return <td key={key} className={fcTd}>{(sf ? player.fc_rank_sf : player.fc_rank_1qb) || '—'}</td>;
            case 'fc_pos_rank': return <td key={key} className={fcTd}>{player.position}{(sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb) || '—'}</td>;
            case 'combined_value': return <td key={key} className={`${fcTd}`}>{player.fc_combined_value?.toFixed(0) || '—'}</td>;
            case 'trend_30d': return <td key={key} className="px-4 py-3 text-sm text-right bg-blue-50/50 dark:bg-blue-950/20">{player.fc_trend_30_day ? <span className={player.fc_trend_30_day > 0 ? 'text-green-600 dark:text-green-400' : player.fc_trend_30_day < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}>{player.fc_trend_30_day > 0 ? '+' : ''}{player.fc_trend_30_day}</span> : '—'}</td>;
            case 'trade_freq': return <td key={key} className={`${fcTd}`}>{player.fc_trade_frequency ? Number(player.fc_trade_frequency).toFixed(2) : '—'}</td>;
            case 'ranks': return (
                <td key={key} className={combinedTd}>
                    <div className="text-sm font-mono text-purple-700 dark:text-purple-300">{dynRank || '—'}</div>
                    {rdRank && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{rdRank}</div>}
                </td>
            );
            case 'pos_ranks': return (
                <td key={key} className={combinedTd}>
                    <div className="text-sm font-mono text-purple-700 dark:text-purple-300">{dynPos ? `${player.position}${dynPos}` : '—'}</div>
                    {rdPos && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{player.position}{rdPos}</div>}
                </td>
            );
            case 'tiers': return (
                <td key={key} className={combinedTd}>
                    <div className="text-sm font-mono text-purple-700 dark:text-purple-300">{dynTier ? `T${dynTier}` : '—'}</div>
                    {rdTier && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">T{rdTier}</div>}
                </td>
            );
            case 'prospect': {
                const hasZap = player.zap_score && player.zap_score > 0;
                const hasRookie = player.rookie_pos_rank;
                if (!hasZap && !hasRookie) return <td key={key} className={prospectTdCls}><span className="text-sm text-zinc-400">—</span></td>;
                return (
                    <td key={key} className={prospectTdCls}>
                        {hasZap && <div className={`text-sm font-mono ${player.zap_stale ? 'text-zinc-400 italic' : 'text-emerald-700 dark:text-emerald-300'}`} title={player.zap_category || ''}>{player.zap_score!.toFixed(1)}</div>}
                        {hasRookie && <div className="text-[10px] text-zinc-500">{player.position}{player.rookie_pos_rank} · T{player.rookie_tier}</div>}
                    </td>
                );
            }
            case 'signal': {
                const rankings = customRankingsMap?.[player.id];
                if (!rankings || rankings.length === 0) return <td key={key} className={prospectTdCls}><span className="text-sm text-zinc-400">—</span></td>;
                const signalColors: Record<string, string> = { 'Super Buy': 'bg-green-600 text-white', 'Buy': 'bg-green-500 text-white', 'Hold': 'bg-zinc-400 text-white', 'Sell': 'bg-red-500 text-white', 'Super Sell': 'bg-red-600 text-white' };
                return (
                    <td key={key} className={prospectTdCls}>
                        {rankings.map((r: any, i: number) => (
                            <div key={i} className="flex flex-col items-end gap-0.5">
                                {r.rank && <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">#{r.rank}</span>}
                                {r.signal && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${signalColors[r.signal] || 'bg-zinc-600 text-white'}`}>{r.signal}</span>}
                            </div>
                        ))}
                    </td>
                );
            }
            case 'market_score_lr': {
                const rankings = customRankingsMap?.[player.id];
                const ms = rankings?.[0]?.marketScore;
                if (!ms) return <td key={key} className={prospectTdCls}><span className="text-sm text-zinc-400">—</span></td>;
                const color = ms >= 80 ? 'text-green-600 dark:text-green-400' : ms >= 60 ? 'text-emerald-600 dark:text-emerald-400' : ms >= 40 ? 'text-zinc-700 dark:text-zinc-300' : 'text-red-600 dark:text-red-400';
                return (
                    <td key={key} className={prospectTdCls}>
                        <span className={`text-sm font-mono font-medium ${color}`}>{ms.toFixed(0)}</span>
                    </td>
                );
            }
            default: return null;
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    Available Players
                </h2>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                    {/* Search */}
                    <input
                        type="text"
                        placeholder={isLive ? "Type name to quick-pick..." : "Search..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoFocus={isLive}
                        className={`px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 ${isLive ? 'w-44 sm:w-56' : 'w-32 sm:w-40'}`}
                    />
                    {/* Position Filters */}
                    <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                        {['ALL', 'QB', 'RB', 'WR', 'TE', 'DEF'].map(pos => (
                            <button
                                key={pos}
                                onClick={() => setPositionFilter(pos)}
                                className={`px-2 sm:px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                                    positionFilter === pos
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>
                    {/* Watch List Toggle */}
                    <button
                        onClick={() => setShowWatchListOnly(!showWatchListOnly)}
                        className={`px-2 sm:px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex-shrink-0 ${showWatchListOnly ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    >
                        ★ {watchList.size}
                    </button>
                    {/* Column Picker */}
                    <ColumnPicker columns={MOCK_DRAFT_COLUMNS} visibleCols={visibleColumns} columnOrder={columnOrder} onToggle={toggleCol} onReorder={reorder} groups={MD_GROUPS} />
                </div>
            </div>
            {/* Tier Mode Toggle + Legend */}
            <div className="flex items-center gap-3 px-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800 text-[9px] text-zinc-400 flex-wrap">
                <div className="flex items-center gap-1">
                    {(['dynasty', 'zap', 'redraft', 'off'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => setDraftTierMode(mode)}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${draftTierMode === mode
                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                        >
                            {mode === 'dynasty' ? 'Dynasty' : mode === 'zap' ? 'ZAP' : mode === 'redraft' ? 'Redraft' : 'Off'}
                        </button>
                    ))}
                </div>
                {draftTierMode === 'dynasty' && (
                    <>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-green-100 dark:bg-green-900/25 border border-green-200 dark:border-green-800" />T1-3 Elite</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" />T4-6 Solid</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-purple-100 dark:bg-purple-900/15 border border-purple-200 dark:border-purple-800" />T7-9 Depth</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800" />T10+ Dart</span>
                    </>
                )}
                {draftTierMode === 'zap' && (
                    <>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-fuchsia-100 dark:bg-fuchsia-900/25 border border-fuchsia-200 dark:border-fuchsia-800" />Legendary</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-green-100 dark:bg-green-900/25 border border-green-200 dark:border-green-800" />Elite</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" />Starter</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800" />Flex</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-pink-100 dark:bg-pink-900/15 border border-pink-200 dark:border-pink-800" />Bench</span>
                    </>
                )}
                {draftTierMode === 'redraft' && (
                    <>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-green-100 dark:bg-green-900/25 border border-green-200 dark:border-green-800" />T1-5 Elite</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" />T6-10 Solid</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-purple-100 dark:bg-purple-900/15 border border-purple-200 dark:border-purple-800" />T11-15 Depth</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800" />T16+</span>
                    </>
                )}
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-4 sm:mx-0">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/50 sticky top-0">
                        <tr>
                            <th className="px-1 sm:px-2 py-2 sm:py-3 w-8 sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-950/50"><Star size={12} className="text-zinc-400 mx-auto" /></th>
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors sticky left-8 z-10 bg-zinc-50 dark:bg-zinc-950/50 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-zinc-200 dark:after:bg-zinc-700" onClick={() => handleSort('full_name')}>
                                Player <SortIcon column="full_name" />
                            </th>
                            {orderedVisible.map(renderHeader)}
                            <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-zinc-500 uppercase">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {availablePlayers
                            .filter(p => {
                                if (positionFilter !== 'ALL' && p.position !== positionFilter) return false;
                                if (showWatchListOnly && !watchList.has(p.id)) return false;
                                if (searchQuery && !p.full_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                                return true;
                            })
                            .sort((a, b) => {
                                let valA: any = sortColumn === 'signal' ? (customRankingsMap?.[a.id]?.[0]?.rank ?? null) : sortColumn === 'market_score_lr' ? (customRankingsMap?.[a.id]?.[0]?.marketScore ?? null) : a[sortColumn as keyof typeof a];
                                let valB: any = sortColumn === 'signal' ? (customRankingsMap?.[b.id]?.[0]?.rank ?? null) : sortColumn === 'market_score_lr' ? (customRankingsMap?.[b.id]?.[0]?.marketScore ?? null) : b[sortColumn as keyof typeof b];
                                
                                if (valA === null || valA === undefined) valA = sortDirection === 'desc' ? -Infinity : Infinity;
                                if (valB === null || valB === undefined) valB = sortDirection === 'desc' ? -Infinity : Infinity;
                                
                                if (typeof valA === 'string' && typeof valB === 'string') {
                                    return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
                                }
                                
                                return sortDirection === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
                            })
                            .slice(0, 50)
                            .map(player => (
                            <React.Fragment key={player.id}>
                            <tr className={`hover:bg-zinc-50 dark:hover:bg-zinc-800 border-l-4 ${
                                player.position === 'QB' ? 'border-l-green-400 dark:border-l-green-500' :
                                player.position === 'RB' ? 'border-l-blue-400 dark:border-l-blue-500' :
                                player.position === 'WR' ? 'border-l-red-400 dark:border-l-red-500' :
                                player.position === 'TE' ? 'border-l-orange-400 dark:border-l-orange-500' :
                                'border-l-zinc-300 dark:border-l-zinc-600'
                            } ${(() => {
                                if (draftTierMode === 'off') return '';
                                if (draftTierMode === 'dynasty') {
                                    const tier = sf ? player.rank_sf_tier : player.rank_1qb_tier;
                                    if (!tier) return '';
                                    if (tier <= 3) return 'bg-green-100/60 dark:bg-green-900/25';
                                    if (tier <= 6) return 'bg-blue-100/50 dark:bg-blue-900/20';
                                    if (tier <= 9) return 'bg-purple-100/40 dark:bg-purple-900/15';
                                    if (tier <= 12) return 'bg-amber-100/40 dark:bg-amber-900/15';
                                    return '';
                                }
                                if (draftTierMode === 'zap') {
                                    const c = (player.zap_category || '').toLowerCase();
                                    if (c.includes('legendary')) return 'bg-fuchsia-100/60 dark:bg-fuchsia-900/25';
                                    if (c.includes('elite')) return 'bg-green-100/60 dark:bg-green-900/25';
                                    if (c.includes('starter')) return 'bg-blue-100/50 dark:bg-blue-900/20';
                                    if (c.includes('flex')) return 'bg-amber-100/40 dark:bg-amber-900/15';
                                    if (c.includes('bench')) return 'bg-pink-100/40 dark:bg-pink-900/15';
                                    return '';
                                }
                                if (draftTierMode === 'redraft') {
                                    const tier = player.redraft_rank_tier;
                                    if (!tier) return '';
                                    if (tier <= 5) return 'bg-green-100/60 dark:bg-green-900/25';
                                    if (tier <= 10) return 'bg-blue-100/50 dark:bg-blue-900/20';
                                    if (tier <= 15) return 'bg-purple-100/40 dark:bg-purple-900/15';
                                    if (tier <= 20) return 'bg-amber-100/40 dark:bg-amber-900/15';
                                    return '';
                                }
                                return '';
                            })()} ${watchList.has(player.id) ? 'ring-2 ring-inset ring-amber-300 dark:ring-amber-700' : ''}`}>
                                <td className="px-1 sm:px-2 py-2 sm:py-3 text-center sticky left-0 z-10 bg-white dark:bg-zinc-900">
                                    <button onClick={() => toggleWatchList(player.id)} className={`p-1 rounded transition-colors ${watchList.has(player.id) ? 'text-amber-500 hover:text-amber-600' : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'}`}>
                                        <Star size={14} fill={watchList.has(player.id) ? 'currentColor' : 'none'} />
                                    </button>
                                </td>
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 sticky left-8 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700">
                                    {(player.zap_analysis || (player.writeups && player.writeups.length > 0)) ? (
                                        <button className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => { setExpandedProspect(expandedProspect === player.id ? null : player.id); setActiveWriteupTab('late_round'); }}>
                                            {player.full_name} <span className="text-[10px] text-zinc-400">{expandedProspect === player.id ? '▲' : '▼'}</span>
                                        </button>
                                    ) : player.full_name}
                                    {player.droppedByTeam && (
                                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                            Dropped by {player.droppedByTeam}
                                        </span>
                                    )}
                                </td>
                                {orderedVisible.map(key => renderCell(key, player))}
                                <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); makePick(player.id); setSearchQuery(''); }}
                                            className="px-2 py-1 text-xs font-bold text-white bg-green-600 rounded hover:bg-green-700 active:scale-95 transition-all"
                                            title="Draft this player"
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => setSelectedDraftPlayer(player)}
                                            className="px-2 sm:px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                                        >
                                            Info
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {expandedProspect === player.id && (player.zap_analysis || (player.writeups && player.writeups.length > 0)) && (() => {
                                const sources: { key: string; label: string; content: React.ReactNode }[] = [];
                                if (player.zap_analysis) sources.push({ key: 'late_round', label: 'Late Round', content: (
                                    <>
                                        {player.zap_ai?.summary && (
                                            <div className="mb-3 space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    {player.zap_ai.confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${player.zap_ai.confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : player.zap_ai.confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{player.zap_ai.confidence}/10</span>}
                                                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{player.zap_ai.summary}</span>
                                                </div>
                                                {player.zap_ai.comps && <div className="text-[11px] text-zinc-500">🔄 Comps: {player.zap_ai.comps}</div>}
                                                <div className="flex gap-3 text-[11px]">
                                                    {player.zap_ai.bull_case && <div className="text-green-700 dark:text-green-400">📈 {player.zap_ai.bull_case}</div>}
                                                    {player.zap_ai.bear_case && <div className="text-red-700 dark:text-red-400">📉 {player.zap_ai.bear_case}</div>}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-medium text-zinc-500">{player.zap_category}{player.zap_score ? ` · ZAP: ${player.zap_score.toFixed(1)}` : ''}</span>
                                            {player.zap_comps && <span className="text-xs text-zinc-400">Comps: {player.zap_comps}</span>}
                                        </div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed">{player.zap_analysis}</p>
                                    </>
                                )});
                                player.writeups?.forEach((w: any) => sources.push({ key: w.source, label: w.source.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), content: (
                                    <div>
                                        {w.ai_summary && (
                                            <div className="mb-3 space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    {w.ai_confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.ai_confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : w.ai_confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{w.ai_confidence}/10</span>}
                                                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{w.ai_summary}</span>
                                                </div>
                                                {w.ai_comps && <div className="text-[11px] text-zinc-500">🔄 Comps: {w.ai_comps}</div>}
                                                <div className="flex gap-3 text-[11px]">
                                                    {w.ai_bull_case && <div className="text-green-700 dark:text-green-400">📈 {w.ai_bull_case}</div>}
                                                    {w.ai_bear_case && <div className="text-red-700 dark:text-red-400">📉 {w.ai_bear_case}</div>}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed">{w.analysis_text}</p>
                                    </div>
                                )}));
                                const active = sources.find(s => s.key === activeWriteupTab) || sources[0];
                                return (
                                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                                        <td colSpan={orderedVisible.length + 3} className="px-4 py-3">
                                            <div className="max-w-3xl">
                                                {sources.length > 1 && (
                                                    <div className="flex gap-1 mb-3">
                                                        {sources.map(s => (
                                                            <button key={s.key} onClick={() => setActiveWriteupTab(s.key)} className={`px-2 py-1 text-[11px] font-medium rounded ${(active.key === s.key) ? 'bg-indigo-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>{s.label}</button>
                                                        ))}
                                                    </div>
                                                )}
                                                {active.content}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })()}
                            </React.Fragment>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
