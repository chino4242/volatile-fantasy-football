'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';

type PositionGroup = 'FLEX' | 'RB' | 'WR' | 'TE' | 'QB';
type Metric =
    | 'opportunities' | 'targets' | 'carries' | 'receptions'
    | 'receiving_yards' | 'rushing_yards' | 'passing_yards' | 'passing_attempts'
    | 'target_share' | 'air_yards_share' | 'wopr' | 'fantasy_points_ppr';

interface Row {
    gsis_id: string; name: string; position: string; team: string | null;
    games: number; opportunities: number; targets: number; carries: number;
    receptions: number; receiving_yards: number; rushing_yards: number;
    passing_yards: number; passing_attempts: number;
    target_share: number | null; air_yards_share: number | null;
    wopr: number | null; fantasy_points_ppr: number;
}
interface ApiResult {
    season: number; week: number | 'cumulative'; availableWeeks: number[];
    position: PositionGroup; metric: Metric; rows: Row[]; error?: string;
}

const POSITIONS: PositionGroup[] = ['FLEX', 'RB', 'WR', 'TE', 'QB'];

// Metric picker options, grouped by what makes sense. `opportunities` first.
// `short` is the compact table-header label; `help` is a hover tooltip.
const METRICS: { key: Metric; label: string; kind: 'int' | 'rate' | 'pts'; short?: string; help?: string }[] = [
    { key: 'opportunities', label: 'Opportunities (tgt+car)', kind: 'int', short: 'Opp', help: 'Opportunities = targets + carries (+ pass attempts for QBs). Raw volume.' },
    { key: 'targets', label: 'Targets', kind: 'int', short: 'Tgt' },
    { key: 'carries', label: 'Carries', kind: 'int', short: 'Car' },
    { key: 'receptions', label: 'Receptions', kind: 'int', short: 'Rec' },
    { key: 'receiving_yards', label: 'Receiving yards', kind: 'int', short: 'Rec yd' },
    { key: 'rushing_yards', label: 'Rushing yards', kind: 'int', short: 'Rush yd' },
    { key: 'passing_yards', label: 'Passing yards', kind: 'int', short: 'Pass yd' },
    { key: 'passing_attempts', label: 'Pass attempts', kind: 'int', short: 'Att' },
    { key: 'target_share', label: 'Target share', kind: 'rate', short: 'Tgt%', help: 'Share of the team\u2019s targets that went to this player.' },
    { key: 'air_yards_share', label: 'Air yards share', kind: 'rate', short: 'AY%', help: 'Share of the team\u2019s air yards (downfield target distance) owned by this player.' },
    { key: 'wopr', label: 'WOPR', kind: 'rate', short: 'WOPR', help: 'Weighted Opportunity Rating = 1.5\u00d7target share + 0.7\u00d7air-yards share. Higher = bigger role in the passing game (\u22730.6 elite, \u22730.4 solid starter).' },
    { key: 'fantasy_points_ppr', label: 'Fantasy pts (PPR)', kind: 'pts', short: 'PPR' },
];

// Columns shown per position group (the active sort metric is highlighted).
const COLUMNS_FLEX: Metric[] = ['opportunities', 'targets', 'carries', 'receptions', 'receiving_yards', 'rushing_yards', 'target_share', 'air_yards_share', 'wopr', 'fantasy_points_ppr'];
const COLUMNS_QB: Metric[] = ['opportunities', 'passing_attempts', 'passing_yards', 'carries', 'rushing_yards', 'fantasy_points_ppr'];

function fmt(v: number | null, kind: 'int' | 'rate' | 'pts'): string {
    if (v == null) return '—';
    if (kind === 'rate') return (v * 100).toFixed(1) + '%';
    if (kind === 'pts') return v.toFixed(1);
    return String(Math.round(v));
}
function metricMeta(m: Metric) { return METRICS.find(x => x.key === m)!; }

