'use client';

import { useCallback, useEffect, useState } from 'react';

interface WeekSummary { week: number; kinds: Record<string, number>; total: number }

/**
 * Admin form: upload a weekly QB or Flex ranking CSV for a specific week.
 * CSV columns: Rank, FLEX (or QB/Player), Team, Opponent, Total, Pos, Matchup.
 */
export function WeeklyRankingsForm() {
    const [file, setFile] = useState<File | null>(null);
    const [kind, setKind] = useState<'flex' | 'qb' | 'dst'>('flex');
    const [week, setWeek] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Existing uploads (for the manage/delete section).
    const [weeks, setWeeks] = useState<WeekSummary[]>([]);
    const [deleting, setDeleting] = useState<string | null>(null);

    const loadWeeks = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/upload-weekly');
            const data = await res.json();
            if (res.ok) setWeeks(data.weeks || []);
        } catch { /* non-fatal */ }
    }, []);

    useEffect(() => { loadWeeks(); }, [loadWeeks]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) { setError('Please select a CSV file.'); return; }
        setLoading(true); setMessage(''); setError('');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('kind', kind);
            fd.append('week', String(week));
            const res = await fetch('/api/admin/upload-weekly', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setMessage(`Success! Week ${data.week} ${data.kind.toUpperCase()}: ${data.totalRows} rows, ${data.matched} matched, ${data.unmatched} unmatched.${data.unmatchedNames?.length ? `\nUnmatched: ${data.unmatchedNames.join(', ')}` : ''}`);
            setFile(null);
            const el = document.getElementById('weekly-file') as HTMLInputElement;
            if (el) el.value = '';
            loadWeeks();
        } catch (err: any) {
            setError(err.message || 'Upload error');
        } finally {
            setLoading(false);
        }
    };

    const del = async (w: number, k?: string) => {
        const label = k ? `Week ${w} ${k.toUpperCase()}` : `ALL of Week ${w}`;
        if (!window.confirm(`Delete ${label} rankings? This can't be undone.`)) return;
        const tag = `${w}:${k ?? 'all'}`;
        setDeleting(tag); setMessage(''); setError('');
        try {
            const qs = new URLSearchParams({ week: String(w) });
            if (k) qs.set('kind', k);
            const res = await fetch(`/api/admin/upload-weekly?${qs}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');
            setMessage(`Deleted ${label}: ${data.deleted} row${data.deleted === 1 ? '' : 's'} removed.`);
            loadWeeks();
        } catch (err: any) {
            setError(err.message || 'Delete error');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-xl ring-1 ring-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Weekly Rankings (QB / Flex / DST)</h2>
            <p className="text-sm text-zinc-400 mb-4">
                Upload a start/sit CSV for a specific week. Flex/QB columns: Rank, FLEX (or QB), Team, Opponent, Total, Pos, Matchup.
                DST columns: Rank, Defense, Opponent, Spread, Tier (full team names OK, e.g. &quot;Los Angeles Chargers&quot;).
            </p>
            <form onSubmit={submit} className="space-y-4">
                <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500">
                        <input type="radio" checked={kind === 'flex'} onChange={() => setKind('flex')} className="text-blue-500" />
                        <span className="text-white">Flex</span>
                    </label>
                    <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500">
                        <input type="radio" checked={kind === 'qb'} onChange={() => setKind('qb')} className="text-blue-500" />
                        <span className="text-white">QB</span>
                    </label>
                    <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500">
                        <input type="radio" checked={kind === 'dst'} onChange={() => setKind('dst')} className="text-blue-500" />
                        <span className="text-white">DST</span>
                    </label>
                    <label className="flex items-center gap-2 bg-zinc-800/50 px-4 py-3 rounded-lg border border-zinc-700">
                        <span className="text-white text-sm">Week</span>
                        <input type="number" min={1} max={25} value={week} onChange={e => setWeek(parseInt(e.target.value) || 1)}
                            className="w-16 bg-zinc-900 text-white rounded px-2 py-1 border border-zinc-700" />
                    </label>
                </div>
                <input id="weekly-file" type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain,application/octet-stream" onChange={e => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500" />
                <button type="submit" disabled={loading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50">
                    {loading ? 'Uploading…' : 'Upload Weekly Rankings'}
                </button>
            </form>
            {message && <pre className="mt-4 text-sm text-green-400 whitespace-pre-wrap">{message}</pre>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            {/* Manage / delete existing uploads */}
            <div className="mt-6 pt-5 border-t border-white/10">
                <h3 className="text-sm font-semibold text-white mb-1">Uploaded weeks</h3>
                <p className="text-xs text-zinc-500 mb-3">
                    Delete a mistaken upload (e.g. rankings tagged with the wrong week). Removes the rows for that week.
                </p>
                {weeks.length === 0 ? (
                    <p className="text-sm text-zinc-500">No weekly rankings uploaded yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {weeks.map(w => (
                            <li key={w.week} className="flex items-center justify-between gap-3 bg-zinc-800/40 rounded-lg px-3 py-2 flex-wrap">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <span className="text-white font-medium text-sm">Week {w.week}</span>
                                    <span className="text-xs text-zinc-400">{w.total} rows</span>
                                    <span className="flex items-center gap-1.5 flex-wrap">
                                        {Object.entries(w.kinds).sort().map(([k, n]) => (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => del(w.week, k)}
                                                disabled={deleting != null}
                                                title={`Delete Week ${w.week} ${k.toUpperCase()} (${n} rows)`}
                                                className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 hover:bg-red-600 hover:text-white disabled:opacity-50 transition-colors"
                                            >
                                                {k} {n} ✕
                                            </button>
                                        ))}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => del(w.week)}
                                    disabled={deleting != null}
                                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600/90 text-white font-medium hover:bg-red-500 disabled:opacity-50"
                                >
                                    {deleting === `${w.week}:all` ? 'Deleting…' : `Delete week ${w.week}`}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
