'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowRightLeft, X } from 'lucide-react';

interface Player {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    redraft_rank_overall?: number | null;
}

interface Props {
    myPlayers: Player[];
    allLeaguePlayers: Player[];
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
    scoringFormat: '1qb' | 'sf';
}

export default function TradeEvaluator({ myPlayers, allLeaguePlayers, playerOwnershipMap, rosterToOwnerMap, currentRosterId, scoringFormat }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [myAssets, setMyAssets] = useState<Set<string>>(new Set());
    const [theirAssets, setTheirAssets] = useState<Set<string>>(new Set());
    const [redraftWeight, setRedraftWeight] = useState(0);

    const sf = scoringFormat === 'sf';

    const getEffectiveValue = (player: Player): number => {
        const dynVal = player.fc_value || 0;
        if (redraftWeight === 0) return dynVal;
        const rdRank = player.redraft_rank_overall;
        const fcRank = sf ? player.fc_rank_sf : player.fc_rank_1qb;
        if (!rdRank) return dynVal;
        const rankRatio = fcRank && rdRank ? fcRank / rdRank : 1;
        const rdEstValue = dynVal * rankRatio;
        const w = redraftWeight / 100;
        return Math.round(dynVal * (1 - w) + rdEstValue * w);
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
    };

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors text-sm">
                <ArrowRightLeft size={16} />
                Trade Evaluator
            </button>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 p-4 sm:p-6 space-y-4">
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

            {/* Search for target */}
            {!selectedPlayer && (
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
                </div>
            )}
        </div>
    );
}
