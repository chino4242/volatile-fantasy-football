'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { ColumnPicker, useColumnState } from '@/components/ColumnPicker';
import type { ColumnDef } from '@/components/ColumnPicker';
import { useAuth } from '@/hooks/useUser';

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
    redraft_rank_overall?: number | null;
    redraft_rank_pos?: number | null;
    redraft_rank_tier?: number | null;
    // Rest-of-season (forward-looking) + this week's start/sit rank.
    rank_ros_overall?: number | null;
    rank_ros_pos?: number | null;
    rank_ros_tier?: number | null;
    rank_ros_ppg?: number | null;
    ros_sos?: number | null;
    bye_week?: number | null;
    weekly_rank?: number | null;
}

interface PlayersTableProps {
    players: PlayerData[];
    format: '1qb' | 'sf';
    rankingsVintage?: string | null;
    weeklyWeek?: number | null;
    /** Precise date the ROS ranks were last uploaded (e.g. "Oct 8, 2026"). */
    rosUpdatedLabel?: string | null;
}

type SortColumn = 'rank_ros_overall' | 'weekly_rank' | 'fc_value' | 'fc_rank' | 'rank_overall' | 'full_name';
type SortDirection = 'asc' | 'desc';

type SignalFilter = 'ALL' | 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

const SIGNAL_FILTERS: { label: SignalFilter; activeColor: string }[] = [
    { label: 'ALL', activeColor: 'bg-zinc-700 text-white dark:bg-zinc-300 dark:text-zinc-900' },
    { label: 'STRONG BUY', activeColor: 'bg-green-600 text-white' },
    { label: 'BUY', activeColor: 'bg-green-500 text-white' },
    { label: 'HOLD', activeColor: 'bg-zinc-400 text-white' },
    { label: 'SELL', activeColor: 'bg-red-500 text-white' },
    { label: 'STRONG SELL', activeColor: 'bg-red-600 text-white' },
];

