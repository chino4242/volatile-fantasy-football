'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Search, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

interface TagRow {
    sleeper_id: string;
    tag: 'buy' | 'sell';
    note: string | null;
    full_name: string;
    position: string | null;
    team: string | null;
}

interface SearchResult {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
}

/**
 * Buy/Sell board (feature A). Chino's manual portfolio-wide directives.
 * Search a player → tag buy/sell; tags persist server-side and boost the
 * undervalued-FA sweep across every league. Fires onChange so the page can
 * refetch leagues (so newly-tagged buys appear in the FA lists).
 */
export function TagManager({ onChange }: { onChange?: () => void }) {
    const [open, setOpen] = useState(false);
    const [tags, setTags] = useState<TagRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    const loadTags = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch('/api/portfolio/tags');
            if (r.ok) setTags((await r.json()).tags || []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (open) loadTags(); }, [open, loadTags]);

    // Debounced player search.
    useEffect(() => {
        if (query.trim().length < 2) { setResults([]); return; }
        let cancelled = false;
        setSearching(true);
        const t = setTimeout(async () => {
            try {
                const r = await fetch(`/api/portfolio/tags?search=${encodeURIComponent(query.trim())}`);
                if (r.ok && !cancelled) setResults((await r.json()).players || []);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [query]);

    const setTag = async (sleeper_id: string, tag: 'buy' | 'sell') => {
        await fetch('/api/portfolio/tags', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sleeper_id, tag }),
        });
        setQuery(''); setResults([]);
        await loadTags();
        onChange?.();
    };

    const removeTag = async (sleeper_id: string) => {
        await fetch(`/api/portfolio/tags?sleeper_id=${encodeURIComponent(sleeper_id)}`, { method: 'DELETE' });
        await loadTags();
        onChange?.();
    };

    const buys = tags.filter(t => t.tag === 'buy');
    const sells = tags.filter(t => t.tag === 'sell');

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-900/5 shadow-sm mb-5">
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-left">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Buy / Sell board
                    <span className="text-xs font-normal text-zinc-400">({buys.length} buy · {sells.length} sell)</span>
                </span>
                <span className="text-xs text-zinc-400">your portfolio-wide directives</span>
            </button>

            {open && (
                <div className="px-5 pb-5 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search a player to tag…"
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-zinc-400" />}
                    </div>

                    {results.length > 0 && (
                        <ul className="mb-4 divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            {results.map(p => (
                                <li key={p.sleeper_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                                    <span className="truncate">{p.full_name} <span className="text-zinc-400">({p.position}{p.team ? ` · ${p.team}` : ''})</span></span>
                                    <span className="flex gap-1 flex-shrink-0">
                                        <button onClick={() => setTag(p.sleeper_id, 'buy')} className="text-[11px] font-semibold px-2 py-1 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:opacity-80">BUY</button>
                                        <button onClick={() => setTag(p.sleeper_id, 'sell')} className="text-[11px] font-semibold px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:opacity-80">SELL</button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {loading ? (
                        <div className="text-sm text-zinc-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading tags…</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <TagColumn title="Buy / Add" rows={buys} color="green" onRemove={removeTag} />
                            <TagColumn title="Sell / Drop" rows={sells} color="red" onRemove={removeTag} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function TagColumn({ title, rows, color, onRemove }: { title: string; rows: TagRow[]; color: 'green' | 'red'; onRemove: (id: string) => void }) {
    const dot = color === 'green' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    return (
        <div>
            <div className={`text-xs font-semibold mb-1.5 ${dot}`}>{title} ({rows.length})</div>
            {rows.length === 0 ? (
                <div className="text-sm text-zinc-400">None yet.</div>
            ) : (
                <ul className="space-y-0.5">
                    {rows.map(t => (
                        <li key={t.sleeper_id} className="text-sm flex items-center justify-between gap-2 group">
                            <Link href={`/portfolio/player/${t.sleeper_id}`} className="truncate text-zinc-800 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
                                {t.full_name} <span className="text-zinc-400">({t.position})</span>
                            </Link>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(t.sleeper_id); }} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Remove tag">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
