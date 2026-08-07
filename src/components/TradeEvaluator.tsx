'use client';

import { useState, useMemo, useEffect } from 'react';
import { ArrowRightLeft, X, ChevronDown } from 'lucide-react';
import { BasePlayer as Player } from '@/types/player';

interface Props {
    myPlayers: Player[];
    allLeaguePlayers: Player[];
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
    scoringFormat: '1qb' | 'sf';
    leagueId?: string;
    platform?: 'sleeper' | 'fleaflicker';
    keeperCount?: number;
    customRankingsMap?: Map<string, { rank: number; notes: string | null; signal: string | null; source_display_name: string }[]>;
    initialTrade?: {
        myAssets: string[];
        theirAssets: string[];
        theirTeamId?: number;
    };
}

export default function TradeEvaluator({ myPlayers, allLeaguePlayers, playerOwnershipMap, rosterToOwnerMap, currentRosterId, scoringFormat, leagueId, platform, keeperCount, customRankingsMap, initialTrade }: Props) {
    const [open, setOpen] = useState(false);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [mySend, setMySend] = useState<Set<string>>(new Set());
    const [theirSend, setTheirSend] = useState<Set<string>>(new Set());
    const [redraftWeight, setRedraftWeight] = useState(0);
    const [posFilter, setPosFilter] = useState<string>('ALL');

    const sf = scoringFormat === 'sf';

    // Build team list
    const teams = useMemo(() => {
        const teamMap = new Map<number, string>();
        rosterToOwnerMap.forEach((name, id) => {
            if (id !== currentRosterId) teamMap.set(id, name);
        });
        return Array.from(teamMap.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [rosterToOwnerMap, currentRosterId]);

    // Get other team's players
    const theirPlayers = useMemo(() => {
        if (!selectedTeamId) return [];
        return allLeaguePlayers
            .filter(p => playerOwnershipMap.get(p.sleeper_id) === selectedTeamId)
            .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
    }, [selectedTeamId, allLeaguePlayers, playerOwnershipMap]);

    // Sort my players
    const myPlayersSorted = useMemo(() => 
        [...myPlayers].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)),
    [myPlayers]);

    // Value calculation
    const getVal = (p: Player) => {
        const dynVal = p.fc_value || 0;
        if (redraftWeight === 0 || p.position === 'PICK') return dynVal;
        const rdRank = p.redraft_rank_overall;
        if (!rdRank) return dynVal;
        const rdValue = Math.max(1000, Math.round(5000 - (rdRank - 1) * 16));
        const w = redraftWeight / 100;
        return Math.round(dynVal * (1 - w) + rdValue * w);
    };

    const myTotal = useMemo(() => {
        let total = 0;
        mySend.forEach(id => { const p = myPlayers.find(pl => pl.sleeper_id === id); if (p) total += getVal(p); });
        return total;
    }, [mySend, myPlayers, redraftWeight]);

    const theirTotal = useMemo(() => {
        let total = 0;
        theirSend.forEach(id => { const p = theirPlayers.find(pl => pl.sleeper_id === id); if (p) total += getVal(p); });
        return total;
    }, [theirSend, theirPlayers, redraftWeight]);

    const diff = theirTotal - myTotal;
    const diffPct = myTotal > 0 ? Math.round((diff / myTotal) * 100) : 0;
    const verdict = Math.abs(diffPct) <= 10 ? 'EVEN' : diff > 0 ? 'WIN' : 'LOSS';
    const verdictColor = verdict === 'WIN' ? 'text-green-600' : verdict === 'LOSS' ? 'text-red-500' : 'text-amber-600';

    // Auction values
    const myAuction = useMemo(() => {
        let total = 0;
        mySend.forEach(id => { const p = myPlayers.find(pl => pl.sleeper_id === id); if (p) total += p.redraft_auction_value || 0; });
        return total;
    }, [mySend, myPlayers]);

    const theirAuction = useMemo(() => {
        let total = 0;
        theirSend.forEach(id => { const p = theirPlayers.find(pl => pl.sleeper_id === id); if (p) total += p.redraft_auction_value || 0; });
        return total;
    }, [theirSend, theirPlayers]);

    // Toggle asset
    const toggleMy = (id: string) => { const next = new Set(mySend); next.has(id) ? next.delete(id) : next.add(id); setMySend(next); };
    const toggleTheir = (id: string) => { const next = new Set(theirSend); next.has(id) ? next.delete(id) : next.add(id); setTheirSend(next); };

    // Reset
    const reset = () => { setMySend(new Set()); setTheirSend(new Set()); setSelectedTeamId(null); setPosFilter('ALL'); };

    // Listen for custom events from PendingTrades
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail) return;
            if (detail.myAssets) setMySend(new Set(detail.myAssets));
            if (detail.theirAssets) setTheirSend(new Set(detail.theirAssets));
            if (detail.theirTeamId) setSelectedTeamId(detail.theirTeamId);
            // Try to infer team from their assets
            if (!detail.theirTeamId && detail.theirAssets?.length > 0) {
                const firstAsset = detail.theirAssets[0];
                const teamId = playerOwnershipMap.get(firstAsset);
                if (teamId) setSelectedTeamId(teamId);
            }
            setOpen(true);
        };
        window.addEventListener('vff:open-trade-evaluator', handler);
        return () => window.removeEventListener('vff:open-trade-evaluator', handler);
    }, [playerOwnershipMap]);

    // Initial trade prop
    useEffect(() => {
        if (!initialTrade) return;
        if (initialTrade.myAssets) setMySend(new Set(initialTrade.myAssets));
        if (initialTrade.theirAssets) setTheirSend(new Set(initialTrade.theirAssets));
        if (initialTrade.theirTeamId) setSelectedTeamId(initialTrade.theirTeamId);
        setOpen(true);
    }, [initialTrade]);

    // Filter players by position
    const filterPlayers = (players: Player[]) => {
        if (posFilter === 'ALL') return players;
        return players.filter(p => p.position === posFilter);
    };

    // Player detail state
    const [detailPlayer, setDetailPlayer] = useState<Player | null>(null);
    // Advanced comparison state
    const [comparing, setComparing] = useState(false);
    const [comparisonData, setComparisonData] = useState<Record<string, any> | null>(null);

    const fetchComparison = async () => {
        setComparing(true);
        const playerIds = [
            ...Array.from(mySend),
            ...Array.from(theirSend),
        ].filter(id => {
            const p = [...myPlayers, ...theirPlayers].find(pl => pl.sleeper_id === id);
            return p && p.position !== 'PICK';
        });

        const results: Record<string, any> = {};
        await Promise.all(playerIds.map(async (id) => {
            try {
                const res = await fetch(`/api/player-advanced-stats?sleeper_id=${id}`);
                if (res.ok) {
                    const data = await res.json();
                    results[id] = data;
                }
            } catch {}
        }));
        setComparisonData(results);
        setComparing(false);
    };

    // Asset row component
    const AssetRow = ({ player, selected, onToggle }: { player: Player; selected: boolean; onToggle: () => void }) => {
        const isDetail = detailPlayer?.sleeper_id === player.sleeper_id;
        const age = player.age || (player.years_exp != null ? player.years_exp + 22 : null);
        return (
            <div>
                <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                    selected
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                }`}>
                    <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left min-w-0">
                        {selected && <span className="text-indigo-500 text-xs">✓</span>}
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                            player.position === 'QB' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            player.position === 'RB' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            player.position === 'WR' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            player.position === 'TE' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>{player.position || 'PICK'}</span>
                        <span className="text-xs text-zinc-900 dark:text-zinc-100 flex-1 truncate">{player.full_name}</span>
                    </button>
                    <span className="text-[10px] font-mono text-zinc-500">{(player.fc_value || 0).toLocaleString()}</span>
                    {player.redraft_auction_value ? (
                        <span className="text-[10px] font-mono text-amber-600 w-7 text-right">${player.redraft_auction_value}</span>
                    ) : (
                        <span className="text-[10px] font-mono text-zinc-300 dark:text-zinc-700 w-7 text-right">—</span>
                    )}
                    {player.position !== 'PICK' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setDetailPlayer(isDetail ? null : player); }}
                            className={`text-[9px] px-1 py-0.5 rounded ${isDetail ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                        >
                            ℹ️
                        </button>
                    )}
                </div>
                {/* Expandable detail */}
                {isDetail && player.position !== 'PICK' && (
                    <div className="mx-2 mb-1 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-md text-[10px] space-y-1 border border-zinc-100 dark:border-zinc-800">
                        <div className="flex gap-3 text-zinc-600 dark:text-zinc-400">
                            {age && <span>Age: <span className="font-medium text-zinc-900 dark:text-zinc-100">{age}</span></span>}
                            {player.team && <span>Team: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.team}</span></span>}
                            {player.years_exp != null && <span>Exp: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.years_exp} yr{player.years_exp !== 1 ? 's' : ''}</span></span>}
                        </div>
                        <div className="flex gap-3 text-zinc-600 dark:text-zinc-400">
                            {player.fc_trend_30_day != null && player.fc_trend_30_day !== 0 && (
                                <span>30d trend: <span className={`font-medium ${player.fc_trend_30_day > 0 ? 'text-green-600' : 'text-red-500'}`}>{player.fc_trend_30_day > 0 ? '+' : ''}{player.fc_trend_30_day}</span></span>
                            )}
                            {player.fc_trade_frequency != null && player.fc_trade_frequency > 0 && (
                                <span>Trade freq: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.fc_trade_frequency}%</span></span>
                            )}
                        </div>
                        <div className="flex gap-3 text-zinc-600 dark:text-zinc-400">
                            {sf ? (
                                <>
                                    {player.fc_rank_sf && <span>FC Rank: <span className="font-medium text-zinc-900 dark:text-zinc-100">#{player.fc_rank_sf}</span></span>}
                                    {player.rank_sf_overall && <span>VFF: <span className="font-medium text-zinc-900 dark:text-zinc-100">#{player.rank_sf_overall}</span></span>}
                                    {player.rank_sf_tier && <span>Tier: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.rank_sf_tier}</span></span>}
                                </>
                            ) : (
                                <>
                                    {player.fc_rank_1qb && <span>FC Rank: <span className="font-medium text-zinc-900 dark:text-zinc-100">#{player.fc_rank_1qb}</span></span>}
                                    {player.rank_1qb_overall && <span>VFF: <span className="font-medium text-zinc-900 dark:text-zinc-100">#{player.rank_1qb_overall}</span></span>}
                                    {player.rank_1qb_tier && <span>Tier: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.rank_1qb_tier}</span></span>}
                                </>
                            )}
                            {player.redraft_rank_overall && <span>Redraft: <span className="font-medium text-zinc-900 dark:text-zinc-100">#{player.redraft_rank_overall}</span></span>}
                        </div>
                        {player.zap_score != null && !player.zap_stale && (
                            <div className="flex gap-3 text-zinc-600 dark:text-zinc-400">
                                <span>ZAP: <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.zap_score}</span></span>
                                {player.zap_category && <span className="font-medium">{player.zap_category}</span>}
                            </div>
                        )}
                        {player.zap_ai?.summary && (
                            <div className="text-[9px] text-zinc-500 italic mt-0.5">{player.zap_ai.summary}</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (!open) {
        return (
            <button id="trade-evaluator" onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors">
                <ArrowRightLeft size={13} />
                Trade Evaluator
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-start justify-center sm:pt-12 p-0 sm:p-4" onClick={() => { setOpen(false); reset(); }}>
            <div className="bg-white dark:bg-zinc-900 rounded-t-xl sm:rounded-xl shadow-2xl ring-1 ring-zinc-900/5 p-4 sm:p-6 w-full sm:max-w-3xl h-[92vh] sm:h-auto sm:max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Trade Evaluator</h3>
                    <button onClick={() => { setOpen(false); reset(); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                        <X size={18} />
                    </button>
                </div>

                {/* Team Selector */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
                    <span className="text-xs text-zinc-500">Trade with:</span>
                    <select
                        value={selectedTeamId || ''}
                        onChange={e => { setSelectedTeamId(Number(e.target.value) || null); setTheirSend(new Set()); }}
                        className="flex-1 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 sm:py-1.5 text-zinc-900 dark:text-zinc-100"
                    >
                        <option value="">Select a team...</option>
                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {/* Position filter */}
                    <div className="flex gap-1">
                        {['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK'].map(pos => (
                            <button key={pos} onClick={() => setPosFilter(pos)}
                                className={`px-2 py-1.5 sm:px-1.5 sm:py-0.5 text-[10px] sm:text-[9px] font-bold rounded ${posFilter === pos ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                            >{pos}</button>
                        ))}
                    </div>
                </div>

                {/* Value Blend Slider */}
                <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg mb-4">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-purple-500 uppercase">Dynasty</span>
                        <span className="text-[9px] font-bold text-zinc-400">{redraftWeight === 0 ? 'Pure Dynasty' : redraftWeight === 100 ? 'Pure Redraft' : `${100 - redraftWeight}/${redraftWeight}`}</span>
                        <span className="text-[9px] font-bold text-amber-500 uppercase">Redraft</span>
                    </div>
                    <input type="range" min={0} max={100} step={10} value={redraftWeight} onChange={e => setRedraftWeight(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500" />
                </div>

                {/* Two panels */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Left: Your team */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase">You Send</h4>
                            <div className="text-right">
                                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{myTotal.toLocaleString()}</span>
                                {myAuction > 0 && <span className="text-[9px] font-mono text-amber-600 ml-1">${myAuction}</span>}
                            </div>
                        </div>
                        <div className="space-y-0.5 max-h-64 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg p-1.5">
                            {filterPlayers(myPlayersSorted).map(p => (
                                <AssetRow key={p.sleeper_id} player={p} selected={mySend.has(p.sleeper_id)} onToggle={() => toggleMy(p.sleeper_id)} />
                            ))}
                        </div>
                    </div>

                    {/* Right: Their team */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase">You Receive</h4>
                            <div className="text-right">
                                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{theirTotal.toLocaleString()}</span>
                                {theirAuction > 0 && <span className="text-[9px] font-mono text-amber-600 ml-1">${theirAuction}</span>}
                            </div>
                        </div>
                        <div className="space-y-0.5 max-h-64 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg p-1.5">
                            {selectedTeamId ? (
                                filterPlayers(theirPlayers).map(p => (
                                    <AssetRow key={p.sleeper_id} player={p} selected={theirSend.has(p.sleeper_id)} onToggle={() => toggleTheir(p.sleeper_id)} />
                                ))
                            ) : (
                                <div className="text-center text-xs text-zinc-400 py-8">Select a team above</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Verdict */}
                {(mySend.size > 0 || theirSend.size > 0) && (
                    <div className={`mt-4 p-3 rounded-lg border ${
                        verdict === 'WIN' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' :
                        verdict === 'LOSS' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800' :
                        'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                    }`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <span className={`text-sm font-bold ${verdictColor}`}>
                                    {verdict === 'WIN' ? '✓ You win' : verdict === 'LOSS' ? '✗ You lose' : '⚖️ Even'}
                                </span>
                                <span className="text-xs text-zinc-500 ml-2">
                                    {diff > 0 ? '+' : ''}{diff.toLocaleString()} ({diffPct > 0 ? '+' : ''}{diffPct}%)
                                </span>
                            </div>
                            <div className="text-right text-[10px] text-zinc-500">
                                <div>Dynasty: <span className="font-mono">{myTotal.toLocaleString()} → {theirTotal.toLocaleString()}</span></div>
                                <div>Auction: <span className="font-mono text-amber-600">${myAuction} → ${theirAuction}</span></div>
                            </div>
                        </div>
                        {mySend.size >= 2 && (
                            <div className="text-[9px] text-zinc-500 mt-1">
                                ⚠️ Multi-piece deals typically require 10-30% overpay (consolidation tax)
                            </div>
                        )}
                    </div>
                )}

                {/* Selected assets summary */}
                {(mySend.size > 0 || theirSend.size > 0) && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px]">
                        <div>
                            {Array.from(mySend).map(id => {
                                const p = myPlayers.find(pl => pl.sleeper_id === id);
                                return p ? <div key={id} className="text-zinc-600 dark:text-zinc-400">↑ {p.full_name} ({(p.fc_value || 0).toLocaleString()})</div> : null;
                            })}
                        </div>
                        <div>
                            {Array.from(theirSend).map(id => {
                                const p = theirPlayers.find(pl => pl.sleeper_id === id);
                                return p ? <div key={id} className="text-zinc-600 dark:text-zinc-400">↓ {p.full_name} ({(p.fc_value || 0).toLocaleString()})</div> : null;
                            })}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center justify-between">
                    <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                        Clear All
                    </button>
                    <div className="flex items-center gap-2">
                        {(mySend.size > 0 || theirSend.size > 0) && (
                            <button
                                onClick={fetchComparison}
                                disabled={comparing}
                                className="px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {comparing ? 'Loading...' : '📊 Deep Comparison'}
                            </button>
                        )}
                        <button
                            onClick={() => { setOpen(false); reset(); }}
                            className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                        >
                            Done
                        </button>
                    </div>
                </div>

                {/* Deep Comparison Panel */}
                {comparisonData && (
                    <div className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-4">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase mb-3">📊 Advanced Comparison</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* You Send */}
                            <div>
                                <div className="text-[9px] font-bold text-zinc-400 uppercase mb-2">You Send</div>
                                {Array.from(mySend).map(id => {
                                    const p = myPlayers.find(pl => pl.sleeper_id === id);
                                    if (!p || p.position === 'PICK') return null;
                                    const stats = comparisonData[id];
                                    const latest = stats?.stats?.[0];
                                    const age = p.age || (p.years_exp != null ? p.years_exp + 22 : null);
                                    return (
                                        <div key={id} className="mb-3 p-2 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-800 rounded-lg">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                                    p.position === 'QB' ? 'bg-red-100 text-red-700' : p.position === 'RB' ? 'bg-blue-100 text-blue-700' : p.position === 'WR' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                                                }`}>{p.position}</span>
                                                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                                {age && <span className="text-[9px] text-zinc-400">Age {age}</span>}
                                            </div>
                                            {latest ? (
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                                                    {latest.target_share && <div className="text-zinc-600 dark:text-zinc-400">Tgt Share: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{(parseFloat(latest.target_share) * 100).toFixed(1)}%</span></div>}
                                                    {latest.avg_separation && <div className="text-zinc-600 dark:text-zinc-400">Separation: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.avg_separation).toFixed(1)}</span></div>}
                                                    {latest.rush_yards_over_expected_per_att && <div className="text-zinc-600 dark:text-zinc-400">RYOE/att: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.rush_yards_over_expected_per_att).toFixed(2)}</span></div>}
                                                    {latest.offense_snap_pct && <div className="text-zinc-600 dark:text-zinc-400">Snap%: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{(parseFloat(latest.offense_snap_pct) * 100).toFixed(0)}%</span></div>}
                                                    {latest.games_played && <div className="text-zinc-600 dark:text-zinc-400">Games: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{latest.games_played}</span></div>}
                                                    {latest.fantasy_points_ppr && <div className="text-zinc-600 dark:text-zinc-400">PPR pts: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.fantasy_points_ppr).toFixed(0)}</span></div>}
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-zinc-400 italic">No advanced stats available</div>
                                            )}
                                            {stats?.breakout && stats.breakout.score > 30 && (
                                                <div className="mt-1 text-[9px] text-green-600 font-medium">📈 Breakout detected (score: {stats.breakout.score})</div>
                                            )}
                                            {stats?.regression?.length > 0 && (
                                                <div className="mt-1 text-[9px] text-amber-600 font-medium">⚠️ Regression flags: {stats.regression.map((r: any) => r.type).join(', ')}</div>
                                            )}
                                            {p.position === 'WR' && customRankingsMap && (() => {
                                                const rankings = customRankingsMap.get(id);
                                                if (!rankings || rankings.length === 0) return null;
                                                return rankings.map((r, ri) => (
                                                    <div key={ri} className="mt-1 p-1.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] text-zinc-400">{r.source_display_name}</span>
                                                            <span className="text-[9px] font-bold text-zinc-700 dark:text-zinc-300">#{r.rank}</span>
                                                            {r.signal && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                                                r.signal === 'Super Buy' ? 'bg-green-600 text-white' :
                                                                r.signal === 'Buy' ? 'bg-green-500 text-white' :
                                                                r.signal === 'Sell' ? 'bg-red-500 text-white' :
                                                                r.signal === 'Super Sell' ? 'bg-red-600 text-white' :
                                                                'bg-zinc-400 text-white'
                                                            }`}>{r.signal}</span>}
                                                        </div>
                                                        {r.notes && <div className="text-[8px] text-zinc-500 mt-0.5 leading-tight">{r.notes}</div>}
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                            {/* You Receive */}
                            <div>
                                <div className="text-[9px] font-bold text-zinc-400 uppercase mb-2">You Receive</div>
                                {Array.from(theirSend).map(id => {
                                    const p = theirPlayers.find(pl => pl.sleeper_id === id);
                                    if (!p || p.position === 'PICK') return null;
                                    const stats = comparisonData[id];
                                    const latest = stats?.stats?.[0];
                                    const age = p.age || (p.years_exp != null ? p.years_exp + 22 : null);
                                    return (
                                        <div key={id} className="mb-3 p-2 bg-green-50 dark:bg-green-950/10 border border-green-200 dark:border-green-800 rounded-lg">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                                    p.position === 'QB' ? 'bg-red-100 text-red-700' : p.position === 'RB' ? 'bg-blue-100 text-blue-700' : p.position === 'WR' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'
                                                }`}>{p.position}</span>
                                                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                                {age && <span className="text-[9px] text-zinc-400">Age {age}</span>}
                                            </div>
                                            {latest ? (
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                                                    {latest.target_share && <div className="text-zinc-600 dark:text-zinc-400">Tgt Share: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{(parseFloat(latest.target_share) * 100).toFixed(1)}%</span></div>}
                                                    {latest.avg_separation && <div className="text-zinc-600 dark:text-zinc-400">Separation: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.avg_separation).toFixed(1)}</span></div>}
                                                    {latest.rush_yards_over_expected_per_att && <div className="text-zinc-600 dark:text-zinc-400">RYOE/att: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.rush_yards_over_expected_per_att).toFixed(2)}</span></div>}
                                                    {latest.offense_snap_pct && <div className="text-zinc-600 dark:text-zinc-400">Snap%: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{(parseFloat(latest.offense_snap_pct) * 100).toFixed(0)}%</span></div>}
                                                    {latest.games_played && <div className="text-zinc-600 dark:text-zinc-400">Games: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{latest.games_played}</span></div>}
                                                    {latest.fantasy_points_ppr && <div className="text-zinc-600 dark:text-zinc-400">PPR pts: <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{parseFloat(latest.fantasy_points_ppr).toFixed(0)}</span></div>}
                                                </div>
                                            ) : (
                                                <div className="text-[9px] text-zinc-400 italic">No advanced stats available</div>
                                            )}
                                            {stats?.breakout && stats.breakout.score > 30 && (
                                                <div className="mt-1 text-[9px] text-green-600 font-medium">📈 Breakout detected (score: {stats.breakout.score})</div>
                                            )}
                                            {stats?.regression?.length > 0 && (
                                                <div className="mt-1 text-[9px] text-amber-600 font-medium">⚠️ Regression flags: {stats.regression.map((r: any) => r.type).join(', ')}</div>
                                            )}
                                            {p.position === 'WR' && customRankingsMap && (() => {
                                                const rankings = customRankingsMap.get(id);
                                                if (!rankings || rankings.length === 0) return null;
                                                return rankings.map((r, ri) => (
                                                    <div key={ri} className="mt-1 p-1.5 bg-white dark:bg-zinc-900 rounded border border-zinc-200 dark:border-zinc-700">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] text-zinc-400">{r.source_display_name}</span>
                                                            <span className="text-[9px] font-bold text-zinc-700 dark:text-zinc-300">#{r.rank}</span>
                                                            {r.signal && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                                                r.signal === 'Super Buy' ? 'bg-green-600 text-white' :
                                                                r.signal === 'Buy' ? 'bg-green-500 text-white' :
                                                                r.signal === 'Sell' ? 'bg-red-500 text-white' :
                                                                r.signal === 'Super Sell' ? 'bg-red-600 text-white' :
                                                                'bg-zinc-400 text-white'
                                                            }`}>{r.signal}</span>}
                                                        </div>
                                                        {r.notes && <div className="text-[8px] text-zinc-500 mt-0.5 leading-tight">{r.notes}</div>}
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
