'use client';

import { useState } from 'react';

interface PlayerData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    fc_rank: number | null;
    fc_rank_sf: number | null;
    fc_rank_1qb: number | null;
    rank_1qb_overall: number | null;
    rank_1qb_pos: number | null;
    rank_1qb_tier: number | null;
    rank_sf_overall: number | null;
    rank_sf_pos: number | null;
    rank_sf_tier: number | null;
}

interface TeamRosterTableProps {
    players: PlayerData[];
    scoringFormat?: '1qb' | 'sf';
    positionValues: Record<string, number>;
    allLeaguePlayers: Array<{
        sleeper_id: string;
        full_name: string;
        position: string | null;
        team: string | null;
        fc_value: number | null;
        fc_rank_sf: number | null;
        fc_rank_1qb: number | null;
        rank_1qb_overall: number | null;
        rank_sf_overall: number | null;
    }>;
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
}

export function TeamRosterTable({ 
    players, 
    scoringFormat = 'sf', 
    positionValues,
    allLeaguePlayers,
    playerOwnershipMap,
    rosterToOwnerMap,
    currentRosterId
}: TeamRosterTableProps) {
    const [show1Qb, setShow1Qb] = useState(false);
    const [showSf, setShowSf] = useState(false);
    const [activePositions, setActivePositions] = useState<Set<string>>(
        new Set(['QB', 'RB', 'WR', 'TE'])
    );
    const [selectedPick, setSelectedPick] = useState<PlayerData | null>(null);
    const [tradeTargetOffset, setTradeTargetOffset] = useState(0);

    const getValueGap = (player: PlayerData, format: '1qb' | 'sf') => {
        const marketRank = format === '1qb' ? player.fc_rank_1qb : player.fc_rank_sf;
        const analysisRank = format === '1qb' ? player.rank_1qb_overall : player.rank_sf_overall;
        
        if (!marketRank || !analysisRank) return null;
        
        // Positive gap = player ranked higher in analysis than market (BUY)
        // Negative gap = player ranked lower in analysis than market (SELL)
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

    const togglePosition = (pos: string) => {
        const newSet = new Set(activePositions);
        if (newSet.has(pos)) {
            newSet.delete(pos);
        } else {
            newSet.add(pos);
        }
        setActivePositions(newSet);
    };

    const filteredPlayers = players.filter(p => activePositions.has(p.position || ''));
    const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'PICK'];

    const getTradeTargets = (pickValue: number, offset: number = 0) => {
        const tolerance = 0.05; // 5%
        const minValue = pickValue * (1 - tolerance);
        const maxValue = pickValue * (1 + tolerance);

        const targets = allLeaguePlayers
            .filter(p => {
                const value = p.fc_value || 0;
                const ownerId = playerOwnershipMap.get(p.sleeper_id);
                return value >= minValue && 
                       value <= maxValue && 
                       ownerId !== currentRosterId &&
                       p.position !== 'PICK';
            })
            .sort((a, b) => Math.abs((a.fc_value || 0) - pickValue) - Math.abs((b.fc_value || 0) - pickValue));

        const byPosition: Record<string, typeof targets> = {
            QB: targets.filter(p => p.position === 'QB').slice(0, 3 + offset),
            RB: targets.filter(p => p.position === 'RB').slice(0, 3 + offset),
            WR: targets.filter(p => p.position === 'WR').slice(0, 3 + offset),
            TE: targets.filter(p => p.position === 'TE').slice(0, 3 + offset),
        };

        return byPosition;
    };

    const getValueColorClass = (value: number | null) => {
        if (!value) return "text-zinc-900 dark:text-zinc-100";
        if (value >= 7500) return "bg-fuchsia-100/80 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-600/20";
        if (value >= 5000) return "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20";
        if (value >= 2500) return "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20";
        if (value >= 1000) return "bg-sky-100/80 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20";
        return "text-zinc-500 dark:text-zinc-400";
    };

    const getTierColorClass = (tier: number | null) => {
        if (!tier) return "text-zinc-500 dark:text-zinc-400";
        if (tier === 1) return "text-yellow-600 dark:text-yellow-400 font-bold";
        if (tier === 2) return "text-slate-500 dark:text-slate-300 font-semibold";
        if (tier === 3) return "text-amber-700/80 dark:text-amber-600/80 font-medium";
        return "text-zinc-500 dark:text-zinc-400";
    };

    const getPositionBgClass = (position: string | null) => {
        const colors: Record<string, string> = {
            QB: 'bg-[#9de89f]/30',
            RB: 'bg-[#ffadad]/30',
            WR: 'bg-[#9bf6ff]/30',
            TE: 'bg-[#ffd6a5]/30',
            PICK: 'bg-[#6fffe9]/30'
        };
        return colors[position || ''] || '';
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
                {POSITIONS.map(pos => {
                    const isActive = activePositions.has(pos);
                    const colors: Record<string, string> = {
                        QB: 'bg-[#9de89f] text-zinc-900',
                        RB: 'bg-[#ffadad] text-zinc-900',
                        WR: 'bg-[#9bf6ff] text-zinc-900',
                        TE: 'bg-[#ffd6a5] text-zinc-900',
                        PICK: 'bg-[#6fffe9] text-zinc-900'
                    };
                    return (
                        <button
                            key={pos}
                            onClick={() => togglePosition(pos)}
                            className={`px-2 sm:px-4 py-2 rounded-lg text-center sm:text-left transition-all ${
                                isActive
                                    ? colors[pos]
                                    : 'bg-zinc-100 dark:bg-zinc-800 opacity-40 hover:opacity-60'
                            }`}
                        >
                            <div className={`text-[10px] sm:text-xs font-semibold ${
                                isActive ? 'text-zinc-900' : 'text-zinc-500'
                            }`}>
                                {pos}
                            </div>
                            <div className={`font-mono font-medium text-xs sm:text-base ${
                                isActive ? 'text-zinc-900' : 'text-zinc-900 dark:text-zinc-100'
                            }`}>
                                {positionValues[pos]?.toLocaleString() || 0}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-3 items-center px-2 sm:px-0">
                <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Columns:</span>
                <button
                    onClick={() => setShow1Qb(!show1Qb)}
                    className={`px-4 py-3 min-h-[44px] min-w-[44px] rounded-full text-xs font-medium transition-colors border ${show1Qb
                        ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-700'
                        }`}
                >
                    1QB Rankings
                </button>
                <button
                    onClick={() => setShowSf(!showSf)}
                    className={`px-4 py-3 min-h-[44px] min-w-[44px] rounded-full text-xs font-medium transition-colors border ${showSf
                        ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-700'
                        }`}
                >
                    Superflex Rankings
                </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-x-auto -mx-4 sm:mx-0">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                        <tr>
                            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Player</th>
                            <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Position</th>
                            <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Team</th>
                            <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Market Value</th>

                            {show1Qb && (
                                <>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20">1QB Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20 hidden md:table-cell">1QB Pos Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20 hidden lg:table-cell">1QB Tier</th>
                                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20">Value Gap</th>
                                </>
                            )}

                            {showSf && (
                                <>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20">SF Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20 hidden md:table-cell">SF Pos Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20 hidden lg:table-cell">SF Tier</th>
                                    <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20">Value Gap</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {filteredPlayers.map((player) => (
                            <tr 
                                key={player.sleeper_id} 
                                className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${getPositionBgClass(player.position)} ${player.position === 'PICK' ? 'cursor-pointer' : ''}`}
                                onClick={() => player.position === 'PICK' ? (setSelectedPick(player), setTradeTargetOffset(0)) : null}
                            >
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                    <div className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">
                                        {player.full_name}
                                    </div>
                                    <div className="sm:hidden text-[11px] text-zinc-400 mt-0.5">
                                        {player.position} · {player.team || 'FA'}
                                    </div>
                                </td>
                                <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    {player.position}
                                </td>
                                <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    {player.team || 'FA'}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right">
                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-sm sm:text-base font-mono font-medium ${getValueColorClass(player.fc_value)}`}>
                                        {player.fc_value?.toLocaleString() || '-'}
                                    </span>
                                </td>

                                {/* 1QB Columns */}
                                {show1Qb && (
                                    <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right bg-blue-50/20 dark:bg-blue-950/10">
                                            <div className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                                {player.rank_1qb_overall || '-'}
                                            </div>
                                            <div className="md:hidden text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                                                {player.rank_1qb_pos ? `${player.position}${player.rank_1qb_pos}` : '-'}
                                                <span className="mx-1">•</span>
                                                <span className={player.rank_1qb_tier ? getTierColorClass(player.rank_1qb_tier) : ""}>
                                                    {player.rank_1qb_tier ? `T${player.rank_1qb_tier}` : '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base text-zinc-500 dark:text-zinc-400 bg-blue-50/20 dark:bg-blue-950/10 hidden md:table-cell">
                                            {player.rank_1qb_pos ? `${player.position}${player.rank_1qb_pos}` : '-'}
                                        </td>
                                        <td className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base bg-blue-50/20 dark:bg-blue-950/10 hidden lg:table-cell ${getTierColorClass(player.rank_1qb_tier)}`}>
                                            {player.rank_1qb_tier || '-'}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center bg-blue-50/20 dark:bg-blue-950/10">
                                            {(() => {
                                                const gap = getValueGap(player, '1qb');
                                                const label = gap !== null ? getValueGapLabel(gap) : null;
                                                return label ? (
                                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${label.color}`}>
                                                        {label.label}
                                                    </span>
                                                ) : '-';
                                            })()}
                                        </td>
                                    </>
                                )}

                                {/* SF Columns */}
                                {showSf && (
                                    <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right bg-purple-50/20 dark:bg-purple-950/10">
                                            <div className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                                {player.rank_sf_overall || '-'}
                                            </div>
                                            <div className="md:hidden text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                                                {player.rank_sf_pos ? `${player.position}${player.rank_sf_pos}` : '-'}
                                                <span className="mx-1">•</span>
                                                <span className={player.rank_sf_tier ? getTierColorClass(player.rank_sf_tier) : ""}>
                                                    {player.rank_sf_tier ? `T${player.rank_sf_tier}` : '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base text-zinc-500 dark:text-zinc-400 bg-purple-50/20 dark:bg-purple-950/10 hidden md:table-cell">
                                            {player.rank_sf_pos ? `${player.position}${player.rank_sf_pos}` : '-'}
                                        </td>
                                        <td className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base bg-purple-50/20 dark:bg-purple-950/10 hidden lg:table-cell ${getTierColorClass(player.rank_sf_tier)}`}>
                                            {player.rank_sf_tier || '-'}
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center bg-purple-50/20 dark:bg-purple-950/10">
                                            {(() => {
                                                const gap = getValueGap(player, 'sf');
                                                const label = gap !== null ? getValueGapLabel(gap) : null;
                                                return label ? (
                                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${label.color}`}>
                                                        {label.label}
                                                    </span>
                                                ) : '-';
                                            })()}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedPick && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPick(null)}>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedPick.full_name}</h2>
                                    <p className="text-sm text-zinc-500 mt-1">Value: {selectedPick.fc_value?.toLocaleString()} pts</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedPick(null)}
                                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <div className="p-4 sm:p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">Trade targets within 5% of pick value:</p>
                                <button
                                    onClick={() => setTradeTargetOffset(prev => prev + 3)}
                                    className="px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                                >
                                    Show More
                                </button>
                            </div>
                            
                            {Object.entries(getTradeTargets(selectedPick.fc_value || 0, tradeTargetOffset)).map(([position, targets]) => (
                                targets.length > 0 && (
                                    <div key={position}>
                                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">{position}</h3>
                                        <div className="space-y-2">
                                            {targets.map(target => {
                                                const ownerId = playerOwnershipMap.get(target.sleeper_id);
                                                const ownerName = ownerId ? rosterToOwnerMap.get(ownerId) : 'Unknown';
                                                const gap = getValueGap(target, scoringFormat);
                                                const gapLabel = gap !== null ? getValueGapLabel(gap) : null;
                                                return (
                                                    <div key={target.sleeper_id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                                                        <div className="flex-1">
                                                            <div className="font-medium text-zinc-900 dark:text-zinc-100">{target.full_name}</div>
                                                            <div className="text-xs text-zinc-500">{target.team || 'FA'} · {ownerName}</div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            {gapLabel && (
                                                                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${gapLabel.color}`}>
                                                                    {gapLabel.label}
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
        </div>
    );
}
