'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Admin review surface for podcast claims that need a human eyeball:
 *   - fuzzy matches  → a guessed player link (verify it's right, or fix it)
 *   - unmatched      → no link at all (find the player, or leave it)
 *
 * Each row shows what the podcast SAID vs. what we LINKED to, plus the verbatim
 * quote (the trust receipt) so you can tell whether the guess makes sense.
 * Confirm keeps the link, Fix relinks to a searched player, Unmatch drops it.
 */

interface ReviewClaim {
    id: string;
    player_name: string;
    matched_name: string | null;
    sleeper_id: string | null;
    match_method: 'fuzzy' | 'none' | string;
    show: string;
    week: number;
    signal_type: string;
    direction: string;
    conviction: number;
    quote: string;
}

interface PlayerHit {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
}

const DIR_COLOR: Record<string, string> = {
    bull: 'text-green-400',
    bear: 'text-red-400',
    neutral: 'text-zinc-400',
};

export function PodClaimReview({ refreshKey }: { refreshKey?: number }) {
    const [claims, setClaims] = useState<ReviewClaim[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/admin/pod-claims?review=1');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load');
            setClaims(data.claims || []);
        } catch (err: any) {
            setError(err.message || 'Load error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load, refreshKey]);

    const act = async (id: string, action: string, sleeper_id?: string) => {
        setBusyId(id);
        try {
            const res = await fetch('/api/admin/pod-claims', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action, sleeper_id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');
            // Resolved rows leave the review list.
            setClaims(prev => prev.filter(c => c.id !== id));
        } catch (err: any) {
            setError(err.message || 'Update error');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="bg-zinc-900 rounded-xl ring-1 ring-white/10 p-6">
            <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-semibold text-white">Review Pod Claims</h2>
                <button onClick={load} className="text-xs text-zinc-400 hover:text-white">↻ Refresh</button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
                Fuzzy-matched names (a guessed link) and unmatched names (no link). Verify against the quote,
                then Confirm, Fix (relink to the right player), or leave unmatched.
            </p>

            {loading && <p className="text-sm text-zinc-500">Loading…</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!loading && claims.length === 0 && (
                <p className="text-sm text-green-400">Nothing to review — all claims are exact or confirmed. ✓</p>
            )}

            <div className="space-y-3">
                {claims.map(c => (
                    <ReviewRow key={c.id} claim={c} busy={busyId === c.id} onAct={act} />
                ))}
            </div>
        </div>
    );
}

function ReviewRow({ claim, busy, onAct }: {
    claim: ReviewClaim;
    busy: boolean;
    onAct: (id: string, action: string, sleeper_id?: string) => void;
}) {
    const [fixing, setFixing] = useState(false);
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<PlayerHit[]>([]);
    const [searching, setSearching] = useState(false);
    const isFuzzy = claim.match_method === 'fuzzy';

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/admin/pod-claims?player=${encodeURIComponent(query)}`);
            const data = await res.json();
            setHits(data.players || []);
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-sm text-white">
                        <span className="font-medium">“{claim.player_name}”</span>
                        <span className="text-zinc-500"> (podcast said)</span>
                        {isFuzzy && claim.matched_name ? (
                            <>
                                <span className="text-zinc-500"> → </span>
                                <span className="font-medium text-amber-300">{claim.matched_name}</span>
                                <span className="text-amber-500/70 text-xs"> (fuzzy guess)</span>
                            </>
                        ) : (
                            <span className="text-red-400/80 text-xs"> · unmatched</span>
                        )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                        {claim.show} · wk {claim.week} · {claim.signal_type} ·{' '}
                        <span className={DIR_COLOR[claim.direction] || 'text-zinc-400'}>{claim.direction}</span>{' '}
                        · conviction {claim.conviction}/5
                    </div>
                    <blockquote className="text-sm text-zinc-300 italic mt-2 border-l-2 border-zinc-700 pl-3">
                        “{claim.quote}”
                    </blockquote>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                    {isFuzzy && (
                        <button disabled={busy} onClick={() => onAct(claim.id, 'confirm')}
                            className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-500 disabled:opacity-50">
                            Confirm
                        </button>
                    )}
                    <button disabled={busy} onClick={() => setFixing(f => !f)}
                        className="px-3 py-1 rounded bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50">
                        {fixing ? 'Cancel' : 'Fix'}
                    </button>
                    {isFuzzy && (
                        <button disabled={busy} onClick={() => onAct(claim.id, 'unmatch')}
                            className="px-3 py-1 rounded bg-zinc-700 text-white text-xs font-medium hover:bg-zinc-600 disabled:opacity-50">
                            Unmatch
                        </button>
                    )}
                </div>
            </div>

            {fixing && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                    <div className="flex gap-2">
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
                            placeholder="Search player name…"
                            className="flex-1 bg-zinc-900 text-white text-sm rounded px-2 py-1 border border-zinc-700"
                        />
                        <button onClick={search} disabled={searching}
                            className="px-3 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-50">
                            {searching ? '…' : 'Search'}
                        </button>
                    </div>
                    {hits.length > 0 && (
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {hits.map(h => (
                                <button key={h.sleeper_id} disabled={busy}
                                    onClick={() => onAct(claim.id, 'fix', h.sleeper_id)}
                                    className="w-full text-left px-2 py-1 rounded text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
                                    {h.full_name}
                                    <span className="text-zinc-500 text-xs"> · {h.position || '?'} {h.team || ''}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {!searching && query && hits.length === 0 && (
                        <p className="text-xs text-zinc-500 mt-2">No matches — try a different spelling.</p>
                    )}
                </div>
            )}
        </div>
    );
}