export default function StatsPage() {
    const [week, setWeek] = useState<number | 'cumulative'>('cumulative');
    const [position, setPosition] = useState<PositionGroup>('FLEX');
    const [metric, setMetric] = useState<Metric>('opportunities');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ApiResult | null>(null);
    // Track whether we've defaulted the week to the latest single week yet.
    const [initialized, setInitialized] = useState(false);

    const load = useCallback(async (w: number | 'cumulative', pos: PositionGroup, m: Metric) => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ week: String(w), position: pos, metric: m, limit: '100' });
            const res = await fetch(`/api/stats/opportunities?${params}`);
            const json: ApiResult = await res.json();
            if (!res.ok) throw new Error(json.error || `Failed (HTTP ${res.status})`);
            setData(json);
            return json;
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load stats');
            setData(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load: fetch cumulative to discover available weeks, then default
    // the view to the latest single week (most useful "what happened this week").
    useEffect(() => {
        (async () => {
            const json = await load('cumulative', 'FLEX', 'opportunities');
            if (json && json.availableWeeks.length > 0) {
                const latest = json.availableWeeks[json.availableWeeks.length - 1];
                setWeek(latest);
                await load(latest, 'FLEX', 'opportunities');
            }
            setInitialized(true);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Refetch on control changes (after the initial default is set).
    useEffect(() => {
        if (!initialized) return;
        load(week, position, metric);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [week, position, metric]);

    const columns = position === 'QB' ? COLUMNS_QB : COLUMNS_FLEX;
    const availableWeeks = data?.availableWeeks ?? [];

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                    <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">Home</Link>
                    <span>/</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">Statistics</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                    <BarChart3 className="h-6 w-6 text-indigo-500" /> Statistics
                </h1>
                <p className="text-sm text-zinc-500 mb-6">
                    League-agnostic, NFL-wide opportunity &amp; production. See who&apos;s earning volume
                    (targets + carries) this week or across the season so far.
                </p>

                {/* Controls */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4 sm:p-5 mb-6">
                    <div className="flex items-end gap-4 flex-wrap">
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Time
                            <select value={String(week)} onChange={e => setWeek(e.target.value === 'cumulative' ? 'cumulative' : Number(e.target.value))}
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                                <option value="cumulative">Season to date</option>
                                {availableWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Position
                            <select value={position} onChange={e => setPosition(e.target.value as PositionGroup)}
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Sort by
                            <select value={metric} onChange={e => setMetric(e.target.value as Metric)}
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                                {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </select>
                        </label>
                        {data && <span className="text-xs text-zinc-400 pb-2">Season {data.season}</span>}
                    </div>
                </div>

                {error && <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-red-500 text-sm mb-6">{error}</div>}

                {loading && (
                    <div className="flex items-center justify-center gap-2 text-zinc-400 py-16">
                        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
                    </div>
                )}

                {!loading && data && data.rows.length === 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-500 text-sm">
                        No stats for these filters yet.
                    </div>
                )}

                {!loading && data && data.rows.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wide text-zinc-400 text-left border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="py-2.5 pl-4 pr-2 font-semibold">#</th>
                                    <th className="py-2.5 px-2 font-semibold">Player</th>
                                    <th className="py-2.5 px-2 font-semibold">Pos</th>
                                    {week === 'cumulative' && <th className="py-2.5 px-2 font-semibold text-right">G</th>}
                                    {columns.map(c => {
                                        const m = metricMeta(c);
                                        return (
                                            <th key={c} title={m.help ?? m.label}
                                                className={`py-2.5 px-2 font-semibold text-right whitespace-nowrap ${m.help ? 'cursor-help' : ''} ${c === metric ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                                                {m.short ?? m.label}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {data.rows.map((r, i) => (
                                    <tr key={r.gsis_id} className="text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                                        <td className="py-2 pl-4 pr-2 text-zinc-400 font-mono text-xs">{i + 1}</td>
                                        <td className="py-2 px-2 whitespace-nowrap">
                                            {r.name} <span className="text-[10px] text-zinc-400">{r.team}</span>
                                        </td>
                                        <td className="py-2 px-2 text-zinc-500">{r.position}</td>
                                        {week === 'cumulative' && <td className="py-2 px-2 text-right font-mono text-zinc-500">{r.games}</td>}
                                        {columns.map(c => {
                                            const kind = metricMeta(c).kind;
                                            const val = (r as unknown as Record<Metric, number | null>)[c];
                                            return (
                                                <td key={c} className={`py-2 px-2 text-right font-mono ${c === metric ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                                                    {fmt(val, kind)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p className="mt-4 text-[11px] text-zinc-400">
                    Scoped to fantasy-relevant players (those matched to the players DB). Rate stats
                    (shares, WOPR) are averaged across weeks in season-to-date mode; volume stats are summed.
                    Snaps, routes run, and raw air-yard totals aren&apos;t available from the current data source
                    (air-yards <em>share</em> is).
                    <br />
                    <span className="text-zinc-500">Tgt% </span>= target share ·
                    <span className="text-zinc-500"> AY% </span>= air-yards share ·
                    <span className="text-zinc-500"> WOPR </span>= Weighted Opportunity Rating (1.5×target share + 0.7×air-yards share) — a player&apos;s overall share of the passing game.
                </p>
            </div>
        </div>
    );
}
