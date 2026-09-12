'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, ArrowRight, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/hooks/useUser';
import { useMyTeams } from '@/hooks/useMyTeams';
import { useSeasonMode } from '@/hooks/useSeasonMode';
import { TagManager } from './TagManager';
import { ActionCenter } from '@/components/portfolio/ActionCenter';
import { buildActionCenter, buildLeagueActions, tierFor, type ActionCenterInput, type TierBand, type ActionItem } from '@/lib/action-center';
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
    const { showFor, mode: seasonMode } = useSeasonMode();

    const [refs, setRefs] = useState<PortfolioLeagueRef[] | null>(null);
    const [leagues, setLeagues] = useState<Record<string, LoadedLeague>>({});
    const [enumerating, setEnumerating] = useState(true);
    const [reloadKey, setReloadKey] = useState(0);
    // MyFFPC ltuid per leagueId (from /api/myffpc?list=true, env-sourced) → real
    // SetLineup.aspx deep links. Absent → falls back to the in-app view.
    const [myffpcLtuids, setMyffpcLtuids] = useState<Record<string, string>>({});

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
            const collectedLtuids: Record<string, string> = {};
            for (const [platform, url] of [['yahoo', '/api/yahoo?list=true'], ['myffpc', '/api/myffpc?list=true']] as const) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        for (const l of data?.leagues || []) {
                            if (platform === 'myffpc' && l.ltuid) collectedLtuids[l.league_id] = l.ltuid;
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

            if (!cancelled) { setRefs(collected); setMyffpcLtuids(collectedLtuids); setEnumerating(false); }
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

    // Fleaflicker pending/incoming trades → feed the Action Center "Trades" group.
    const [pendingTrades, setPendingTrades] = useState<Record<string, { id: string; headline: string; detail?: string }[]>>({});
    // Weekly DST streaming rankings (shared across leagues) → "Stream a defense".
    const [dstRankings, setDstRankings] = useState<{ sleeper_id: string; rank: number | null; tier: number | null; spread: number | null; opponent: string | null; name: string | null }[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetch('/api/portfolio/dst-rankings')
            .then(r => r.ok ? r.json() : { list: [] })
            .then(json => { if (!cancelled) setDstRankings(json.list || []); })
            .catch(() => { /* ignore — best-effort */ });
        return () => { cancelled = true; };
    }, []);
    // Weekly kicker rankings (scraped) → "Stream a kicker" for leagues with a K slot.
    const [kickerRankings, setKickerRankings] = useState<{ sleeper_id: string; rank: number | null; score: number | null; opponent: string | null; name: string | null; team: string | null }[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetch('/api/portfolio/kicker-rankings')
            .then(r => r.ok ? r.json() : { list: [] })
            // Only matched rows (real sleeper_id) are usable by the engine.
            .then(json => { if (!cancelled) setKickerRankings((json.list || []).filter((k: any) => k.sleeper_id)); })
            .catch(() => { /* ignore — best-effort */ });
        return () => { cancelled = true; };
    }, []);
    // NFL teams whose game this week has already kicked off — used to suppress
    // weekly waiver upgrades for free agents who can't help anymore this week.
    const [startedTeams, setStartedTeams] = useState<Set<string>>(new Set());
    useEffect(() => {
        let cancelled = false;
        fetch('/api/nfl/started-teams')
            .then(r => r.ok ? r.json() : { startedTeams: [] })
            .then(json => { if (!cancelled) setStartedTeams(new Set<string>(json.startedTeams || [])); })
            .catch(() => { /* ignore — fail open (no gating) */ });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => {
        let cancelled = false;
        for (const l of Object.values(leagues)) {
            if (!l.data || l.ref.platform !== 'fleaflicker') continue;
            const key = `${l.ref.platform}:${l.ref.leagueId}`;
            const myTeamId = getMyTeam(l.ref.platform, l.ref.leagueId);
            if (!myTeamId) continue;
            const qs = new URLSearchParams({ platform: 'fleaflicker', leagueId: l.ref.leagueId, myTeamId });
            fetch(`/api/portfolio/pending-trades?${qs.toString()}`)
                .then(r => r.ok ? r.json() : { trades: [] })
                .then(json => { if (!cancelled) setPendingTrades(prev => ({ ...prev, [key]: json.trades || [] })); })
                .catch(() => { /* ignore — trades are best-effort */ });
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leagues, getMyTeam]);

    const loading = authLoading || enumerating || !myTeamsLoaded;
    const loaded = Object.values(leagues);
    const anyData = loaded.some(l => l.data);

    // Action Center model — aggregate recommended actions across all loaded
    // leagues, re-prioritized by season mode. Passive team health stays in the
    // dashboard below (LeagueCard), not here.
    const actionCenter = useMemo(() => {
        const inputs: ActionCenterInput[] = loaded
            .filter(l => l.data)
            .map(l => ({
                league: l.data!,
                myRosterId: getMyTeam(l.ref.platform, l.ref.leagueId),
                pendingTrades: pendingTrades[`${l.ref.platform}:${l.ref.leagueId}`],
                dstRankings,
                kickerRankings,
                startedTeams,
                myffpcLtuid: myffpcLtuids[l.ref.leagueId] ?? null,
            }));
        if (inputs.length === 0) return null;
        return buildActionCenter(inputs, { seasonMode });
    }, [loaded, getMyTeam, seasonMode, pendingTrades, dstRankings, kickerRankings, startedTeams, myffpcLtuids]);

    // Current NFL week — from any loaded league that carries weekly rankings.
    const currentWeek = useMemo(() => {
        for (const l of loaded) {
            if (l.data?.weeklyWeek != null) return l.data.weeklyWeek;
        }
        return null;
    }, [loaded]);

    // Per-league lineup-fix count (from the same engine) so the dashboard's
    // "⚠ N lineup" pill never disagrees with the Action Center.
    const lineupCountByKey = useMemo(() => {
        const map: Record<string, number> = {};
        if (!actionCenter?.byType) return map;
        for (const g of actionCenter.byType) {
            if (g.kind !== 'lineup') continue;
            for (const it of g.items) {
                const k = `${it.platform}:${it.leagueId}`;
                map[k] = (map[k] ?? 0) + 1;
            }
        }
        return map;
    }, [actionCenter]);

    // Per-league in-season actions (waiver swaps + DEF streaming) rendered INSIDE
    // each league card. Only in-season; off-season shows these in the by-team
    // Action Center instead.
    const leagueActionsByKey = useMemo(() => {
        const map: Record<string, ActionItem[]> = {};
        if (seasonMode !== 'in-season') return map;
        for (const l of loaded) {
            if (!l.data) continue;
            const key = `${l.ref.platform}:${l.ref.leagueId}`;
            map[key] = buildLeagueActions({
                league: l.data,
                myRosterId: getMyTeam(l.ref.platform, l.ref.leagueId),
                dstRankings,
                kickerRankings,
                startedTeams,
                myffpcLtuid: myffpcLtuids[l.ref.leagueId] ?? null,
            });
        }
        return map;
    }, [loaded, getMyTeam, seasonMode, dstRankings, kickerRankings, startedTeams, myffpcLtuids]);

    // Partition loaded leagues into tier bands (top/middle/lower) for the
    // dashboard. Leagues whose my-team is unknown go to `unassigned` (they show
    // the picker). Within a band: needs-action-first, then value desc.
    const banded = useMemo(() => {
        const bands: Record<TierBand, LoadedLeague[]> = { top: [], middle: [], lower: [] };
        const unassigned: LoadedLeague[] = [];
        for (const l of loaded) {
            if (!l.data) { unassigned.push(l); continue; }
            const rid = getMyTeam(l.ref.platform, l.ref.leagueId);
            const myTeam = rid ? l.data.teams.find(t => t.rosterId === rid) : undefined;
            if (!myTeam) { unassigned.push(l); continue; }
            const { band } = tierFor(labelTeam(myTeam, l.data).state, l.data.leagueType);
            bands[band].push(l);
        }
        const sortKey = (l: LoadedLeague) => {
            const k = `${l.ref.platform}:${l.ref.leagueId}`;
            const lineups = lineupCountByKey[k] ?? 0;
            const val = l.data ? teamMarketValue(l.data.teams.find(t => t.rosterId === getMyTeam(l.ref.platform, l.ref.leagueId)) ?? l.data.teams[0]) : 0;
            return { lineups, val };
        };
        for (const b of ['top', 'middle', 'lower'] as TierBand[]) {
            bands[b].sort((a, z) => {
                const ka = sortKey(a), kz = sortKey(z);
                return (kz.lineups - ka.lineups) || (kz.val - ka.val);
            });
        }
        return { bands, unassigned };
    }, [loaded, getMyTeam, lineupCountByKey]);

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
                    {showFor('in-season') && (
                        <>{' '}<Link href="/portfolio/game-day" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">For &amp; Against →</Link></>
                    )}
                </p>

                <TagManager onChange={handleTagsChanged} />

                {loading && (
                    <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your leagues…</div>
                )}

                {!loading && anyData && (
                    <ActionCenter model={actionCenter} currentWeek={currentWeek} />
                )}

                {!loading && refs && refs.length === 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-600 dark:text-zinc-400">
                        No leagues found. Connect Sleeper / Fleaflicker on the <Link href="/" className="text-indigo-600 hover:underline">home page</Link>, or sync Yahoo / MyFFPC.
                    </div>
                )}

                {!loading && anyData && (
                    <div className="space-y-8">
                        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Your teams — strengths &amp; weaknesses</div>
                        {(['top', 'middle', 'lower'] as TierBand[]).map(band =>
                            banded.bands[band].length === 0 ? null : (
                                <BandSection
                                    key={band}
                                    band={band}
                                    leagues={banded.bands[band]}
                                    getMyTeam={getMyTeam}
                                    setMyTeam={setMyTeam}
                                    lineupCountByKey={lineupCountByKey}
                                    leagueActionsByKey={leagueActionsByKey}
                                    startedTeams={startedTeams}
                                />
                            )
                        )}
                        {banded.unassigned.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 mb-3">
                                    <span className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                                    Pick your team <span className="text-xs font-normal text-zinc-400">{banded.unassigned.length} league{banded.unassigned.length !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    {banded.unassigned.map(({ ref, data, error }) => (
                                        <LeagueCard
                                            key={`${ref.platform}:${ref.leagueId}`}
                                            refInfo={ref} data={data} error={error}
                                            myRosterId={getMyTeam(ref.platform, ref.leagueId)}
                                            onPickMyTeam={(rosterId) => setMyTeam(ref.platform, ref.leagueId, rosterId)}
                                            lineupCount={0}
                                            leagueActions={leagueActionsByKey[`${ref.platform}:${ref.leagueId}`] ?? []}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
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

const BAND_META: Record<TierBand, { dot: string; label: string }> = {
    top: { dot: 'bg-green-500', label: 'Top tier' },
    middle: { dot: 'bg-zinc-400', label: 'Middle' },
    lower: { dot: 'bg-amber-500', label: 'Lower tier' },
};

const TIER_PILL: Record<TierBand, string> = {
    top: 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/40',
    middle: 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800',
    lower: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40',
};

function BandSection({
    band, leagues, getMyTeam, setMyTeam, lineupCountByKey, leagueActionsByKey, startedTeams,
}: {
    band: TierBand;
    leagues: LoadedLeague[];
    getMyTeam: (p: string, l: string) => string | null;
    setMyTeam: (p: string, l: string, r: string) => void;
    lineupCountByKey: Record<string, number>;
    leagueActionsByKey: Record<string, ActionItem[]>;
    startedTeams?: Set<string>;
}) {
    const meta = BAND_META[band];
    return (
        <div>
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-3">
                <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                {meta.label}
                <span className="text-xs font-medium text-zinc-400">{leagues.length} team{leagues.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {leagues.map(({ ref, data, error }) => {
                    const key = `${ref.platform}:${ref.leagueId}`;
                    return (
                        <LeagueCard
                            key={key} refInfo={ref} data={data} error={error}
                            myRosterId={getMyTeam(ref.platform, ref.leagueId)}
                            onPickMyTeam={(rosterId) => setMyTeam(ref.platform, ref.leagueId, rosterId)}
                            lineupCount={lineupCountByKey[key] ?? 0}
                            leagueActions={leagueActionsByKey[key] ?? []}
                            startedTeams={startedTeams}
                        />
                    );
                })}
            </div>
        </div>
    );
}

function LeagueCard({
    refInfo, data, error, myRosterId, onPickMyTeam, lineupCount, leagueActions, startedTeams,
}: {
    refInfo: PortfolioLeagueRef;
    data: PortfolioLeague | null;
    error?: string;
    myRosterId: string | null;
    onPickMyTeam: (rosterId: string) => void;
    lineupCount: number;
    leagueActions: ActionItem[];
    startedTeams?: Set<string>;
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

            {data && <LeagueInsights data={data} myRosterId={myRosterId} onPickMyTeam={onPickMyTeam} lineupCount={lineupCount} leagueActions={leagueActions} startedTeams={startedTeams} />}
        </div>
    );
}

function LeagueInsights({
    data, myRosterId, onPickMyTeam, lineupCount, leagueActions, startedTeams,
}: {
    data: PortfolioLeague;
    myRosterId: string | null;
    onPickMyTeam: (rosterId: string) => void;
    lineupCount: number;
    leagueActions: ActionItem[];
    startedTeams?: Set<string>;
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
    const tier = tierFor(label.state, data.leagueType);
    const lineup = optimizePortfolioTeam(data, myTeam, startedTeams);
    const lineupSwaps = lineup && !lineup.isOptimal ? lineup.swaps.length : 0;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${TIER_PILL[tier.band]}`}>{tier.label}</span>
                    {lineupCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40">
                            <AlertTriangle className="h-3 w-3" /> {lineupCount} lineup
                        </span>
                    )}
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

            <WeeklyUpgradesList items={leagueActions.filter(a => a.kind === 'waiver-upgrade')} />

            {leagueActions.filter(a => a.kind !== 'waiver-upgrade').length > 0 && (
                <div>
                    <div className="text-xs font-medium text-zinc-500 mb-1">Recommended pickups</div>
                    <ul className="space-y-1.5">
                        {leagueActions.filter(a => a.kind !== 'waiver-upgrade').map(a => (
                            <li key={a.id} className="text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-zinc-800 dark:text-zinc-200 truncate">
                                        {a.kind === 'stream' && <span className="text-sky-500 mr-1">🛡️</span>}
                                        {a.kind === 'stream-k' && <span className="text-amber-500 mr-1">🥅</span>}
                                        {a.headline}
                                        {a.detail && <span className="ml-1 text-xs font-semibold text-green-600 dark:text-green-400">{a.detail}</span>}
                                    </span>
                                    <OpenLink href={a.deepLink} />
                                </div>
                                {a.meta?.subDetail ? (
                                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{a.meta.subDetail as string}</div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <UndervaluedList fas={fas} />
        </div>
    );
}

/**
 * "Open →" link that opens EXTERNAL platform URLs (http...) in a new tab so the
 * portfolio isn't lost, and in-app routes via client navigation.
 */
function OpenLink({ href, label = 'Open →' }: { href: string; label?: string }) {
    const external = /^https?:\/\//i.test(href);
    if (external) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                {label}
            </a>
        );
    }
    return <Link href={href} className="flex-shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">{label}</Link>;
}

/**
 * Weekly waiver upgrades for a league card: free agents who improve THIS week's
 * lineup (weekly-rank lens), with the 3-tier drop guardrail. Actionable safe
 * items first; caution flagged (amber); informational ("help exists, no
 * worthwhile drop") muted. Shows top 5, with a "show more" for the rest.
 */
function WeeklyUpgradesList({ items }: { items: ActionItem[] }) {
    const [expanded, setExpanded] = useState(false);
    if (items.length === 0) return null;
    const TOP = 5;
    const shown = expanded ? items : items.slice(0, TOP);
    const extra = items.length - shown.length;
    return (
        <div>
            <div className="text-xs font-medium text-zinc-500 mb-1">Weekly lineup upgrades <span className="text-zinc-400 font-normal">(this week)</span></div>
            <ul className="space-y-1.5">
                {shown.map(a => {
                    const tier = (a.meta?.tier as string) ?? 'safe';
                    const informational = a.meta?.informational === true;
                    const cracks = a.meta?.cracksLineup === true;
                    return (
                        <li key={a.id} className={`text-sm ${informational ? 'opacity-60' : ''}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-zinc-800 dark:text-zinc-200 truncate">
                                    {tier === 'caution' && !informational && <span className="text-amber-500 mr-1" title="Valuable drop — consider before dropping">⚠️</span>}
                                    {cracks && !informational && <span className="text-emerald-500 mr-1" title="Would crack your starting lineup">▲</span>}
                                    {a.headline}
                                    {a.detail && <span className="ml-1 text-xs text-zinc-400">· {a.detail}</span>}
                                </span>
                                {!informational && (
                                    <OpenLink href={a.deepLink} />
                                )}
                            </div>
                            {a.meta?.subDetail ? (
                                <div className="text-[11px] text-zinc-400 mt-0.5 truncate">{a.meta.subDetail as string}</div>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {extra > 0 && (
                <button onClick={() => setExpanded(true)} className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    Show {extra} more
                </button>
            )}
            {expanded && items.length > TOP && (
                <button onClick={() => setExpanded(false)} className="mt-1 ml-3 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                    Show less
                </button>
            )}
        </div>
    );
}

/**
 * Collapsed scouting hint — pure "my board vs market" edge, NOT actionable
 * waivers (those live in the Action Center). Shows top few names + edge,
 * collapsed by default, no analyst essays (those are click-through only).
 */
function UndervaluedList({ fas }: { fas: ReturnType<typeof undervaluedFreeAgents> }) {
    const [open, setOpen] = useState(false);
    if (fas.length === 0) {
        return (
            <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">Scouting <span className="text-zinc-400 font-normal">(your board vs market)</span></div>
                <div className="text-sm text-zinc-400">No standout edges right now.</div>
            </div>
        );
    }
    const top = fas.slice(0, 3);
    const rest = fas.length - top.length;
    const nameLine = (f: ReturnType<typeof undervaluedFreeAgents>[number]) =>
        `${f.player.full_name}${f.rankEdge != null ? ` +${f.rankEdge}` : ''}`;
    return (
        <div>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
                Scouting <span className="text-zinc-400 font-normal">(your board vs market)</span>
                {open ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
            {/* Always-visible one-liner of the top few */}
            <div className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
                {top.map(nameLine).join(' · ')}{rest > 0 && !open ? ` · +${rest} more` : ''}
            </div>
            {open && (
                <ul className="mt-1.5 space-y-1">
                    {fas.map(f => (
                        <li key={f.player.sleeper_id} className="flex items-center justify-between gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                            <Link href={`/portfolio/player/${f.player.sleeper_id}`} className="truncate hover:text-indigo-600 dark:hover:text-indigo-400">
                                {f.reason === 'buy' && <span className="text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded px-1 mr-1">BUY</span>}
                                {f.reason === 'add' && <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded px-1 mr-1">ADD</span>}
                                {f.player.full_name} <span className="text-zinc-400">({f.player.position})</span>
                            </Link>
                            {f.rankEdge != null && (
                                <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0" title={`Your rank ${f.player.myRank} vs market ${f.player.marketRank}`}>+{f.rankEdge}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
