'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
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

    useEffect(() => {
        if (authLoading || !myTeamsLoaded) return;
        let cancelled = false;

        (async () => {
            setLoading(true); setError(null);
            const refs: Ref[] = [];

            // Sleeper — discover leagues live, attach my saved roster id.
            if (sleeperUserId) {
                try {
                    const res = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${CURRENT_YEAR}`);
                    if (res.ok) {
                        for (const l of (await res.json()) || []) {
                            refs.push({ platform: 'sleeper', leagueId: l.league_id, leagueName: l.name, myRosterId: getMyTeam('sleeper', l.league_id) });
                        }
                    }
                } catch { /* ignore */ }
            }
            // Fleaflicker — ids from auth.
            for (const id of fleaflickerLeagueIds) {
                refs.push({ platform: 'fleaflicker', leagueId: id, myRosterId: getMyTeam('fleaflicker', id) });
            }
            // Yahoo + MyFFPC — DB list endpoints.
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
                if (!cancelled) setGuide(json.guide);
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [authLoading, myTeamsLoaded, sleeperUserId, fleaflickerLeagueIds, getMyTeam]);

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

                {!loading && guide?.sources && guide.sources.length > 0 && <FreshnessLine sources={guide.sources} />}

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
                                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">{section.slot}</h2>
                                <div className="space-y-4">
                                    {section.games.map(game => (
                                        <div key={game.gameKey} className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                                                    {game.gameKey === 'UNKNOWN' ? 'No game data' : `${game.teams[0]} vs ${game.teams[1]}`}
                                                    {game.gametime && <span className="ml-2 text-xs font-normal text-zinc-400">{game.weekday?.slice(0, 3)} {fmtTime(game.gametime)}</span>}
                                                </h3>
                                                <div className="flex items-center gap-2 text-xs">
                                                    {game.forCount > 0 && <span className="text-green-600 dark:text-green-400 flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" /> {game.forCount}</span>}
                                                    {game.againstCount > 0 && <span className="text-red-600 dark:text-red-400 flex items-center gap-0.5"><ThumbsDown className="h-3 w-3" /> {game.againstCount}</span>}
                                                </div>
                                            </div>
                                            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                                {game.players.map(p => <PlayerRow key={p.sleeper_id} p={p} />)}
                                            </ul>
                                        </div>
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
function FreshnessLine({ sources }: { sources: RootingSource[] }) {
    const live = sources.filter(s => s.lastSynced === 'live').length;
    const synced = sources.filter(s => s.lastSynced && s.lastSynced !== 'live') as { platform: string; lastSynced: string }[];
    // Oldest sync drives the freshness signal (weakest link).
    const oldest = synced.reduce<string | null>((acc, s) => (!acc || s.lastSynced < acc ? s.lastSynced : acc), null);
    const stale = oldest ? (Date.now() - new Date(oldest).getTime()) > 2 * 24 * 60 * 60 * 1000 : false;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mb-6">
            <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {live > 0 && <span>{live} league{live !== 1 ? 's' : ''} live</span>}
                {live > 0 && synced.length > 0 && <span className="text-zinc-300 dark:text-zinc-600">·</span>}
                {synced.length > 0 && oldest && (
                    <span className={stale ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                        Yahoo/MyFFPC synced {relativeTime(oldest)}
                        {stale && ' — run a refresh'}
                    </span>
                )}
            </span>
            {synced.length === 0 && live === 0 && <span>No data sources.</span>}
        </div>
    );
}

function PlayerRow({ p }: { p: RootingPlayer }) {
    return (
        <li className="flex items-center justify-between gap-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
                {p.side === 'both' ? (
                    <span className="flex-shrink-0 flex items-center gap-0.5">
                        <ThumbsUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </span>
                ) : p.side === 'for' ? (
                    <ThumbsUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : (
                    <ThumbsDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400 flex-shrink-0" />
                )}
                <span className="text-sm text-zinc-800 dark:text-zinc-200 truncate">{p.full_name}</span>
                <span className="text-[10px] text-zinc-400 flex-shrink-0">{p.nflTeam} · {p.position}</span>
            </div>
            <div className="text-[11px] flex-shrink-0 text-right">
                {p.forLeagues.length > 0 && (
                    <span className="text-green-600 dark:text-green-400" title={p.forLeagues.join(', ')}>FOR ×{p.forLeagues.length}</span>
                )}
                {p.forLeagues.length > 0 && p.againstLeagues.length > 0 && <span className="text-zinc-300 mx-1">·</span>}
                {p.againstLeagues.length > 0 && (
                    <span className="text-red-600 dark:text-red-400" title={p.againstLeagues.join(', ')}>AGAINST ×{p.againstLeagues.length}</span>
                )}
            </div>
        </li>
    );
}
