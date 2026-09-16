'use client';

import { useState } from 'react';

/**
 * Admin form: paste a fantasy-podcast transcript for a show + week.
 * LLM-extracts player-claim atoms → pod_claims (the "un-columnable context"
 * layer surfaced in the player modal Pods tab, portfolio, and the GM briefing).
 * Re-uploading the same show + week replaces that set.
 */
export function TranscriptForm() {
    const [text, setText] = useState('');
    const [show, setShow] = useState('');
    const [week, setWeek] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) { setError('Paste the transcript.'); return; }
        if (!show.trim()) { setError('Enter the show name.'); return; }
        setLoading(true); setMessage(''); setError('');
        try {
            const res = await fetch('/api/admin/upload-transcript', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, show, week }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            const d = data.byDirection || {};
            setMessage(`Extracted ${data.claims} claims from “${data.show}” wk ${data.week} (bull ${d.bull || 0} · bear ${d.bear || 0} · neutral ${d.neutral || 0}). ${data.matched} matched, ${data.unmatched} unmatched.${data.unmatchedNames?.length ? `\nUnmatched: ${data.unmatchedNames.join(', ')}` : ''}`);
            setText('');
        } catch (err: any) {
            setError(err.message || 'Upload error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-xl ring-1 ring-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Podcast Transcript → Claims</h2>
            <p className="text-sm text-zinc-400 mb-4">
                Paste a fantasy-podcast transcript. We LLM-extract structured player claims (role / injury /
                coach-speak / vibe / contrarian, with a verbatim quote) into the pod-claims feed. Re-uploading the
                same show + week replaces that set.
            </p>
            <form onSubmit={submit} className="space-y-4">
                <div className="flex gap-4 flex-wrap">
                    <label className="flex items-center gap-2 bg-zinc-800/50 px-4 py-2 rounded-lg border border-zinc-700">
                        <span className="text-white text-sm">Show</span>
                        <input type="text" value={show} onChange={e => setShow(e.target.value)} placeholder="Late Round Podcast"
                            className="w-56 bg-zinc-900 text-white rounded px-2 py-1 border border-zinc-700" />
                    </label>
                    <label className="flex items-center gap-2 bg-zinc-800/50 px-4 py-2 rounded-lg border border-zinc-700">
                        <span className="text-white text-sm">Week</span>
                        <input type="number" min={1} max={25} value={week} onChange={e => setWeek(parseInt(e.target.value) || 1)}
                            className="w-16 bg-zinc-900 text-white rounded px-2 py-1 border border-zinc-700" />
                    </label>
                </div>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={12}
                    placeholder="Paste the full transcript here…"
                    className="w-full bg-zinc-950 text-zinc-200 text-sm rounded-lg border border-zinc-700 p-3 font-mono" />
                <button type="submit" disabled={loading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50">
                    {loading ? 'Extracting… (can take ~20-40s)' : 'Extract Claims'}
                </button>
            </form>
            {message && <pre className="mt-4 text-sm text-green-400 whitespace-pre-wrap">{message}</pre>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
    );
}
