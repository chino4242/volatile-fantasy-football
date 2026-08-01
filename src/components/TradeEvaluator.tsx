'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowRightLeft, X, Save } from 'lucide-react';

interface Player {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    redraft_rank_overall?: number | null;
    redraft_auction_value?: number | null;
}

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
}

export default function TradeEvaluator({ myPlayers, allLeaguePlayers, playerOwnershipMap, rosterToOwnerMap, currentRosterId, scoringFormat, leagueId, platform, keeperCount }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [myAssets, setMyAssets] = useState<Set<string>>(new Set());
    const [theirAssets, setTheirAssets] = useState<Set<string>>(new Set());
    const [redraftWeight, setRedraftWeight] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [mode, setMode] = useState<'acquire' | 'trade-away'>('acquire');
    const [tradeAwayPlayer, setTradeAwayPlayer] = useState<Player | null>(null);
    const [tradeAwaySearch, setTradeAwaySearch] = useState('');
    const [tradeAwayPackage, setTradeAwayPackage] = useState<Set<string>>(new Set());

    const sf = scoringFormat === 'sf';

    const getEffectiveValue = (player: Player): number => {
        const dynVal = player.fc_value || 0;
        if (redraftWeight === 0) return dynVal;
        const rdRank = player.redraft_rank_overall;
        if (!rdRank) return dynVal;
        // Redraft value: linear decay — rank 1 = 5000, rank 250 = 1000
        // Reflects real production gaps (rank 1 WR ~17ppg, rank 20 ~14ppg = ~20% gap, not 5x)
        const rdValue = Math.max(1000, Math.round(5000 - (rdRank - 1) * 16));
        const w = redraftWeight / 100;
        return Math.round(dynVal * (1 - w) + rdValue * w);
    };

    const otherTeamPlayers = useMemo(() => {
        if (!selectedPlayer) return [];
        const ownerId = playerOwnershipMap.get(selectedPlayer.sleeper_id);
        if (!ownerId) {
            // Fallback: can't determine team, show no additional assets
            return [];
        }
        return allLeaguePlayers.filter(p => {
            const pOwner = playerOwnershipMap.get(p.sleeper_id);
            return pOwner === ownerId && p.sleeper_id !== selectedPlayer.sleeper_id && p.position !== 'PICK';
        });
    }, [selectedPlayer, allLeaguePlayers, playerOwnershipMap]);

    const searchResults = useMemo(() => {
        if (search.length < 2) return [];
        const q = search.toLowerCase();
        const myIds = new Set(myPlayers.map(p => p.sleeper_id));
        return allLeaguePlayers
            .filter(p => {
                const name = (p.full_name || '').toLowerCase();
                return !myIds.has(p.sleeper_id) && p.position !== 'PICK' && name.includes(q);
            })
            .sort((a, b) => (getEffectiveValue(b)) - (getEffectiveValue(a)))
            .slice(0, 15);
    }, [search, allLeaguePlayers, myPlayers, redraftWeight]);

    const myTotal = useMemo(() => {
        let total = 0;
        myAssets.forEach(id => {
            const p = myPlayers.find(pl => pl.sleeper_id === id);
            if (p) total += p.position === 'PICK' ? (p.fc_value || 0) : getEffectiveValue(p);
        });
        return total;
    }, [myAssets, myPlayers, redraftWeight]);

    const theirTotal = useMemo(() => {
        let total = selectedPlayer ? getEffectiveValue(selectedPlayer) : 0;
        theirAssets.forEach(id => {
            const p = otherTeamPlayers.find(pl => pl.sleeper_id === id);
            if (p) total += p.position === 'PICK' ? (p.fc_value || 0) : getEffectiveValue(p);
        });
        return total;
    }, [theirAssets, selectedPlayer, otherTeamPlayers, redraftWeight]);

    const diff = myTotal - theirTotal;
    const diffPct = theirTotal > 0 ? Math.round((diff / theirTotal) * 100) : 0;

    const toggleAsset = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
        const next = new Set(set);
        next.has(id) ? next.delete(id) : next.add(id);
        setFn(next);
    };

    const resetTrade = () => {
        setSelectedPlayer(null);
        setMyAssets(new Set());
        setTheirAssets(new Set());
        setSearch('');
        setSaved(false);
        setTradeAwayPlayer(null);
        setTradeAwaySearch('');
        setTradeAwayPackage(new Set());
    };

    const saveDeal = async () => {
        if (!leagueId || !platform || !selectedPlayer || myAssets.size === 0) return;
        setSaving(true);
        try {
            const targetOwnerId = playerOwnershipMap.get(selectedPlayer.sleeper_id);
            const targetTeamName = targetOwnerId ? rosterToOwnerMap.get(targetOwnerId) : undefined;
            const theirAssetIds = [selectedPlayer.sleeper_id, ...Array.from(theirAssets)];
            
            await fetch('/api/trade-scenarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    league_id: leagueId,
                    platform,
                    my_assets: Array.from(myAssets),
                    their_assets: theirAssetIds,
                    target_team_name: targetTeamName,
                    target_team_id: targetOwnerId?.toString(),
                    my_value: myTotal,
                    their_value: theirTotal,
                }),
            });
            setSaved(true);
        } catch (err) {
            console.error('Failed to save trade:', err);
        } finally {
            setSaving(false);
        }
    };

    // Trade Away suggestions: find what the package could acquire
    const tradeSuggestions = useMemo(() => {
        if (tradeAwayPackage.size === 0) return [];
        
        // Calculate total package value
        const packagePlayers = myPlayers.filter(p => tradeAwayPackage.has(p.sleeper_id));
        const packageValue = packagePlayers.reduce((sum, p) => sum + getEffectiveValue(p), 0);
        if (packageValue === 0) return [];

        // Consolidation tax: multiple pieces for one star costs a premium
        // "Three dimes don't equal a quarter"
        const playerCount = packagePlayers.filter(p => p.position !== 'PICK').length;
        const pickCount = packagePlayers.filter(p => p.position === 'PICK').length;
        const totalPieces = playerCount + pickCount;

        let consolidationTax = 0;
        if (totalPieces === 2) consolidationTax = pickCount >= 1 ? 0.10 : 0.15;
        else if (totalPieces === 3) consolidationTax = pickCount >= 2 ? 0.15 : pickCount >= 1 ? 0.22 : 0.30;
        else if (totalPieces >= 4) consolidationTax = pickCount >= 2 ? 0.25 : 0.40;

        // What you can realistically target = package value minus the tax
        const effectiveValue = Math.round(packageValue * (1 - consolidationTax));
        
        // Tolerance around the effective value
        const tolerance = effectiveValue < 2000 ? 0.35 : effectiveValue < 5000 ? 0.20 : 0.15;
        const minRange = 500;
        const minValue = Math.max(0, effectiveValue * (1 - tolerance) - minRange);
        const maxValue = effectiveValue * (1 + tolerance) + minRange;

        // Group all league players by team
        const teamRosters = new Map<number, Player[]>();
        allLeaguePlayers.forEach(p => {
            const ownerId = playerOwnershipMap.get(p.sleeper_id);
            if (ownerId && ownerId !== currentRosterId) {
                if (!teamRosters.has(ownerId)) teamRosters.set(ownerId, []);
                teamRosters.get(ownerId)!.push(p);
            }
        });

        const suggestions: { teamId: number; teamName: string; targets: { player: Player; value: number; diff: number; isPick: boolean }[] }[] = [];

        teamRosters.forEach((roster, teamId) => {
            const teamName = rosterToOwnerMap.get(teamId) || `Team ${teamId}`;

            // Find players AND picks on this team worth the effective value range
            const targets = roster
                .filter(p => {
                    const v = getEffectiveValue(p);
                    return v >= minValue && v <= maxValue;
                })
                .map(p => ({ player: p, value: getEffectiveValue(p), diff: getEffectiveValue(p) - effectiveValue, isPick: p.position === 'PICK' }))
                .sort((a, b) => {
                    // Picks first (since user wants capital), then by closest value
                    if (a.isPick && !b.isPick) return -1;
                    if (!a.isPick && b.isPick) return 1;
                    return Math.abs(a.diff) - Math.abs(b.diff);
                })
                .slice(0, 4);

            // Keeper viability check — only for player targets (picks don't need keeper slots)
            const playerTargets = targets.filter(t => !t.isPick);
            if (keeperCount && keeperCount > 0 && playerTargets.length > 0 && targets.every(t => !t.isPick) === false) {
                const theirValues = roster.filter(p => p.position !== 'PICK').map(p => getEffectiveValue(p)).sort((a, b) => b - a);
                const keeperCutoff = theirValues[keeperCount - 1] || 0;
                const bestInPackage = Math.max(...packagePlayers.map(p => getEffectiveValue(p)));
                // Only filter if ALL targets are players and our best piece doesn't make their keepers
                if (playerTargets.length === targets.length && bestInPackage < keeperCutoff) return;
            }

            if (targets.length > 0) {
                suggestions.push({ teamId, teamName, targets });
            }
        });

        return suggestions
            .sort((a, b) => Math.abs(a.targets[0].diff) - Math.abs(b.targets[0].diff))
            .slice(0, 6);
    }, [tradeAwayPackage, myPlayers, allLeaguePlayers, playerOwnershipMap, currentRosterId, rosterToOwnerMap, redraftWeight, keeperCount]);

    // Filter my players for the trade-away search
    const tradeAwayResults = useMemo(() => {
        if (tradeAwaySearch.length < 1) return myPlayers.sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a)).slice(0, 20);
        const q = tradeAwaySearch.toLowerCase();
        return myPlayers.filter(p => p.full_name.toLowerCase().includes(q)).sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a));
    }, [tradeAwaySearch, myPlayers, redraftWeight]);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors">
                <ArrowRightLeft size={13} />
                Trade Evaluator
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-12 sm:pt-20 p-4" onClick={() => { setOpen(false); resetTrade(); }}>
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl ring-1 ring-zinc-900/5 p-4 sm:p-6 space-y-4 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Trade Evaluator</h3>
                <button onClick={() => { setOpen(false); resetTrade(); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                    <X size={18} />
                </button>
            </div>

            {/* Value Blend Slider */}
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold text-purple-500 uppercase">Dynasty</span>
                    <span className="text-[9px] font-bold text-zinc-400">{redraftWeight === 0 ? 'Pure Dynasty' : redraftWeight === 100 ? 'Pure Redraft' : redraftWeight === 50 ? 'Combined' : `${100 - redraftWeight}/${redraftWeight}`}</span>
                    <span className="text-[9px] font-bold text-amber-500 uppercase">Redraft</span>
                </div>
                <input type="range" min={0} max={100} step={10} value={redraftWeight} onChange={e => setRedraftWeight(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500" />
            </div>

            {/* Mode Tabs */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-lg">
                <button
                    onClick={() => { setMode('acquire'); resetTrade(); }}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${mode === 'acquire' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                    Acquire Player
                </button>
                <button
                    onClick={() => { setMode('trade-away'); resetTrade(); }}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${mode === 'trade-away' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                    Trade Away
                </button>
            </div>

            {/* Trade Away Mode */}
            {mode === 'trade-away' && (
                <div className="space-y-3">
                    {/* Package builder */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase">Your Package</div>
                            {tradeAwayPackage.size > 0 && (
                                <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                    Total: {myPlayers.filter(p => tradeAwayPackage.has(p.sleeper_id)).reduce((sum, p) => sum + getEffectiveValue(p), 0).toLocaleString()}
                                </div>
                            )}
                        </div>

                        {/* Selected package chips */}
                        {tradeAwayPackage.size > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                                {myPlayers.filter(p => tradeAwayPackage.has(p.sleeper_id)).map(p => (
                                    <button key={p.sleeper_id} onClick={() => { const next = new Set(tradeAwayPackage); next.delete(p.sleeper_id); setTradeAwayPackage(next); }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg">
                                        {p.full_name} <span className="text-red-400">×</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Search + roster list */}
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input type="text" placeholder="Search your roster..." value={tradeAwaySearch} onChange={e => setTradeAwaySearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:border-indigo-500 outline-none" autoFocus />
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-0.5">
                            {tradeAwayResults.filter(p => !tradeAwayPackage.has(p.sleeper_id)).map(p => (
                                <button key={p.sleeper_id} onClick={() => { const next = new Set(tradeAwayPackage); next.add(p.sleeper_id); setTradeAwayPackage(next); }}
                                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex justify-between items-center">
                                    <div>
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                        <span className="text-[10px] text-zinc-500 ml-2">{p.position} · {p.team || 'FA'}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-zinc-500">{getEffectiveValue(p).toLocaleString()}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Suggestions */}
                    {tradeAwayPackage.size > 0 && (
                        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                            {/* Package summary with consolidation info */}
                            {(() => {
                                const pkgPlayers = myPlayers.filter(p => tradeAwayPackage.has(p.sleeper_id));
                                const pkgValue = pkgPlayers.reduce((sum, p) => sum + getEffectiveValue(p), 0);
                                const pCount = pkgPlayers.filter(p => p.position !== 'PICK').length;
                                const pkCount = pkgPlayers.filter(p => p.position === 'PICK').length;
                                const total = pCount + pkCount;
                                let tax = 0;
                                if (total === 2) tax = pkCount >= 1 ? 0.10 : 0.15;
                                else if (total === 3) tax = pkCount >= 2 ? 0.15 : pkCount >= 1 ? 0.22 : 0.30;
                                else if (total >= 4) tax = pkCount >= 2 ? 0.25 : 0.40;
                                const effective = Math.round(pkgValue * (1 - tax));
                                return total > 1 ? (
                                    <div className="text-[10px] text-zinc-500 mb-2 bg-amber-50 dark:bg-amber-950/20 px-2 py-1.5 rounded border border-amber-200 dark:border-amber-800">
                                        <span className="font-medium text-amber-700 dark:text-amber-400">{total}-for-1 consolidation tax: -{Math.round(tax * 100)}%</span>
                                        <span className="ml-2">Package: {pkgValue.toLocaleString()} → Realistic target: ~{effective.toLocaleString()}</span>
                                    </div>
                                ) : null;
                            })()}
                            {tradeSuggestions.length === 0 ? (
                                <p className="text-xs text-zinc-500 text-center py-3">No realistic targets found for this package value{keeperCount ? ' (filtered by keeper viability)' : ''}.</p>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">You could target</div>
                                    {tradeSuggestions.map(suggestion => (
                                        <div key={suggestion.teamId} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                                            <div className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/50">
                                                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{suggestion.teamName}</span>
                                            </div>
                                            <div className="px-3 py-1.5 space-y-1">
                                                {suggestion.targets.map((t, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setMode('acquire');
                                                            setSelectedPlayer(t.player);
                                                            setMyAssets(new Set(tradeAwayPackage));
                                                            setTheirAssets(new Set());
                                                            setTradeAwayPackage(new Set());
                                                        }}
                                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-between"
                                                    >
                                                        <div className="text-xs">
                                                            <span className={`font-medium ${t.isPick ? 'text-cyan-700 dark:text-cyan-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{t.player.full_name}</span>
                                                            {!t.isPick && <span className="text-zinc-400 ml-1">{t.player.position}</span>}
                                                            {t.isPick && <span className="ml-1 text-[9px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-1 rounded">PICK</span>}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <span className="text-[10px] font-mono text-zinc-500">{t.value.toLocaleString()}</span>
                                                            <span className={`text-[9px] font-bold ${Math.abs(t.diff) / (t.value || 1) <= 0.1 ? 'text-green-500' : t.diff > 0 ? 'text-green-600' : 'text-amber-500'}`}>
                                                                {t.diff >= 0 ? '+' : ''}{Math.round((t.diff / (t.value || 1)) * 100)}%
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Search for target (Acquire mode) */}
            {mode === 'acquire' && !selectedPlayer && (
                <div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input type="text" placeholder={`Search ${allLeaguePlayers.length} league players...`} value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:border-indigo-500 outline-none" autoFocus />
                    </div>
                    {search.length >= 2 && searchResults.length === 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">No results. {allLeaguePlayers.filter(p => playerOwnershipMap.get(p.sleeper_id) && playerOwnershipMap.get(p.sleeper_id) !== currentRosterId).length} tradeable players available. Roster ID: {currentRosterId}</p>
                    )}
                    {searchResults.length > 0 && (
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                            {searchResults.map(p => {
                                const owner = playerOwnershipMap.get(p.sleeper_id);
                                const ownerName = owner ? rosterToOwnerMap.get(owner) : '';
                                return (
                                    <button key={p.sleeper_id} onClick={() => { setSelectedPlayer(p); setSearch(''); }}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex justify-between items-center">
                                        <div>
                                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                            <span className="text-[10px] text-zinc-500 ml-2">{p.position} · {ownerName}</span>
                                        </div>
                                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">{getEffectiveValue(p).toLocaleString()}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Deal Builder */}
            {selectedPlayer && (
                <div className="space-y-4">
                    {/* Target player */}
                    <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        <div>
                            <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{selectedPlayer.full_name}</div>
                            <div className="text-[10px] text-zinc-500">{selectedPlayer.position} · {rosterToOwnerMap.get(playerOwnershipMap.get(selectedPlayer.sleeper_id) || 0)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{getEffectiveValue(selectedPlayer).toLocaleString()}</span>
                            <button onClick={resetTrade} className="text-zinc-400 hover:text-red-400"><X size={14} /></button>
                        </div>
                    </div>

                    {/* Two columns: You Send | You Get */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* You Send */}
                        <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">You Send</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {myPlayers.filter(p => p.position !== 'PICK').sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a)).map(p => (
                                    <button key={p.sleeper_id} onClick={() => toggleAsset(myAssets, setMyAssets, p.sleeper_id)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition ${myAssets.has(p.sleeper_id) ? 'bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                        <div className="flex justify-between">
                                            <span className="truncate">{p.full_name}</span>
                                            <span className="text-zinc-500 font-mono ml-1">{getEffectiveValue(p).toLocaleString()}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {/* My Picks */}
                            {myPlayers.filter(p => p.position === 'PICK').length > 0 && (
                                <div className="mt-2">
                                    <div className="text-[9px] font-bold text-zinc-600 uppercase mb-1">Picks</div>
                                    <div className="space-y-1 max-h-24 overflow-y-auto">
                                        {myPlayers.filter(p => p.position === 'PICK').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).map(p => (
                                            <button key={p.sleeper_id} onClick={() => toggleAsset(myAssets, setMyAssets, p.sleeper_id)}
                                                className={`w-full text-left px-2 py-1 rounded text-[10px] transition ${myAssets.has(p.sleeper_id) ? 'bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                                <div className="flex justify-between">
                                                    <span className="truncate text-cyan-600 dark:text-cyan-400">{p.full_name}</span>
                                                    <span className="text-zinc-500 font-mono ml-1">{(p.fc_value || 0).toLocaleString()}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* They Add */}
                        <div>
                            <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">They Add</div>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                                {otherTeamPlayers.filter(p => p.position !== 'PICK').sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a)).map(p => (
                                    <button key={p.sleeper_id} onClick={() => toggleAsset(theirAssets, setTheirAssets, p.sleeper_id)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition ${theirAssets.has(p.sleeper_id) ? 'bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                        <div className="flex justify-between">
                                            <span className="truncate">{p.full_name}</span>
                                            <span className="text-zinc-500 font-mono ml-1">{getEffectiveValue(p).toLocaleString()}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {/* Their Picks */}
                            {otherTeamPlayers.filter(p => p.position === 'PICK').length > 0 && (
                                <div className="mt-2">
                                    <div className="text-[9px] font-bold text-zinc-600 uppercase mb-1">Picks</div>
                                    <div className="space-y-1 max-h-24 overflow-y-auto">
                                        {otherTeamPlayers.filter(p => p.position === 'PICK').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).map(p => (
                                            <button key={p.sleeper_id} onClick={() => toggleAsset(theirAssets, setTheirAssets, p.sleeper_id)}
                                                className={`w-full text-left px-2 py-1 rounded text-[10px] transition ${theirAssets.has(p.sleeper_id) ? 'bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                                                <div className="flex justify-between">
                                                    <span className="truncate text-cyan-600 dark:text-cyan-400">{p.full_name}</span>
                                                    <span className="text-zinc-500 font-mono ml-1">{(p.fc_value || 0).toLocaleString()}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Value Comparison Bar */}
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                        <div className="flex justify-between text-xs mb-2">
                            <span className="text-red-500 font-bold">You Send: {myTotal.toLocaleString()}</span>
                            <span className="text-green-500 font-bold">You Get: {theirTotal.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-300 ${diff > 0 ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(100, Math.max(0, (myTotal / (myTotal + theirTotal || 1)) * 100))}%` }} />
                        </div>
                        <div className={`text-center text-xs font-bold mt-1 ${Math.abs(diffPct) <= 10 ? 'text-green-500' : diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {diff === 0 ? 'Even' : diff > 0 ? `You overpay by ${diffPct}%` : `You gain ${Math.abs(diffPct)}%`}
                            {Math.abs(diffPct) <= 10 && diff !== 0 && ' · Fair Trade ✓'}
                        </div>
                    </div>

                    {/* Auction Value + Position Impact */}
                    {(myAssets.size > 0 || selectedPlayer) && (() => {
                        // Auction values
                        const myAuction = Array.from(myAssets).reduce((sum, id) => {
                            const p = myPlayers.find(pl => pl.sleeper_id === id);
                            return sum + (p?.redraft_auction_value || 0);
                        }, 0);
                        const theirAuction = (selectedPlayer?.redraft_auction_value || 0) + Array.from(theirAssets).reduce((sum, id) => {
                            const p = otherTeamPlayers.find(pl => pl.sleeper_id === id);
                            return sum + (p?.redraft_auction_value || 0);
                        }, 0);
                        const auctionDiff = theirAuction - myAuction;

                        // Position group impact
                        const posImpact: { pos: string; before: number; after: number }[] = [];
                        ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
                            const beforeVal = myPlayers.filter(p => p.position === pos).reduce((s, p) => s + (p.fc_value || 0), 0);
                            const sentVal = Array.from(myAssets).reduce((s, id) => {
                                const p = myPlayers.find(pl => pl.sleeper_id === id);
                                return s + (p?.position === pos ? (p.fc_value || 0) : 0);
                            }, 0);
                            const receivedVal = (selectedPlayer?.position === pos ? (selectedPlayer.fc_value || 0) : 0) +
                                Array.from(theirAssets).reduce((s, id) => {
                                    const p = otherTeamPlayers.find(pl => pl.sleeper_id === id);
                                    return s + (p?.position === pos ? (p.fc_value || 0) : 0);
                                }, 0);
                            const afterVal = beforeVal - sentVal + receivedVal;
                            if (sentVal > 0 || receivedVal > 0) {
                                posImpact.push({ pos, before: beforeVal, after: afterVal });
                            }
                        });

                        return (
                            <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                {/* Auction comparison */}
                                {(myAuction > 0 || theirAuction > 0) && (
                                    <div className="flex justify-between text-[10px]">
                                        <span className="text-zinc-500">Auction (Redraft):</span>
                                        <span className={`font-bold ${auctionDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            Send ${myAuction} → Get ${theirAuction} ({auctionDiff >= 0 ? '+' : ''}{auctionDiff})
                                        </span>
                                    </div>
                                )}

                                {/* Position impact */}
                                {posImpact.length > 0 && (
                                    <div>
                                        <div className="text-[9px] font-bold text-zinc-500 uppercase mb-1">Position Impact</div>
                                        <div className="space-y-0.5">
                                            {posImpact.map(pi => {
                                                const change = pi.after - pi.before;
                                                const pct = pi.before > 0 ? Math.round((change / pi.before) * 100) : 0;
                                                return (
                                                    <div key={pi.pos} className="flex items-center justify-between text-[10px]">
                                                        <span className="text-zinc-600 dark:text-zinc-400 font-medium">{pi.pos}</span>
                                                        <span className="text-zinc-500">{pi.before.toLocaleString()} → {pi.after.toLocaleString()}</span>
                                                        <span className={`font-bold ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                            {change >= 0 ? '+' : ''}{pct}%
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Save Deal */}
                    {leagueId && platform && myAssets.size > 0 && (
                        <button
                            onClick={saveDeal}
                            disabled={saving || saved}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                saved
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                            } disabled:opacity-50`}
                        >
                            <Save size={14} />
                            {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save Deal'}
                        </button>
                    )}
                </div>
            )}
        </div>
        </div>
    );
}
