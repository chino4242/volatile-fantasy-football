'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, ThumbsUp, ThumbsDown, Clock, Users, List, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useUser';
import { useMyTeams } from '@/hooks/useMyTeams';
import type { RootingGuide, RootingPlayer, RootingGame, RootingSource } from '@/lib/rooting-guide';

const CURRENT_YEAR = new Date().getFullYear();

interface Ref { platform: string; leagueId: string; leagueName?: string; myRosterId?: string | null; }

export default function GameDayPage() {
    const { sleeperUserId, fleaflickerLeagueIds, isLoading: authLoading } = useAuth();
    const { getMyTeam, loaded: myTeamsLoaded } = useMyTeams();

    const [guide, setGuide] = useState<RootingGuide | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    // Sleeper_ids whose points rose since the last poll → brief "bumped" highlight.
    const [bumpedIds, setBumpedIds] = useState<Set<string>>(new Set());
    // Previous poll's points per sleeper_id, for diffing.
    const prevPointsRef = useRef<Map<string, number>>(new Map());

    // Assemble refs + fetch the guide. `isPoll` skips the full-page spinner so a
    // background refresh doesn't flash the loading state.
    const load = useCallback(async (isPoll: boolean, signal?: { cancelled: boolean }) => {
        if (!isPoll) { setLoading(true); setError(null); }
        const refs: Ref[] = [];
        if (sleeperUserId) {
            try {
                const res = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${CURRENT_YEAR}`);
                if (res.ok) for (const l of (await res.json()) || []) {
                    refs.push({ platform: 'sleeper', leagueId: l.league_id, leagueName: l.name, myRosterId: getMyTeam('sleeper', l.league_id) });
                }
            } catch { /* ignore */ }
        }
        for (const id of fleaflickerLeagueIds) {
            refs.push({ platform: 'fleaflicker', leagueId: id, myRosterId: getMyTeam('fleaflicker', id) });
        }
        for (const [platform, url] of [['yahoo', '/api/yahoo?list=true'], ['myffpc', '/api/myffpc?list=true']] as const) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    for (const l of data?.leagues || []) {
                        refs.push({ platform, leagueId: l.league_id, leagueName: l.name || undefined, myRosterId: getMyTeam(platform, l.league_id) });
                    }
                }
            } catch { /* ignore */ }
        }
        try {
            const res = await fetch('/api/portfolio/rooting-guide', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refs }),
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const json = await res.json();
            if (!signal?.cancelled) {
                const g: RootingGuide = json.guide;
                // Diff points vs the previous poll → highlight players who rose.
                const prev = prevPointsRef.current;
                const next = new Map<string, number>();
                const bumped = new Set<string>();
                for (const game of g.games) {
                    for (const p of game.players) {
                        if (p.points == null) continue;
                        next.set(p.sleeper_id, p.points);
                        const before = prev.get(p.sleeper_id);
                        // Only flag as "bumped" on a poll (prev had a value) and a real increase.
                        if (before != null && p.points > before + 0.01) bumped.add(p.sleeper_id);
                    }
                }
                prevPointsRef.current = next;
                setGuide(g);
                setLastUpdated(Date.now());
                if (isPoll && bumped.size > 0) {
                    setBumpedIds(bumped);
                    // Clear the highlight after a few seconds so it's a subtle pulse.
                    setTimeout(() => { if (!signal?.cancelled) setBumpedIds(new Set()); }, 6000);
                }
            }
        } catch (e: any) {
            if (!signal?.cancelled && !isPoll) setError(e.message || 'Failed to load');
        } finally {
            if (!signal?.cancelled && !isPoll) setLoading(false);
        }
    }, [sleeperUserId, fleaflickerLeagueIds, getMyTeam]);

    // Initial load.
    useEffect(() => {
        if (authLoading || !myTeamsLoaded) return;
        const signal = { cancelled: false };
        load(false, signal);
        return () => { signal.cancelled = true; };
    }, [authLoading, myTeamsLoaded, load]);

    // Live polling — only while at least one game is in-progress. ~45s cadence.
    useEffect(() => {
        const hasLive = !!guide?.games.some(g => g.live?.state === 'in');
        if (!hasLive) return;
        const signal = { cancelled: false };
        const id = setInterval(() => load(true, signal), 45_000);
        return () => { signal.cancelled = true; clearInterval(id); };
    }, [guide, load]);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                    <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</Link>
                    <span>/</span>
                    <Link href="/portfolio" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Portfolio</Link>
                    <span>/</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">For &amp; Against</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">For &amp; Against</h1>
                <p className="text-sm text-zinc-500 mt-1 mb-2">
                    Every NFL game where you have a rooting interest — who you&apos;re rooting <span className="text-green-600 dark:text-green-400 font-medium">for</span> and <span className="text-red-600 dark:text-red-400 font-medium">against</span> across your leagues.{guide?.week != null && <> Week {guide.week}.</>}
                    <span className="block text-xs text-zinc-400 mt-1">All leagues. Starters only. &quot;Against&quot; = your weekly head-to-head opponent.</span>
                </p>

                {!loading && guide?.sources && guide.sources.length > 0 && <FreshnessLine sources={guide.sources} lastUpdated={lastUpdated} live={!!guide.games.some(g => g.live?.state === 'in')} />}

                {loading && <div className="flex items-center gap-2 text-zinc-500 mt-4"><Loader2 className="h-4 w-4 animate-spin" /> Building your board…</div>}
                {error && <div className="text-sm text-red-500">Failed to load ({error}).</div>}

                {!loading && guide && guide.week == null && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-600 dark:text-zinc-400">
                        No weekly rankings uploaded yet — the guide groups players into real NFL games using this week&apos;s Flex/QB upload. Upload them in Admin.
                    </div>
                )}

                {!loading && guide && guide.week != null && guide.games.length === 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-600 dark:text-zinc-400">
                        No rooting interests found. Make sure you&apos;ve picked &quot;my team&quot; for your leagues on the <Link href="/portfolio" className="text-indigo-600 hover:underline">Portfolio</Link> page.
                    </div>
                )}

                {!loading && guide && (
                    <div className="space-y-6">
                        {groupBySlot(guide.games).map(section => (
                            <div key={section.slot}>
                                <h2 className="sticky top-0 z-10 bg-zinc-50/90 dark:bg-zinc-950/90 backdrop-blur text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2 py-1">{section.slot}</h2>
                                <div className="space-y-3 sm:space-y-4">
                                    {section.games.map(game => (
                                        <GameCard key={game.gameKey} game={game} bumpedIds={bumpedIds} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {!loading && guide && guide.unresolvedLeagues.length > 0 && (
                    <div className="mt-4 text-xs text-zinc-400">
                        Not shown: {guide.unresolvedLeagues.join(', ')}. (Pick your team on the Portfolio page, or the matchup wasn&apos;t available.)
                    </div>
                )}
            </div>
        </div>
    );
}

// Group games into ordered day/slot sections (preserving the route's kickoff sort).
function groupBySlot(games: RootingGame[]): { slot: string; games: RootingGame[] }[] {
    const sections: { slot: string; games: RootingGame[] }[] = [];
    const idx = new Map<string, number>();
    for (const g of games) {
        const label = g.slot || (g.gameKey === 'UNKNOWN' ? 'No game data' : 'Other');
        let i = idx.get(label);
        if (i == null) { i = sections.length; idx.set(label, i); sections.push({ slot: label, games: [] }); }
        sections[i].games.push(g);
    }
    return sections;
}

// '13:00' → '1:00 PM ET' (ET times from the schedule).
function fmtTime(t: string): string {
    const [h, m] = t.split(':').map(n => parseInt(n, 10));
    if (isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm} ET`;
}

// Human "time ago" from an ISO date, e.g. "3h ago", "2d ago", "just now".
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return `${days}d ago`;
}

/**
 * Data-freshness line. Sleeper/Fleaflicker are live (API per request); Yahoo &
 * MyFFPC are DB-synced, so we show the oldest sync among them as the "last
 * refreshed" and flag when it's stale (> ~2 days).
 */
function FreshnessLine({ sources, lastUpdated, live }: { sources: RootingSource[]; lastUpdated?: number | null; live?: boolean }) {
    const liveCount = sources.filter(s => s.lastSynced === 'live').length;
    const synced = sources.filter(s => s.lastSynced && s.lastSynced !== 'live') as { platform: string; lastSynced: string }[];
    // Oldest sync drives the freshness signal (weakest link).
    const oldest = synced.reduce<string | null>((acc, s) => (!acc || s.lastSynced < acc ? s.lastSynced : acc), null);
    const stale = oldest ? (Date.now() - new Date(oldest).getTime()) > 2 * 24 * 60 * 60 * 1000 : false;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mb-6">
            {live && (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> Live · auto-refreshing
                </span>
            )}
            {live && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
            <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {lastUpdated ? <span>updated {relativeTime(new Date(lastUpdated).toISOString())}</span> : null}
                {lastUpdated && (liveCount > 0 || synced.length > 0) && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
                {liveCount > 0 && <span>{liveCount} league{liveCount !== 1 ? 's' : ''} live</span>}
                {liveCount > 0 && synced.length > 0 && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
                {synced.length > 0 && oldest && (
                    <span className={stale ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                        Yahoo/MyFFPC synced {relativeTime(oldest)}
                        {stale && ' — run a refresh'}
                    </span>
                )}
            </span>
        </div>
    );
}

/** Live game status pill: green when in-progress, grey Final, muted schedule time. */
function GameStatus({ game }: { game: RootingGame }) {
    if (game.live?.state === 'in') {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded-full px-1.5 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                {game.live.shortLabel}
            </span>
        );
    }
    if (game.live?.state === 'post') {
        return <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded-full px-1.5 py-0.5">Final</span>;
    }
    // Pre-game: prefer the schedule day/time we already stamp.
    if (game.gametime) {
        return <span className="text-xs font-normal text-zinc-400">{game.weekday?.slice(0, 3)} {fmtTime(game.gametime)}</span>;
    }
    return null;
}

function GameCard({ game, bumpedIds }: { game: RootingGame; bumpedIds: Set<string> }) {
    // Default to the per-league breakdown; the toggle collapses to the combined
    // aggregate list on demand.
    const [byLeague, setByLeague] = useState(true);
    const isUnknown = game.gameKey === 'UNKNOWN';
    // The per-league breakdown only makes sense for real games with actual
    // FOR/AGAINST starters. Bench-only games (no rooting interest) skip the
    // toggle — they just show the collapsed "My bench" strip.
    const hasStarters = game.forCount > 0 || game.againstCount > 0;
    const canGroup = !isUnknown && hasStarters;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap min-w-0">
                    {isUnknown ? 'No game data' : (
                        <span>
                            {game.teams[0]}{game.live?.teamScores[0] != null ? ` ${game.live.teamScores[0]}` : ''}
                            <span className="text-zinc-400 font-normal"> vs </span>
                            {game.teams[1]}{game.live?.teamScores[1] != null ? ` ${game.live.teamScores[1]}` : ''}
                        </span>
                    )}
                    <GameStatus game={game} />
                </h3>
                <div className="flex items-center gap-2.5 text-xs">
                    {game.forCount > 0 && (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
                            <ThumbsUp className="h-3 w-3" /> {game.forCount}{game.forPoints > 0 && <span className="font-mono font-semibold ml-0.5">{game.forPoints.toFixed(1)}</span>}
                        </span>
                    )}
                    {game.againstCount > 0 && (
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
                            <ThumbsDown className="h-3 w-3" /> {game.againstCount}{game.againstPoints > 0 && <span className="font-mono font-semibold ml-0.5">{game.againstPoints.toFixed(1)}</span>}
                        </span>
                    )}
                    {canGroup && (
                        <button
                            type="button"
                            onClick={() => setByLeague(v => !v)}
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded px-1.5 py-0.5 ring-1 ring-zinc-200 dark:ring-zinc-700 transition-colors"
                            aria-pressed={byLeague}
                            title={byLeague ? 'Show combined list' : 'Break down by league matchup'}
                        >
                            {byLeague ? <List className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                            {byLeague ? 'Combined' : 'By league'}
                        </button>
                    )}
                </div>
            </div>
            {byLeague && canGroup ? (
                <ByLeagueBreakdown game={game} bumpedIds={bumpedIds} />
            ) : hasStarters ? (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {game.players.filter(p => p.side !== 'bench').map(p => <PlayerRow key={p.sleeper_id} p={p} bumped={bumpedIds.has(p.sleeper_id)} />)}
                </ul>
            ) : null}
            <MyBenchStrip game={game} bumpedIds={bumpedIds} />
        </div>
    );
}

/**
 * Combined "My bench" strip at the bottom of a game card: players I roster in
 * this game but start nowhere (and who aren't an opponent's starter). Deduped
 * across my leagues; opponent benches are never shown. Collapsed by default so
 * it stays glanceable (and keeps bench-only games quiet) — tap to expand.
 */
function MyBenchStrip({ game, bumpedIds }: { game: RootingGame; bumpedIds: Set<string> }) {
    const [open, setOpen] = useState(false);
    const bench = game.players.filter(p => p.side === 'bench');
    if (bench.length === 0) return null;
    return (
        <div className="mt-2 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-700">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                aria-expanded={open}
            >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                My bench ({bench.length})
            </button>
            {open && (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 opacity-70 mt-0.5">
                    {bench.map(p => <PlayerRow key={`bench-${p.sleeper_id}`} p={p} bumped={bumpedIds.has(p.sleeper_id)} hideBadge />)}
                </ul>
            )}
        </div>
    );
}

/**
 * Per-league breakdown of a single game: for each league that has a stake in
 * this game, a FOR section then an AGAINST section. A player who is FOR in one
 * league and AGAINST in another appears under both (duplication is intended —
 * it mirrors how the matchup actually plays out per league).
 */
function ByLeagueBreakdown({ game, bumpedIds }: { game: RootingGame; bumpedIds: Set<string> }) {
    // Pivot: leagueName → { for: players[], against: players[] }, preserving the
    // game's existing player sort order within each list.
    const byLeague = new Map<string, { forPlayers: RootingPlayer[]; againstPlayers: RootingPlayer[] }>();
    const ensure = (name: string) => {
        let e = byLeague.get(name);
        if (!e) { e = { forPlayers: [], againstPlayers: [] }; byLeague.set(name, e); }
        return e;
    };
    for (const p of game.players) {
        for (const lg of p.forLeagues) ensure(lg).forPlayers.push(p);
        for (const lg of p.againstLeagues) ensure(lg).againstPlayers.push(p);
    }
    const leagueNames = [...byLeague.keys()].sort((a, b) => a.localeCompare(b));

    return (
        <div className="space-y-3">
            {leagueNames.map(name => {
                const { forPlayers, againstPlayers } = byLeague.get(name)!;
                return (
                    <div key={name} className="rounded-lg bg-zinc-50 dark:bg-zinc-800/40 px-2.5 py-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1 truncate">{name}</div>
                        {forPlayers.length > 0 && (
                            <div className="mb-1.5">
                                <div className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 mb-0.5">
                                    <ThumbsUp className="h-3 w-3" /> FOR
                                </div>
                                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {forPlayers.map(p => <PlayerRow key={`for-${p.sleeper_id}`} p={p} bumped={bumpedIds.has(p.sleeper_id)} hideBadge />)}
                                </ul>
                            </div>
                        )}
                        {againstPlayers.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400 mb-0.5">
                                    <ThumbsDown className="h-3 w-3" /> AGAINST
                                </div>
                                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {againstPlayers.map(p => <PlayerRow key={`against-${p.sleeper_id}`} p={p} bumped={bumpedIds.has(p.sleeper_id)} hideBadge />)}
                                </ul>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function PlayerRow({ p, bumped, hideBadge }: { p: RootingPlayer; bumped?: boolean; hideBadge?: boolean }) {
    return (
        <li className={`flex items-center justify-between gap-2 py-1.5 -mx-1 px-1 rounded transition-colors duration-1000 ${bumped ? 'bg-yellow-100 dark:bg-yellow-500/15' : ''}`}>
            <div className="flex items-center gap-2 min-w-0">
                {!hideBadge && (p.side === 'both' ? (
                    <span className="flex-shrink-0 flex items-center gap-0.5">
                        <ThumbsUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </span>
                ) : p.side === 'for' ? (
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : (
                    <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                ))}
                <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{p.full_name}</span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0">{p.nflTeam} · {p.position}</span>
                {p.usageLabel && <span className="text-[10px] text-zinc-400 flex-shrink-0 hidden sm:inline">· {p.usageLabel}</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
                {p.points != null && (
                    <span className={`text-sm font-mono font-semibold tabular-nums ${bumped ? 'text-yellow-700 dark:text-yellow-300' : 'text-zinc-800 dark:text-zinc-200'}`}>
                        {p.points.toFixed(1)}
                    </span>
                )}
                {!hideBadge && (
                    <div className="text-[11px] text-right w-[92px]">
                        {p.forLeagues.length > 0 && (
                            <span className="text-green-600 dark:text-green-400" title={p.forLeagues.join(', ')}>FOR ×{p.forLeagues.length}</span>
                        )}
                        {p.forLeagues.length > 0 && p.againstLeagues.length > 0 && <span className="text-zinc-300 mx-1">·</span>}
                        {p.againstLeagues.length > 0 && (
                            <span className="text-red-600 dark:text-red-400" title={p.againstLeagues.join(', ')}>AGAINST ×{p.againstLeagues.length}</span>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
}
