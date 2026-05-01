'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface Mover {
    sleeper_id: string;
    full_name: string;
    position: string;
    current_value: number;
    previous_value: number;
    change_pct: number;
    owned_in?: string[]; // league names where user owns this player
}

interface Props {
    format: '1qb' | 'sf';
    userPlayerIds?: Set<string>; // sleeper IDs of players the user owns
    leagueNames?: Map<string, string>; // sleeper_id -> league name for owned players
}

export default function ValueMovers({ format, userPlayerIds, leagueNames }: Props) {
    const [expanded, setExpanded] = useState(false);
    const [movers, setMovers] = useState<{ risers: Mover[]; fallers: Mover[] } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (expanded && !movers) {
            setLoading(true);
            fetch(`/api/value-movers?format=${format}`)
                .then(r => r.json())
                .then(data => setMovers(data))
                .catch(() => setMovers({ risers: [], fallers: [] }))
                .finally(() => setLoading(false));
        }
    }, [expanded, movers, format]);

    const isOwned = (id: string) => userPlayerIds?.has(id);

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden">
            <button onClick={() => setExpanded(!expanded)} className="w-full p-4 flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📈</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Value Movers</h3>
                    <span className="text-[10px] text-zinc-500">This Week</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4">
                    {loading && <p className="text-sm text-zinc-500 text-center py-4">Loading...</p>}
                    {movers && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Risers */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <TrendingUp size={14} className="text-green-500" />
                                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Risers</span>
                                </div>
                                {movers.risers.length === 0 && <p className="text-[11px] text-zinc-500">No significant risers this week</p>}
                                <div className="space-y-1">
                                    {movers.risers.map(m => (
                                        <div key={m.sleeper_id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${isOwned(m.sleeper_id) ? 'bg-green-50 dark:bg-green-950/20 ring-1 ring-green-200 dark:ring-green-800' : ''}`}>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                    {m.full_name}
                                                    {isOwned(m.sleeper_id) && <span className="ml-1 text-[8px] bg-green-500 text-white px-1 rounded">YOURS</span>}
                                                </div>
                                                <div className="text-[9px] text-zinc-500">{m.position} · {m.current_value.toLocaleString()}</div>
                                            </div>
                                            <span className="text-[11px] font-bold text-green-500 flex-shrink-0 ml-2">+{m.change_pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Fallers */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <TrendingDown size={14} className="text-red-500" />
                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Fallers</span>
                                </div>
                                {movers.fallers.length === 0 && <p className="text-[11px] text-zinc-500">No significant fallers this week</p>}
                                <div className="space-y-1">
                                    {movers.fallers.map(m => (
                                        <div key={m.sleeper_id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${isOwned(m.sleeper_id) ? 'bg-red-50 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-800' : ''}`}>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                    {m.full_name}
                                                    {isOwned(m.sleeper_id) && <span className="ml-1 text-[8px] bg-red-500 text-white px-1 rounded">YOURS</span>}
                                                </div>
                                                <div className="text-[9px] text-zinc-500">{m.position} · {m.current_value.toLocaleString()}</div>
                                            </div>
                                            <span className="text-[11px] font-bold text-red-500 flex-shrink-0 ml-2">{m.change_pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
