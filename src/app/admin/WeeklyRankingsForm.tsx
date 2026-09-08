'use client';

import { useState } from 'react';

/**
 * Admin form: upload a weekly QB or Flex ranking CSV for a specific week.
 * CSV columns: Rank, FLEX (or QB/Player), Team, Opponent, Total, Pos, Matchup.
 */
export function WeeklyRankingsForm() {
    const [file, setFile] = useState<File | null>(null);
    const [kind, setKind] = useState<'flex' | 'qb'>('flex');
    const [week, setWeek] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

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
        } catch (err: any) {
            setError(err.message || 'Upload error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-xl ring-1 ring-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Weekly Rankings (QB / Flex)</h2>
            <p className="text-sm text-zinc-400 mb-4">
                Upload a start/sit CSV for a specific week. Columns: Rank, FLEX (or QB), Team, Opponent, Total, Pos, Matchup.
            </p>
            <form onSubmit={submit} className="space-y-4">
                <div className="flex gap-4">
                    <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500">
                        <input type="radio" checked={kind === 'flex'} onChange={() => setKind('flex')} className="text-blue-500" />
                        <span className="text-white">Flex</span>
                    </label>
                    <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500">
                        <input type="radio" checked={kind === 'qb'} onChange={() => setKind('qb')} className="text-blue-500" />
                        <span className="text-white">QB</span>
                    </label>
                    <label className="flex items-center gap-2 bg-zinc-800/50 px-4 py-3 rounded-lg border border-zinc-700">
                        <span className="text-white text-sm">Week</span>
                        <input type="number" min={1} max={25} value={week} onChange={e => setWeek(parseInt(e.target.value) || 1)}
                            className="w-16 bg-zinc-900 text-white rounded px-2 py-1 border border-zinc-700" />
                    </label>
                </div>
                <input id="weekly-file" type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-zinc-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500" />
                <button type="submit" disabled={loading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50">
                    {loading ? 'Uploading…' : 'Upload Weekly Rankings'}
                </button>
            </form>
            {message && <pre className="mt-4 text-sm text-green-400 whitespace-pre-wrap">{message}</pre>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
    );
}
