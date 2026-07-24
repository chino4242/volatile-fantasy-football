'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/hooks/useUser';

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
}

export default function ValueMovers({ format }: Props) {
    const { sleeperUserId } = useAuth();
    const [expanded, setExpanded] = useState(false);
    const [movers, setMovers] = useState<{ risers: Mover[]; fallers: Mover[] } | null>(null);
    const [loading, setLoading] = useState(false);
    const [userPlayerIds, setUserPlayerIds] = useState<Set<string> | null>(null);
    const [filterMode, setFilterMode] = useState<'mine' | 'all'>('mine');

    // Fetch user's rostered player IDs from their Sleeper leagues
    useEffect(() => {
        if (!sleeperUserId) { setUserPlayerIds(null); return; }
        const fetchRosters = async () => {
            try {
                const year = new Date().getFullYear();
                const leaguesRes = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${year}`);
                if (!leaguesRes.ok) return;
                const leagues = await leaguesRes.json();
                if (!Array.isArray(leagues)) return;

                const allPlayerIds = new Set<string>();
                await Promise.all(
                    leagues.slice(0, 5).map(async (league: any) => { // cap at 5 leagues to avoid too many requests
                        try {
                            const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`);
                            if (!rostersRes.ok) return;
                            const rosters = await rostersRes.json();
                            const myRoster = rosters.find((r: any) => r.owner_id === sleeperUserId);
                            if (myRoster?.players) {
                                myRoster.players.forEach((pid: string) => allPlayerIds.add(pid));
                            }
                        } catch {}
                    })
                );
                setUserPlayerIds(allPlayerIds);
            } catch {
                setUserPlayerIds(null);
            }
        };
        fetchRosters();
    }, [sleeperUserId]);

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

    // Filter movers based on mode
    const getFilteredMovers = () => {
        if (!movers) return null;
        if (filterMode === 'all' || !userPlayerIds || userPlayerIds.size === 0) return movers;
        return {
            risers: movers.risers.filter(m => userPlayerIds.has(m.sleeper_id)),
            fallers: movers.fallers.filter(m => userPlayerIds.has(m.sleeper_id)),
        };
    };

    const filteredMovers = getFilteredMovers();
    const hasRosterData = userPlayerIds && userPlayerIds.size > 0;

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
                    {/* Filter toggle */}
                    {hasRosterData && (
                        <div className="flex items-center gap-1 mb-3">
                            <button
                                onClick={() => setFilterMode('mine')}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${filterMode === 'mine' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >
                                My Roster
                            </button>
                            <button
                                onClick={() => setFilterMode('all')}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${filterMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >
                                All Players
                            </button>
                        </div>
                    )}

                    {loading && <p className="text-sm text-zinc-500 text-center py-4">Loading...</p>}
                    {filteredMovers && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Risers */}
                            <div>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <TrendingUp size={14} className="text-green-500" />
                                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Risers</span>
                                </div>
                                {filteredMovers.risers.length === 0 && (
                                    <p className="text-[11px] text-zinc-500">
                                        {filterMode === 'mine' ? 'None of your players had significant gains this week' : 'No significant risers this week'}
                                    </p>
                                )}
                                <div className="space-y-1">
                                    {filteredMovers.risers.map(m => (
                                        <div key={m.sleeper_id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${isOwned(m.sleeper_id) ? 'bg-green-50 dark:bg-green-950/20 ring-1 ring-green-200 dark:ring-green-800' : ''}`}>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                    {m.full_name}
                                                    {filterMode === 'all' && isOwned(m.sleeper_id) && <span className="ml-1 text-[8px] bg-green-500 text-white px-1 rounded">YOURS</span>}
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
                                {filteredMovers.fallers.length === 0 && (
                                    <p className="text-[11px] text-zinc-500">
                                        {filterMode === 'mine' ? 'None of your players had significant drops this week' : 'No significant fallers this week'}
                                    </p>
                                )}
                                <div className="space-y-1">
                                    {filteredMovers.fallers.map(m => (
                                        <div key={m.sleeper_id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${isOwned(m.sleeper_id) ? 'bg-red-50 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-800' : ''}`}>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                    {m.full_name}
                                                    {filterMode === 'all' && isOwned(m.sleeper_id) && <span className="ml-1 text-[8px] bg-red-500 text-white px-1 rounded">YOURS</span>}
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