const COLUMNS: ColumnDef[] = [
    { key: 'ros_rank', label: 'ROS Rank', defaultOn: true, group: 'ros' },
    { key: 'ros_pos', label: 'ROS Pos', defaultOn: false, group: 'ros' },
    { key: 'ros_ppg', label: 'ROS PPG', defaultOn: false, group: 'ros' },
    { key: 'weekly_rank', label: 'Week Rank', defaultOn: true, group: 'weekly' },
    { key: 'market_value', label: 'Market Value', defaultOn: true, group: 'core' },
    { key: 'fc_rank', label: 'FC Overall', defaultOn: false, group: 'fc' },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', defaultOn: false, group: 'fc' },
    { key: 'combined_value', label: 'Combined', defaultOn: false, group: 'fc' },
    { key: 'trend_30d', label: '30d Trend', defaultOn: false, group: 'fc' },
    { key: 'trade_freq', label: 'Trade Freq', defaultOn: false, group: 'fc' },
    { key: 'internal_rank', label: 'Rank (Dyn / RD)', defaultOn: false, group: 'internal' },
    { key: 'internal_pos', label: 'Pos (Dyn / RD)', defaultOn: false, group: 'internal' },
    { key: 'tier', label: 'Tier (Dyn / RD)', defaultOn: false, group: 'internal' },
    { key: 'value_gap', label: 'Signal', defaultOn: true, group: 'internal' },
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

export function PlayersTable({ players, format, rankingsVintage, weeklyWeek, rosUpdatedLabel }: PlayersTableProps) {
    const [activePositions, setActivePositions] = useState<Set<string>>(new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']));
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
    const [search, setSearch] = useState('');
    // Default sort = rest-of-season rank (how a player will SCORE this year is the
    // primary lens; dynasty value is secondary). Rank columns are lower-is-better
    // → ascending.
    const [sortColumn, setSortColumn] = useState<SortColumn>('rank_ros_overall');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // "Logged in" = has a Sleeper user id OR at least one connected league
    // (Fleaflicker/Yahoo/MyFFPC). Only then can we show per-player status across
    // their leagues, so only then do we link player names to the situation view.
    const { sleeperUserId, fleaflickerLeagueIds, isLoading: authLoading } = useAuth();
    const isLoggedIn = !!sleeperUserId || (fleaflickerLeagueIds?.length ?? 0) > 0;

    const getPositionBorderClass = (pos: string | null) => {
        switch (pos) {
            case 'QB': return 'border-l-4 border-l-green-400 dark:border-l-green-500';
            case 'RB': return 'border-l-4 border-l-blue-400 dark:border-l-blue-500';
            case 'WR': return 'border-l-4 border-l-red-400 dark:border-l-red-500';
            case 'TE': return 'border-l-4 border-l-orange-400 dark:border-l-orange-500';
            case 'PICK': return 'border-l-4 border-l-zinc-300 dark:border-l-zinc-600';
            default: return 'border-l-4 border-l-zinc-200 dark:border-l-zinc-700';
        }
    };

    const getTierBgClass = (tier: number | null | undefined) => {
        if (!tier) return '';
        if (tier <= 3) return 'bg-green-100/60 dark:bg-green-900/25';
        if (tier <= 6) return 'bg-blue-100/50 dark:bg-blue-900/20';
        if (tier <= 9) return 'bg-purple-100/40 dark:bg-purple-900/15';
        if (tier <= 12) return 'bg-amber-100/40 dark:bg-amber-900/15';
        return 'bg-zinc-100/30 dark:bg-zinc-800/20';
    };

    const vffLabel = rankingsVintage ? `VFF Rankings (${rankingsVintage})` : 'VFF Rankings';
    const COLUMN_GROUPS = [
        { id: 'ros', label: 'Rest of Season' },
        { id: 'weekly', label: 'This Week' },
        { id: 'core', label: 'Core' },
        { id: 'fc', label: 'FantasyCalc' },
        { id: 'internal', label: vffLabel },
    ];
    // v2 storage key: new ROS/weekly columns were added, so returning users get
    // the refreshed default visibility instead of a stale saved set.
    const { visibleCols, columnOrder, toggle: toggleCol, reorder, show, orderedVisible } = useColumnState(COLUMNS, 'vff_players_columns_v2');

    const togglePosition = (pos: string) => {
        setActivePositions(prev => {
            const next = new Set(prev);
            next.has(pos) ? next.delete(pos) : next.add(pos);
            return next;
        });
    };

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(column);
            // Rank-style + name columns are lower/alpha-first → ascending; value desc.
            const ascByDefault: SortColumn[] = ['rank_ros_overall', 'weekly_rank', 'fc_rank', 'rank_overall', 'full_name'];
            setSortDirection(ascByDefault.includes(column) ? 'asc' : 'desc');
        }
    };

    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    const filtered = players.filter(p => {
        if (!activePositions.has(p.position || '')) return false;
        if (search.trim() && !(p.full_name || '').toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (signalFilter === 'ALL') return true;
        if (p.position === 'PICK') return false;
        const gap = getValueGap(p);
        const lbl = getValueGapLabel(gap);
        return lbl?.label === signalFilter;
    });

    const filteredPlayers = [...filtered].sort((a, b) => {
        let valA: any = (a as any)[sortColumn];
        let valB: any = (b as any)[sortColumn];
        // Nulls always sort last regardless of direction (unranked ≠ "best").
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }
        return sortDirection === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
    });

    const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'PICK'];

    const vintageTitle = rankingsVintage ? `VFF Rankings from ${rankingsVintage}` : undefined;
    const signalTitle = rankingsVintage ? `Signal based on ${rankingsVintage} VFF ranks vs. current FC market ranks` : undefined;

    const renderHeader = (key: string) => {
        const rosBg = 'bg-emerald-50/30 dark:bg-emerald-950/15';
        const weekBg = 'bg-sky-50/30 dark:bg-sky-950/15';
        const h: Record<string, React.ReactNode> = {
            ros_rank: <th key={key} className={`px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase ${rosBg} cursor-pointer group hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 transition-colors`} title="Rest-of-season overall rank (how he'll score the rest of this year)" onClick={() => handleSort('rank_ros_overall')}>ROS Rank <SortIcon column="rank_ros_overall" /></th>,
            ros_pos: <th key={key} className={`px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase ${rosBg}`} title="Rest-of-season position rank">ROS Pos</th>,
            ros_ppg: <th key={key} className={`px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase ${rosBg}`} title="Projected rest-of-season points per game">ROS PPG</th>,
            weekly_rank: <th key={key} className={`px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase ${weekBg} cursor-pointer group hover:bg-sky-100/50 dark:hover:bg-sky-900/30 transition-colors`} title={weeklyWeek != null ? `This week's start/sit rank (week ${weeklyWeek})` : "This week's start/sit rank"} onClick={() => handleSort('weekly_rank')}>Week Rank <SortIcon column="weekly_rank" /></th>,
            market_value: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('fc_value')}>Value <SortIcon column="fc_value" /></th>,
            fc_rank: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">FC Rank</th>,
            fc_pos_rank: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">FC Pos</th>,
            combined_value: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Combined</th>,
            trend_30d: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">30d Trend</th>,
            trade_freq: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Trade Freq</th>,
            internal_rank: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase bg-purple-50/20 dark:bg-purple-950/10" title={vintageTitle}>Rank</th>,
            internal_pos: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase bg-purple-50/20 dark:bg-purple-950/10" title={vintageTitle}>Pos Rank</th>,
            tier: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase bg-purple-50/20 dark:bg-purple-950/10" title={vintageTitle}>Tier</th>,
            value_gap: <th key={key} className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase" title={signalTitle}>Signal{rankingsVintage ? <span className="ml-1 text-[9px] font-normal normal-case text-purple-400">({rankingsVintage})</span> : null}</th>,
        };
        return h[key] || null;
    };

    const renderCell = (key: string, player: PlayerData) => {
        const gap = getValueGap(player);
        const gapLabel = getValueGapLabel(gap);
        const trend = player.fc_trend_30_day;
        const rosBg = 'bg-emerald-50/30 dark:bg-emerald-950/15';
        const weekBg = 'bg-sky-50/30 dark:bg-sky-950/15';

        const c: Record<string, React.ReactNode> = {
            ros_rank: <td key={key} className={`px-6 py-4 whitespace-nowrap text-right text-sm font-mono font-medium text-emerald-700 dark:text-emerald-300 ${rosBg}`}>{player.rank_ros_overall ?? '–'}</td>,
            ros_pos: <td key={key} className={`px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-emerald-700 dark:text-emerald-300 ${rosBg}`}>{player.rank_ros_pos ? `${player.position}${player.rank_ros_pos}` : '–'}</td>,
            ros_ppg: <td key={key} className={`px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300 ${rosBg}`}>{player.rank_ros_ppg != null ? Number(player.rank_ros_ppg).toFixed(1) : '–'}</td>,
            weekly_rank: <td key={key} className={`px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-sky-700 dark:text-sky-300 ${weekBg}`}>{player.weekly_rank != null ? `#${player.weekly_rank}` : '–'}</td>,
            market_value: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-900 dark:text-zinc-100">{player.fc_value?.toLocaleString() || '–'}</td>,
            fc_rank: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_rank || '–'}</td>,
            fc_pos_rank: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_position_rank ? `${player.position}${player.fc_position_rank}` : '–'}</td>,
            combined_value: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_combined_value?.toLocaleString() || '–'}</td>,
            trend_30d: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm">{trend ? <span className={`inline-flex items-center gap-1 ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-zinc-500'}`}>{trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}{trend > 0 ? '+' : ''}{trend}</span> : '–'}</td>,
            trade_freq: <td key={key} className="px-6 py-4 whitespace-nowrap text-right text-sm font-mono text-zinc-700 dark:text-zinc-300">{player.fc_trade_frequency ? `${(parseFloat(player.fc_trade_frequency) * 100).toFixed(2)}%` : '–'}</td>,
            internal_rank: <td key={key} className="px-6 py-3 whitespace-nowrap text-right bg-purple-50/20 dark:bg-purple-950/10"><div className="font-mono text-sm text-purple-700 dark:text-purple-300">{player.rank_overall || '–'}</div>{player.redraft_rank_overall && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{player.redraft_rank_overall}</div>}</td>,
            internal_pos: <td key={key} className="px-6 py-3 whitespace-nowrap text-right bg-purple-50/20 dark:bg-purple-950/10"><div className="font-mono text-sm text-purple-700 dark:text-purple-300">{player.rank_pos ? `${player.position}${player.rank_pos}` : '–'}</div>{player.redraft_rank_pos && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">{player.position}{player.redraft_rank_pos}</div>}</td>,
            tier: <td key={key} className="px-6 py-3 whitespace-nowrap text-right bg-purple-50/20 dark:bg-purple-950/10"><div className="font-mono text-sm text-purple-700 dark:text-purple-300">{player.rank_tier || '–'}</div>{player.redraft_rank_tier && <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400">T{player.redraft_rank_tier}</div>}</td>,
            value_gap: <td key={key} className="px-6 py-4 whitespace-nowrap text-right">{gapLabel ? <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${gapLabel.color}`} title={rankingsVintage ? `Based on ${rankingsVintage} VFF ranks vs. current FC market ranks` : undefined}>{gapLabel.label}</span> : <span className="text-sm text-zinc-400">–</span>}</td>,
        };
        return c[key] || null;
    };

    return (
        <div>
            {/* Filters */}
            <div className="mb-6 space-y-4">
                {/* Search */}
                <div>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search players…"
                            aria-label="Search players by name"
                            className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-white dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    {!authLoading && isLoggedIn ? (
                        <p className="text-xs text-zinc-400 mt-1.5">Click a player to see their status across all your leagues.</p>
                    ) : !authLoading ? (
                        <p className="text-xs text-zinc-400 mt-1.5">
                            <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:underline">Log in</Link> to click a player and see their status across your leagues.
                        </p>
                    ) : null}
                </div>

                {/* Position Filters */}
                <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Position</h3>
                    <div className="flex flex-wrap gap-2">
                        {POSITIONS.map(pos => {
                            const isActive = activePositions.has(pos);
                            const colors: Record<string, string> = {
                                QB: 'bg-[#9de89f] text-zinc-900', RB: 'bg-[#ffadad] text-zinc-900',
                                WR: 'bg-[#9bf6ff] text-zinc-900', TE: 'bg-[#ffd6a5] text-zinc-900',
                                K: 'bg-[#c9b6ff] text-zinc-900', DEF: 'bg-[#bdb2ff] text-zinc-900',
                                PICK: 'bg-[#6fffe9] text-zinc-900',
                            };
                            return (
                                <button key={pos} onClick={() => togglePosition(pos)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isActive ? colors[pos] : 'bg-zinc-100 text-zinc-600 opacity-40 hover:opacity-60 dark:bg-zinc-800 dark:text-zinc-400'}`}>
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
                            <button key={label} onClick={() => setSignalFilter(label)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${signalFilter === label ? activeColor : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Column Picker */}
                <ColumnPicker columns={COLUMNS} visibleCols={visibleCols} columnOrder={columnOrder} onToggle={toggleCol} onReorder={reorder} groups={COLUMN_GROUPS} />
            </div>

            {/* Results count + data freshness */}
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                <span>Showing {filteredPlayers.length} players</span>
                {(rosUpdatedLabel || weeklyWeek != null) && (
                    <>
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        <span className="text-xs text-zinc-400">
                            {rosUpdatedLabel && <>ROS ranks updated {rosUpdatedLabel}</>}
                            {rosUpdatedLabel && weeklyWeek != null && <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>}
                            {weeklyWeek != null && <>Week ranks: Week {weeklyWeek}</>}
                        </span>
                    </>
                )}
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
                                {orderedVisible.map(key => renderHeader(key))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {filteredPlayers.map((player, index) => (
                                <tr key={player.sleeper_id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${getPositionBorderClass(player.position)} ${getTierBgClass(player.rank_tier)}`}>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-zinc-400 dark:text-zinc-500 font-mono">{index + 1}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        {isLoggedIn && player.position !== 'PICK' ? (
                                            <Link
                                                href={`/portfolio/player/${player.sleeper_id}`}
                                                className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
                                                title="See status across your leagues"
                                            >
                                                {player.full_name}
                                            </Link>
                                        ) : (
                                            player.full_name
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{player.position}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">{player.team || 'FA'}</td>
                                    {orderedVisible.map(key => renderCell(key, player))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
