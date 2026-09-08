'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useUser';
import { useMyTeams } from '@/hooks/useMyTeams';
import { TagManager } from './TagManager';
import {
    type PortfolioLeague,
    type PortfolioLeagueRef,
    type PortfolioFormat,
    type PortfolioLeagueType,
    labelTeam,
    weakestStarter,
    undervaluedFreeAgents,
    teamMarketValue,
    optimizePortfolioTeam,
} from '@/lib/portfolio';

interface LoadedLeague {
    ref: PortfolioLeagueRef;
    data: PortfolioLeague | null;
    error?: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export default function PortfolioPage() {
    const {
        sleeperUserId, fleaflickerLeagueIds,
        sleeperLeagueFormats, fleaflickerLeagueFormats, leagueTypes,
        isLoading: authLoading,
    } = useAuth();
    const { getMyTeam, setMyTeam, loaded: myTeamsLoaded } = useMyTeams();

    const [refs, setRefs] = useState<PortfolioLeagueRef[] | null>(null);
    const [leagues, setLeagues] = useState<Record<string, LoadedLeague>>({});
    const [enumerating, setEnumerating] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);

    // 1. Enumerate leagues across all 4 platforms.
    useEffect(() => {
        if (authLoading) return;
        let cancelled = false;

        (async () => {
            setEnumerating(true);
            const collected: PortfolioLeagueRef[] = [];

            // Sleeper — discovered live from the user id.
            if (sleeperUserId) {
                try {
                    const res = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${CURRENT_YEAR}`);
                    if (res.ok) {
                        const arr = await res.json();
                        for (const l of arr || []) {
                            collected.push({
                                platform: 'sleeper',
                                leagueId: l.league_id,
                                name: l.name,
                                format: (sleeperLeagueFormats[l.league_id] || '1qb') as PortfolioFormat,
                                leagueType: (leagueTypes[l.league_id] || 'dynasty') as PortfolioLeagueType,
                            });
                        }
                    }
                } catch { /* ignore */ }
            }

            // Fleaflicker — ids live in auth state.
            for (const id of fleaflickerLeagueIds) {
                collected.push({
                    platform: 'fleaflicker',
                    leagueId: id,
                    format: (fleaflickerLeagueFormats[id] || '1qb') as PortfolioFormat,
                    leagueType: (leagueTypes[id] || 'dynasty') as PortfolioLeagueType,
                });
            }

            // Yahoo + MyFFPC — DB list endpoints.
            for (const [platform, url] of [['yahoo', '/api/yahoo?list=true'], ['myffpc', '/api/myffpc?list=true']] as const) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        for (const l of data?.leagues || []) {
                            collected.push({
                                platform,
                                leagueId: l.league_id,
                                name: l.name || undefined,
                                format: (l.scoring_format === 'sf' ? 'sf' : '1qb') as PortfolioFormat,
                                leagueType: (platform === 'yahoo' ? 'redraft' : 'dynasty') as PortfolioLeagueType,
                            });
                        }
                    }
                } catch { /* ignore */ }
            }

            if (!cancelled) { setRefs(collected); setEnumerating(false); }
        })();

        return () => { cancelled = true; };
    }, [authLoading, sleeperUserId, fleaflickerLeagueIds, sleeperLeagueFormats, fleaflickerLeagueFormats, leagueTypes]);

    // 2. Fetch each league through the normalized route.
    useEffect(() => {
        if (!refs) return;
        let cancelled = false;
        for (const ref of refs) {
            const key = `${ref.platform}:${ref.leagueId}`;
            if (leagues[key] && reloadKey === 0) continue; // already loaded/loading (unless a reload was requested)
            setLeagues(prev => ({ ...prev, [key]: { ref, data: null } }));
            const qs = new URLSearchParams({ platform: ref.platform, leagueId: ref.leagueId, format: ref.format, type: ref.leagueType });
            if (ref.name) qs.set('name', ref.name);
            fetch(`/api/portfolio/league?${qs.toString()}`)
                .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
                .then(json => { if (!cancelled) setLeagues(prev => ({ ...prev, [key]: { ref, data: json.league } })); })
                .catch(err => { if (!cancelled) setLeagues(prev => ({ ...prev, [key]: { ref, data: null, error: String(err.message || err) } })); });
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refs, reloadKey]);

    // When the buy/sell board changes, re-fetch all leagues so tagged buys surface.
    const handleTagsChanged = useCallback(() => setReloadKey(k => k + 1), []);

    const loading = authLoading || enumerating || !myTeamsLoaded;
    const loaded = Object.values(leagues);
    const anyData = loaded.some(l => l.data);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                    <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</Link>
                    <span>/</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">Portfolio</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">Portfolio</h1>
                <p className="text-sm text-zinc-500 mt-1 mb-8">
                    Cross-league insights — team strength, upgrade targets, and undervalued free agents across all your leagues.
                    {' '}<Link href="/portfolio/game-day" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Game Day rooting guide →</Link>
                </p>

                <TagManager onChange={handleTagsChanged} />

                {loading && (
                    <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your leagues…</div>
                )}

                {!loading && refs && refs.length === 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-600 dark:text-zinc-400">
                        No leagues found. Connect Sleeper / Fleaflicker on the <Link href="/" className="text-indigo-600 hover:underline">home page</Link>, or sync Yahoo / MyFFPC.
                    </div>
                )}

                {!loading && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {loaded.map(({ ref, data, error }) => {
                            const key = `${ref.platform}:${ref.leagueId}`;
                            return (
                                <LeagueCard
                                    key={key}
                                    refInfo={ref}
                                    data={data}
                                    error={error}
                                    myRosterId={getMyTeam(ref.platform, ref.leagueId)}
                                    onPickMyTeam={(rosterId) => setMyTeam(ref.platform, ref.leagueId, rosterId)}
                                />
                            );
                        })}
                    </div>
                )}
                {!loading && refs && refs.length > 0 && !anyData && (
                    <p className="text-sm text-zinc-500 mt-4">Fetching league data…</p>
                )}
            </div>
        </div>
    );
}

const PLATFORM_LABEL: Record<string, string> = { sleeper: 'Sleeper', fleaflicker: 'Fleaflicker', yahoo: 'Yahoo', myffpc: 'MyFFPC' };
const STATE_STYLE: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    contender: { icon: <TrendingUp className="h-3.5 w-3.5" />, cls: 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40', label: 'Contender' },
    middle: { icon: <Minus className="h-3.5 w-3.5" />, cls: 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800', label: 'Middle' },
    rebuild: { icon: <TrendingDown className="h-3.5 w-3.5" />, cls: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40', label: 'Rebuild' },
};

function LeagueCard({
    refInfo, data, error, myRosterId, onPickMyTeam,
}: {
    refInfo: PortfolioLeagueRef;
    data: PortfolioLeague | null;
    error?: string;
    myRosterId: string | null;
    onPickMyTeam: (rosterId: string) => void;
}) {
    const title = data?.name || refInfo.name || `${PLATFORM_LABEL[refInfo.platform]} League`;
    const dbHref = (refInfo.platform === 'yahoo' || refInfo.platform === 'myffpc')
        ? `/db-league/${refInfo.platform}/${refInfo.leagueId}`
        : refInfo.platform === 'sleeper' ? `/league/${refInfo.leagueId}` : `/fleaflicker/${refInfo.leagueId}`;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <Link href={dbHref} className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block">{title}</Link>
                    <div className="text-xs text-zinc-500 mt-0.5">
                        {PLATFORM_LABEL[refInfo.platform]} · {refInfo.format.toUpperCase()} · {refInfo.leagueType}
                    </div>
                </div>
                <Link href={dbHref} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 flex-shrink-0">Open <ArrowRight className="h-3 w-3" /></Link>
            </div>

            {!data && !error && <div className="flex items-center gap-2 text-sm text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>}
            {error && <div className="text-sm text-red-500">Failed to load ({error})</div>}

            {data && <LeagueInsights data={data} myRosterId={myRosterId} onPickMyTeam={onPickMyTeam} />}
        </div>
    );
}

function LeagueInsights({
    data, myRosterId, onPickMyTeam,
}: {
    data: PortfolioLeague;
    myRosterId: string | null;
    onPickMyTeam: (rosterId: string) => void;
}) {
    const myTeam = myRosterId ? data.teams.find(t => t.rosterId === myRosterId) || null : null;
    const fas = undervaluedFreeAgents(data);

    // My-team not chosen yet → show a picker.
    if (!myTeam) {
        return (
            <div>
                <div className="text-xs font-medium text-zinc-500 mb-1.5">Which team is yours?</div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {[...data.teams]
                        .sort((a, b) => teamMarketValue(b) - teamMarketValue(a))
                        .map(t => (
                            <button
                                key={t.rosterId}
                                onClick={() => onPickMyTeam(t.rosterId)}
                                className="text-xs px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-zinc-700 dark:text-zinc-300 transition-colors"
                            >
                                {t.ownerName}
                            </button>
                        ))}
                </div>
                <UndervaluedList fas={fas} />
            </div>
        );
    }

    const label = labelTeam(myTeam, data);
    const weak = weakestStarter(myTeam);
    const st = STATE_STYLE[label.state];
    const lineup = optimizePortfolioTeam(data, myTeam);
    const lineupSwaps = lineup && !lineup.isOptimal ? lineup.swaps.length : 0;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.icon} {st.label}</span>
                    <span className="text-xs text-zinc-500">{myTeam.ownerName}</span>
                </div>
                <button onClick={() => onPickMyTeam('')} className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">change</button>
            </div>
            <div className="text-xs text-zinc-500">{label.reason}{label.coreAvgAge != null ? ` · core age ${label.coreAvgAge.toFixed(1)}` : ''}</div>

            {lineupSwaps > 0 && (
                <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-md px-2 py-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                        Lineup: {lineupSwaps} suggested change{lineupSwaps > 1 ? 's' : ''} for week {data.weeklyWeek}.{' '}
                        {lineup!.swaps.slice(0, 2).map(s => `Start ${s.startPlayer.full_name}`).join('; ')}.
                    </span>
                </div>
            )}

            <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">Weakest starter (upgrade target)</div>
                {weak.player ? (
                    <div className="text-sm text-zinc-800 dark:text-zinc-200">
                        {weak.player.full_name} <span className="text-zinc-400">({weak.player.position})</span>
                        {weak.player.marketValue != null && <span className="text-zinc-400"> · mkt {weak.player.marketValue}</span>}
                    </div>
                ) : <div className="text-sm text-zinc-400">{weak.note}</div>}
            </div>

            <UndervaluedList fas={fas} />
        </div>
    );
}

function UndervaluedList({ fas }: { fas: ReturnType<typeof undervaluedFreeAgents> }) {
    return (
        <div>
            <div className="text-xs font-medium text-zinc-500 mb-1">Undervalued free agents <span className="text-zinc-400 font-normal">(your board vs market)</span></div>
            {fas.length === 0 ? (
                <div className="text-sm text-zinc-400">No standout edges right now.</div>
            ) : (
                <ul className="space-y-1">
                    {fas.map(({ player, rankEdge, reason, note }) => (
                        <li key={player.sleeper_id} className="text-sm text-zinc-800 dark:text-zinc-200">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                    {reason === 'buy' && <span className="text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded px-1 mr-1">BUY</span>}
                                    {reason === 'add' && <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded px-1 mr-1">ADD</span>}
                                    {player.full_name} <span className="text-zinc-400">({player.position})</span>
                                </span>
                                {rankEdge != null ? (
                                    <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0" title={`Your rank ${player.myRank} vs market ${player.marketRank}`}>+{rankEdge} edge</span>
                                ) : (
                                    <span className="text-xs text-zinc-400 flex-shrink-0">{reason === 'add' ? 'analyst add' : 'tagged'}</span>
                                )}
                            </div>
                            {note && <div className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{note}</div>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
