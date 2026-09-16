'use client';

import { useState } from 'react';

interface PlayerSummaryLine {
    player: string;
    lean: 'bull' | 'bear' | 'neutral';
    mentions: number;
    maxConviction: number;
    signals: string[];
    topQuote: string;
}
interface EpisodeSummary {
    totalClaims: number;
    players: number;
    bull: number;
    bear: number;
    neutral: number;
    headline: string;
    topBull: PlayerSummaryLine[];
    topBear: PlayerSummaryLine[];
    injuryNotes: PlayerSummaryLine[];
    perPlayer: PlayerSummaryLine[];
}

/**
 * Admin form: paste a fantasy-podcast transcript for a show + week.
 * LLM-extracts player-claim atoms → pod_claims (the "un-columnable context"
 * layer surfaced in the player modal Pods tab, portfolio, and the GM briefing).
 * Re-uploading the same show + week replaces that set.
 */
export function TranscriptForm({ onUploaded }: { onUploaded?: () => void }) {
    const [text, setText] = useState('');
    const [show, setShow] = useState('');
    const [week, setWeek] = useState<number>(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [summary, setSummary] = useState<EpisodeSummary | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) { setError('Paste the transcript.'); return; }
        if (!show.trim()) { setError('Enter the show name.'); return; }
        setLoading(true); setMessage(''); setError(''); setSummary(null);
        try {
            const res = await fetch('/api/admin/upload-transcript', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, show, week }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            const d = data.byDirection || {};
            const lines = [
                `Extracted ${data.claims} claims from “${data.show}” wk ${data.week} (bull ${d.bull || 0} · bear ${d.bear || 0} · neutral ${d.neutral || 0}).`,
                `${data.matched} matched${data.fuzzyMatched ? ` (${data.fuzzyMatched} fuzzy)` : ''}, ${data.unmatched} unmatched.`,
            ];
            if (data.fuzzyMatches?.length) lines.push(`Fuzzy matched (verify): ${data.fuzzyMatches.join(', ')}`);
            if (data.unmatchedNames?.length) lines.push(`Still unmatched: ${data.unmatchedNames.join(', ')}`);
            setMessage(lines.join('\n'));
            setSummary(data.summary || null);
            setText('');
            onUploaded?.();
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
            {summary && <EpisodeSummaryView summary={summary} />}
        </div>
    );
}

const LEAN_STYLE: Record<string, { cls: string; label: string }> = {
    bull: { cls: 'text-green-400', label: 'bull' },
    bear: { cls: 'text-red-400', label: 'bear' },
    neutral: { cls: 'text-zinc-400', label: 'neutral' },
};

function PlayerLine({ line }: { line: PlayerSummaryLine }) {
    const s = LEAN_STYLE[line.lean] || LEAN_STYLE.neutral;
    return (
        <div className="py-1.5 border-b border-zinc-800 last:border-0">
            <div className="flex items-center gap-2 text-sm">
                <span className="text-white font-medium">{line.player}</span>
                <span className={`text-xs font-semibold ${s.cls}`}>{s.label}</span>
                <span className="text-zinc-500 text-xs">
                    {line.signals.join(', ')}
                    {line.mentions > 1 ? ` · ${line.mentions} mentions` : ''} · conv {line.maxConviction}/5
                </span>
            </div>
            <p className="text-xs text-zinc-400 italic mt-0.5">“{line.topQuote}”</p>
        </div>
    );
}

function EpisodeSummaryView({ summary }: { summary: EpisodeSummary }) {
    return (
        <div className="mt-4 space-y-4">
            <div className="text-sm text-zinc-200 font-medium">{summary.headline}</div>

            {summary.topBull.length > 0 && (
                <section>
                    <h3 className="text-[11px] uppercase tracking-wide text-green-400 font-semibold mb-1">Loudest bullish</h3>
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 px-3">
                        {summary.topBull.map((l, i) => <PlayerLine key={i} line={l} />)}
                    </div>
                </section>
            )}

            {summary.topBear.length > 0 && (
                <section>
                    <h3 className="text-[11px] uppercase tracking-wide text-red-400 font-semibold mb-1">Loudest bearish</h3>
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 px-3">
                        {summary.topBear.map((l, i) => <PlayerLine key={i} line={l} />)}
                    </div>
                </section>
            )}

            {summary.injuryNotes.length > 0 && (
                <section>
                    <h3 className="text-[11px] uppercase tracking-wide text-amber-400 font-semibold mb-1">Injury / news</h3>
                    <div className="bg-zinc-950 rounded-lg border border-zinc-800 px-3">
                        {summary.injuryNotes.map((l, i) => <PlayerLine key={i} line={l} />)}
                    </div>
                </section>
            )}

            <details>
                <summary className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold cursor-pointer hover:text-zinc-300">
                    All {summary.players} players discussed
                </summary>
                <div className="bg-zinc-950 rounded-lg border border-zinc-800 px-3 mt-1">
                    {summary.perPlayer.map((l, i) => <PlayerLine key={i} line={l} />)}
                </div>
            </details>
        </div>
    );
}
