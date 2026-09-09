'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Loader2, PlusCircle, ArrowRightLeft, TrendingUp, TrendingDown, Ban } from 'lucide-react';
import { useAuth } from '@/hooks/useUser';
import { useMyTeams } from '@/hooks/useMyTeams';

const CURRENT_YEAR = new Date().getFullYear();

interface TradePlayerLite { full_name: string; position: string | null; marketValue: number | null; }
interface Advisor { verdict: string; summary: string; reasons: string[]; pitch: string; score: number; }
interface TargetedTrade {
    proposal: { iSend: TradePlayerLite; iReceive: TradePlayerLite } | null;
    advisor: Advisor | null;
    valueGapPct: number | null;
    reason: string;
    rosConsidered: boolean;
}
interface LeagueSituation {
    league: string; platform: string; leagueName?: string; myTeamKnown?: boolean;
    status: 'mine' | 'opponent' | 'available' | 'not-in-league' | 'error';
    ownerName?: string; trade?: TargetedTrade | null;
}
interface Situation {
    player: { sleeper_id: string; full_name: string; position: string | null; team: string | null; age: number | null };
    tag: 'buy' | 'sell' | null;
    writeup: string | null;
    perLeague: LeagueSituation[];
}

export default function PlayerDetailPage({ params }: { params: Promise<{ sleeperId: string }> }) {
    const { sleeperId } = use(params);
    const { sleeperUserId, fleaflickerLeagueIds, sleeperLeagueFormats, fleaflickerLeagueFormats, leagueTypes, isLoading: authLoading } = useAuth();
    const { getMyTeam, loaded: myTeamsLoaded } = useMyTeams();

    const [sit, setSit] = useState<Situation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading || !myTeamsLoaded) return;
        let cancelled = false;
        (async () => {
            setLoading(true); setError(null);
            const refs: any[] = [];
            if (sleeperUserId) {
                try {
                    const res = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${CURRENT_YEAR}`);
                    if (res.ok) for (const l of (await res.json()) || []) {
                        refs.push({ platform: 'sleeper', leagueId: l.league_id, leagueName: l.name, format: sleeperLeagueFormats[l.league_id] || '1qb', type: leagueTypes[l.league_id] || 'dynasty', myRosterId: getMyTeam('sleeper', l.league_id) });
                    }
                } catch { /* ignore */ }
            }
            for (const id of fleaflickerLeagueIds) {
                refs.push({ platform: 'fleaflicker', leagueId: id, format: fleaflickerLeagueFormats[id] || '1qb', type: leagueTypes[id] || 'dynasty', myRosterId: getMyTeam('fleaflicker', id) });
            }
            for (const [platform, url] of [['yahoo', '/api/yahoo?list=true'], ['myffpc', '/api/myffpc?list=true']] as const) {
                try {
                    const res = await fetch(url);
                    if (res.ok) for (const l of (await res.json())?.leagues || []) {
                        refs.push({ platform, leagueId: l.league_id, leagueName: l.name || undefined, format: l.scoring_format === 'sf' ? 'sf' : '1qb', type: platform === 'yahoo' ? 'redraft' : 'dynasty', myRosterId: getMyTeam(platform, l.league_id) });
                    }
                } catch { /* ignore */ }
            }

            try {
                // Read the tag so the API frames buy vs sell.
                const tagRes = await fetch('/api/portfolio/tags');
                const tags = tagRes.ok ? (await tagRes.json()).tags : [];
                const tag = tags.find((t: any) => t.sleeper_id === sleeperId)?.tag;

                const res = await fetch('/api/portfolio/player-situation', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sleeper_id: sleeperId, tag, refs }),
                });
                if (!res.ok) throw new Error(`${res.status}`);
                if (!cancelled) setSit(await res.json());
            } catch (e: any) {
                if (!cancelled) setError(e.message || 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [authLoading, myTeamsLoaded, sleeperId, sleeperUserId, fleaflickerLeagueIds, sleeperLeagueFormats, fleaflickerLeagueFormats, leagueTypes, getMyTeam]);

    const p = sit?.player;
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                    <Link href="/portfolio" className="hover:text-indigo-600 dark:hover:text-indigo-400">Portfolio</Link>
                    <span>/</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">{p?.full_name || 'Player'}</span>
                </div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">{p?.full_name || '…'}</h1>
                    {sit?.tag === 'buy' && <span className="text-xs font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 rounded px-2 py-0.5">BUY / ADD</span>}
                    {sit?.tag === 'sell' && <span className="text-xs font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 rounded px-2 py-0.5">SELL / DROP</span>}
                </div>
                {p && <p className="text-sm text-zinc-500 mt-0.5 mb-6">{p.position}{p.team ? ` · ${p.team}` : ''}{p.age ? ` · age ${p.age}` : ''}</p>}

                {loading && <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Analyzing across your leagues…</div>}
                {error && <div className="text-sm text-red-500">Failed to load ({error}).</div>}

                {sit && (
                    <>
                        {/* Writeup */}
                        {sit.writeup && (
                            <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-5 mb-5">
                                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">Analyst take</h2>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">{sit.writeup}</p>
                            </div>
                        )}

                        {/* Cross-league breakdown */}
                        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Across your leagues</h2>
                        <div className="space-y-3">
                            {sit.perLeague.filter(l => l.status !== 'not-in-league' && l.status !== 'error').length === 0 && (
                                <div className="text-sm text-zinc-400">Not found on any of your rosters, opponents, or waivers this week.</div>
                            )}
                            {sit.perLeague.map((lg, i) => <LeagueCard key={i} lg={lg} tag={sit.tag} />)}
                        </div>

                        <p className="text-[11px] text-zinc-400 mt-4">
                            Trades are 1-for-1 and judged by market value (what a rival will accept). Rest-of-season value isn&apos;t factored in yet.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

function LeagueCard({ lg, tag }: { lg: LeagueSituation; tag: 'buy' | 'sell' | null }) {
    if (lg.status === 'not-in-league' || lg.status === 'error') return null;
    const PLATFORM: Record<string, string> = { sleeper: 'Sleeper', fleaflicker: 'Fleaflicker', yahoo: 'Yahoo', myffpc: 'MyFFPC' };

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{lg.leagueName || lg.league}</span>
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">{PLATFORM[lg.platform] || lg.platform}</span>
            </div>

            {lg.status === 'available' && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                    <PlusCircle className="h-4 w-4" /> Available — add off waivers.
                </div>
            )}

            {lg.status === 'mine' && (
                <div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">On your roster{lg.ownerName ? ` (${lg.ownerName})` : ''}.</div>
                    {tag === 'sell' && (lg.trade ? <TradeBlock trade={lg.trade} /> :
                        <div className="text-sm text-zinc-500 mt-1 flex items-center gap-1.5"><Ban className="h-3.5 w-3.5" /> No fair trade found — consider dropping if he&apos;s low value.</div>)}
                </div>
            )}

            {lg.status === 'opponent' && (
                <div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-400">Rostered by {lg.ownerName || 'an opponent'}.</div>
                    {!lg.myTeamKnown && <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Pick your team for this league on the Portfolio page to get a trade proposal.</div>}
                    {lg.trade ? <TradeBlock trade={lg.trade} /> : lg.myTeamKnown && <div className="text-sm text-zinc-500 mt-1">No trade proposal available.</div>}
                </div>
            )}
        </div>
    );
}

const VERDICT_STYLE: Record<string, { cls: string; icon: React.ReactNode }> = {
    'strong-accept': { cls: 'text-green-700 dark:text-green-300', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    'accept': { cls: 'text-green-600 dark:text-green-400', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    'even': { cls: 'text-zinc-500', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    'decline': { cls: 'text-amber-600 dark:text-amber-400', icon: <TrendingDown className="h-3.5 w-3.5" /> },
    'strong-decline': { cls: 'text-red-600 dark:text-red-400', icon: <TrendingDown className="h-3.5 w-3.5" /> },
};

function TradeBlock({ trade }: { trade: TargetedTrade }) {
    if (!trade.proposal) {
        return <div className="text-sm text-zinc-500 mt-2 flex items-start gap-1.5"><Ban className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> {trade.reason}</div>;
    }
    const v = trade.advisor?.verdict || 'even';
    const style = VERDICT_STYLE[v] || VERDICT_STYLE.even;
    return (
        <div className="mt-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3">
            <div className="flex items-center gap-2 text-sm">
                <ArrowRightLeft className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                <span className="text-zinc-800 dark:text-zinc-200">
                    Send <span className="font-medium">{trade.proposal.iSend.full_name}</span> ({trade.proposal.iSend.position})
                    {' '}→ get <span className="font-medium">{trade.proposal.iReceive.full_name}</span> ({trade.proposal.iReceive.position})
                </span>
            </div>
            {trade.advisor && (
                <div className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${style.cls}`}>
                    {style.icon} {v.replace('-', ' ')}{typeof trade.valueGapPct === 'number' ? ` · ${trade.valueGapPct > 0 ? '+' : ''}${trade.valueGapPct}% value` : ''}
                </div>
            )}
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{trade.reason}</div>
            {trade.advisor?.pitch && <div className="text-[11px] text-zinc-400 mt-1 italic">Pitch: {trade.advisor.pitch}</div>}
        </div>
    );
}
