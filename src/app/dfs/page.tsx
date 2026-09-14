'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2, Upload, Trophy, Search } from 'lucide-react';

interface LineupSlot { slot: string; player: { name: string; position: string; salary: number; projection: number; team: string | null; teamTotal: number | null } }
interface Lineup { slots: LineupSlot[]; totalSalary: number; totalProjection: number; totalTeamEnvironment: number }
interface OptimizeResponse {
    week: number;
    lineups: Lineup[];
    stats: { csvPlayers: number; csvSkipped: number; projected: number; unranked: number };
    unrankedSample: { name: string; position: string; salary: number }[];
    error?: string;
}

interface ValuePlayer { name: string; position: string; team: string | null; opponent: string | null; salary: number; projection: number; valuePerK: number }
interface ValueResponse { week: number; maxSalary: number | null; position: string; count: number; players: ValuePlayer[]; error?: string }

const CAP = 50000;
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX', 'DST'] as const;

export default function DfsPage() {
    const [fileName, setFileName] = useState<string>('');
    const [csv, setCsv] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);

    // Optimizer state
    const [count, setCount] = useState(3);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<OptimizeResponse | null>(null);

    // Value-finder state
    const [maxSalary, setMaxSalary] = useState<string>('4400');
    const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
    const [valueLoading, setValueLoading] = useState(false);
    const [valueError, setValueError] = useState<string | null>(null);
    const [value, setValue] = useState<ValueResponse | null>(null);

    const onFile = (f: File | null) => {
        setFile(f);
        setFileName(f?.name || '');
        setCsv('');
        setError(null);
        setResult(null);
        setValue(null);
        setValueError(null);
    };

    /** Read the chosen file's text once, caching it in state. */
    const readCsv = async (): Promise<string | null> => {
        if (csv) return csv;
        if (!file) return null;
        const text = await file.text();
        setCsv(text);
        return text;
    };

    const optimize = async () => {
        setError(null); setResult(null);
        const text = await readCsv();
        if (!text || !text.trim()) { setError('Choose a DraftKings salary CSV first.'); return; }
        setLoading(true);
        try {
            const res = await fetch('/api/dfs/optimize', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: text, count }),
            });
            const data: OptimizeResponse = await res.json();
            if (!res.ok) throw new Error(data.error || `Optimize failed (HTTP ${res.status})`);
            setResult(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to optimize');
        } finally {
            setLoading(false);
        }
    };

    const findValue = async () => {
        setValueError(null); setValue(null);
        const text = await readCsv();
        if (!text || !text.trim()) { setValueError('Choose a DraftKings salary CSV first.'); return; }
        const max = maxSalary.trim() === '' ? null : Number(maxSalary.replace(/[^0-9]/g, ''));
        setValueLoading(true);
        try {
            const res = await fetch('/api/dfs/value', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csv: text, maxSalary: max, position: position === 'ALL' ? null : position }),
            });
            const data: ValueResponse = await res.json();
            if (!res.ok) throw new Error(data.error || `Value lookup failed (HTTP ${res.status})`);
            setValue(data);
        } catch (e: unknown) {
            setValueError(e instanceof Error ? e.message : 'Failed to compute value');
        } finally {
            setValueLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-1">
                    <Link href="/" className="hover:text-indigo-600 dark:hover:text-indigo-400">Home</Link>
                    <span>/</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">DraftKings Optimizer</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">DraftKings Lineup Optimizer</h1>
                <p className="text-sm text-zinc-500 mb-6">
                    Upload this week&apos;s DraftKings Classic salary CSV. We project each player from the site&apos;s
                    weekly rankings (rank → DK points) and build the top salary-capped lineups (${CAP.toLocaleString()} cap, no kicker).
                </p>

                {/* Upload */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4 sm:p-6 mb-6">
                    <label className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold cursor-pointer">
                            <Upload className="h-4 w-4" /> Choose DK CSV
                            <input type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain,application/octet-stream" className="hidden"
                                onChange={e => onFile(e.target.files?.[0] || null)} />
                        </span>
                        <span className="text-sm text-zinc-500 truncate">{fileName || 'DKSalaries.csv'}</span>
                    </label>
                </div>

                {/* Value finder */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4 sm:p-6 mb-6">
                    <h2 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2"><Search className="h-4 w-4 text-indigo-500" /> Value finder</h2>
                    <p className="text-xs text-zinc-500 mb-4">Best plays under a salary cap, ranked by projection (with value per $1k).</p>
                    <div className="flex items-end gap-4 flex-wrap">
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Max salary
                            <div className="flex items-center gap-1">
                                <span className="text-zinc-400">$</span>
                                <input type="number" inputMode="numeric" step={100} min={0} value={maxSalary}
                                    onChange={e => setMaxSalary(e.target.value)} placeholder="any"
                                    className="w-28 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200" />
                            </div>
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-zinc-500">
                            Position
                            <select value={position} onChange={e => setPosition(e.target.value as (typeof POSITIONS)[number])}
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </label>
                        <button onClick={findValue} disabled={valueLoading || !file}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold">
                            {valueLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Find value
                        </button>
                    </div>
                    {valueError && <div className="mt-3 text-sm text-red-500">{valueError}</div>}
                    {value && (
                        <div className="mt-4">
                            <div className="text-xs text-zinc-500 mb-2">
                                Week {value.week} · {value.count} {value.position === 'ALL' ? 'players' : value.position}
                                {value.maxSalary != null && ` ≤ $${value.maxSalary.toLocaleString()}`}
                            </div>
                            {value.players.length === 0 ? (
                                <div className="text-sm text-zinc-500">No ranked players match those filters.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[11px] uppercase tracking-wide text-zinc-400 text-left">
                                                <th className="py-1.5 pr-2 font-semibold">Player</th>
                                                <th className="py-1.5 px-2 font-semibold">Pos</th>
                                                <th className="py-1.5 px-2 font-semibold text-right">Salary</th>
                                                <th className="py-1.5 px-2 font-semibold text-right">Proj</th>
                                                <th className="py-1.5 pl-2 font-semibold text-right">Val/$1k</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {value.players.slice(0, 40).map((p, i) => (
                                                <tr key={i} className="text-zinc-800 dark:text-zinc-200">
                                                    <td className="py-1.5 pr-2">
                                                        {p.name}
                                                        <span className="text-[10px] text-zinc-400 ml-1">{p.team}{p.opponent ? ` vs ${p.opponent}` : ''}</span>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-zinc-500">{p.position}</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-zinc-500">${p.salary.toLocaleString()}</td>
                                                    <td className="py-1.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{p.projection.toFixed(1)}</td>
                                                    <td className="py-1.5 pl-2 text-right font-mono text-indigo-600 dark:text-indigo-400">{p.valuePerK.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Optimizer */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4 sm:p-6 mb-6">
                    <h2 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2"><Trophy className="h-4 w-4 text-emerald-500" /> Lineup optimizer</h2>
                    <p className="text-xs text-zinc-500 mb-4">Top salary-capped Classic lineups (QB/RB/RB/WR/WR/WR/TE/FLEX/DST).</p>
                    <div className="flex items-center gap-4 flex-wrap">
                        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                            Lineups
                            <select value={count} onChange={e => setCount(Number(e.target.value))}
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5">
                                {[1, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <button onClick={optimize} disabled={loading || !file}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                            Optimize
                        </button>
                    </div>
                    {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
                </div>

                {result && (
                    <>
                        <div className="text-xs text-zinc-500 mb-3">
                            Week {result.week} · {result.stats.projected} of {result.stats.csvPlayers} CSV players projected
                            {result.stats.unranked > 0 && ` · ${result.stats.unranked} unranked (excluded)`}
                        </div>
                        <div className="space-y-4">
                            {result.lineups.length === 0 && (
                                <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 ring-1 ring-zinc-900/5 text-zinc-500 text-sm">
                                    No valid lineup — not enough ranked players at each position in the CSV to fill a Classic roster.
                                </div>
                            )}
                            {result.lineups.map((l, i) => (
                                <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm p-4 sm:p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
                                                Lineup {i + 1}
                                            </span>
                                        </h3>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="text-zinc-500">Proj <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{l.totalProjection.toFixed(1)}</span></span>
                                            <span className={`text-zinc-500 ${l.totalSalary > CAP ? 'text-red-500' : ''}`}>
                                                ${l.totalSalary.toLocaleString()} <span className="text-zinc-400">/ ${CAP.toLocaleString()}</span>
                                            </span>
                                        </div>
                                    </div>
                                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {l.slots.map((s, j) => (
                                            <li key={j} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-[10px] font-bold text-zinc-400 w-9">{s.slot}</span>
                                                    <span className="text-zinc-800 dark:text-zinc-200 truncate">{s.player.name}</span>
                                                    <span className="text-[10px] text-zinc-400">{s.player.position} · {s.player.team}</span>
                                                </div>
                                                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{s.player.projection.toFixed(1)}</span>
                                                    <span className="font-mono text-zinc-500 w-16 text-right">${s.player.salary.toLocaleString()}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-[11px] text-zinc-400">
                            Projections are modeled from the site&apos;s weekly rank (no true DK projections), with implied team total
                            as a tiebreaker. Use as a guide, not gospel.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
