'use client';

import { useState } from 'react';

/**
 * Admin form: paste the "N Transactions" analyst feed for a week.
 * Parses "Add/Buy/Sell <Player>" headers + rationale → player_transactions;
 * buy/sell also mirror into the global buy/sell board.
 */
export function TransactionsForm() {
    const [text, setText] = useState('');
    const [week, setWeek] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) { setError('Paste the transactions feed.'); return; }
        setLoading(true); setMessage(''); setError('');
        try {
            const res = await fetch('/api/admin/upload-transactions', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, week }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            const c = data.counts || {};
            setMessage(`Parsed ${data.parsed} (buy ${c.buy || 0} · sell ${c.sell || 0} · add ${c.add || 0}). Tagged ${data.taggedBuySell} buy/sell. ${data.unmatched} unmatched.${data.unmatchedNames?.length ? `\nUnmatched: ${data.unmatchedNames.join(', ')}` : ''}`);
            setText('');
        } catch (err: any) {
            setError(err.message || 'Upload error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-xl ring-1 ring-white/10 p-6">
            <h2 className="text-lg font-semibold text-white mb-1">Transactions Feed (Buy / Sell / Add)</h2>
            <p className="text-sm text-zinc-400 mb-4">
                Paste the weekly transactions writeup. Each item starts with “Add/Buy/Sell &lt;Player&gt;” followed by the rationale.
                Buy/Sell also update the portfolio buy/sell board.
            </p>
            <form onSubmit={submit} className="space-y-4">
                <label className="flex items-center gap-2 bg-zinc-800/50 px-4 py-2 rounded-lg border border-zinc-700 w-fit">
                    <span className="text-white text-sm">Week</span>
                    <input type="number" min={1} max={25} value={week} onChange={e => setWeek(parseInt(e.target.value) || 1)}
                        className="w-16 bg-zinc-900 text-white rounded px-2 py-1 border border-zinc-700" />
                </label>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
                    placeholder="Add Malik Willis&#10;You'll usually find lower-rostered quarterbacks…&#10;&#10;Buy Luther Burden&#10;Is there risk with Luther Burden this season?…"
                    className="w-full bg-zinc-950 text-zinc-200 text-sm rounded-lg border border-zinc-700 p-3 font-mono" />
                <button type="submit" disabled={loading}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50">
                    {loading ? 'Parsing…' : 'Ingest Transactions'}
                </button>
            </form>
            {message && <pre className="mt-4 text-sm text-green-400 whitespace-pre-wrap">{message}</pre>}
            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
    );
}
