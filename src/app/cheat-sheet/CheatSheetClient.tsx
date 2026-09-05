'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Check } from 'lucide-react';

interface CheatSheetPlayer {
    id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    rank_sf_tier: number | null;
    rank_1qb_tier: number | null;
    redraft_rank_tier: number | null;
    redraft_rank_overall: number | null;
    redraft_auction_value: number | null;
}

interface CheatSheetClientProps {
    players: CheatSheetPlayer[];
    format: '1qb' | 'sf';
    redraftVintage?: string | null;
    dynastyVintage?: string | null;
}

type TierMode = 'redraft' | 'dynasty' | 'value';
type PosFilter = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';

export default function CheatSheetClient({ players, format, redraftVintage, dynastyVintage }: CheatSheetClientProps) {
    const router = useRouter();

    // Redraft-first defaults per the spec.
    const [tierMode, setTierMode] = useState<TierMode>('redraft');
    const [posFilter, setPosFilter] = useState<PosFilter>('ALL');
    const [checked, setChecked] = useState<Set<string>>(new Set());

    const sf = format === 'sf';

    const toggleChecked = (id: string) =>
        setChecked(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const setFormat = (f: '1qb' | 'sf') => {
        router.push(`/cheat-sheet?format=${f}`);
    };

    // --- Tier / color helpers (standalone copy — matches the app's tier scheme) ---
    const tierStyle = (tier: number | null | undefined): { bg: string; border: string; label: string } => {
        const kind = tierMode === 'dynasty' ? 'Dynasty' : 'Redraft';
        switch (tier) {
            case 1: return { bg: 'bg-purple-50', border: 'border-purple-500', label: `${kind} Tier 1` };
            case 2: return { bg: 'bg-blue-50', border: 'border-blue-500', label: `${kind} Tier 2` };
            case 3: return { bg: 'bg-green-50', border: 'border-green-500', label: `${kind} Tier 3` };
            case 4: return { bg: 'bg-yellow-50', border: 'border-yellow-500', label: `${kind} Tier 4` };
            case 5: return { bg: 'bg-pink-50', border: 'border-pink-500', label: `${kind} Tier 5` };
            case 6: return { bg: 'bg-cyan-50', border: 'border-cyan-500', label: `${kind} Tier 6` };
            default: return { bg: 'bg-zinc-50', border: 'border-zinc-400', label: tier ? `${kind} Tier ${tier}` : 'Unranked' };
        }
    };
    const posColor = (pos: string | null | undefined) =>
        pos === 'QB' ? 'text-green-600' : pos === 'RB' ? 'text-blue-600' : pos === 'WR' ? 'text-red-600' : pos === 'TE' ? 'text-orange-600' : 'text-zinc-500';
    const posBadge = (pos: string | null | undefined) =>
        pos === 'QB' ? 'bg-green-600' : pos === 'RB' ? 'bg-blue-600' : pos === 'WR' ? 'bg-red-600' : pos === 'TE' ? 'bg-orange-500' : 'bg-zinc-500';

    // --- Build grouped list ---
    const groups = useMemo(() => {
        const pool = posFilter === 'ALL' ? players : players.filter(p => p.position === posFilter);

        if (tierMode === 'value') {
            // Dynasty-value bands broken by value cliffs / floors / max size.
            const sorted = [...pool].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            const CLIFF_PCT = 0.10;
            const MAX_BAND_SIZE = 12;
            const VALUE_FLOORS = [6000, 5000, 4000, 3000, 2500, 2000, 1500, 1200, 1000, 800, 600, 400, 300, 200, 100];
            const floorCrossed = (prev: number, cur: number) => VALUE_FLOORS.some(f => prev >= f && cur < f);

            let bandIdx = 0;
            let prevValue: number | null = null;
            let curBand: { tier: number; players: CheatSheetPlayer[] } | null = null;
            const out: { tier: number | null; players: CheatSheetPlayer[]; label?: string }[] = [];
            for (const p of sorted) {
                const v = p.fc_value || 0;
                const cliff = prevValue != null && prevValue > 0 && (prevValue - v) / prevValue >= CLIFF_PCT;
                const crossed = prevValue != null && floorCrossed(prevValue, v);
                const tooBig = curBand != null && curBand.players.length >= MAX_BAND_SIZE;
                if (!curBand || cliff || crossed || tooBig) {
                    bandIdx++;
                    curBand = { tier: bandIdx, players: [p] };
                    out.push(curBand);
                } else {
                    curBand.players.push(p);
                }
                prevValue = v;
            }
            return out.map(g => {
                const hi = g.players[0]?.fc_value || 0;
                const lo = g.players[g.players.length - 1]?.fc_value || 0;
                const sortedPlayers = [...g.players].sort((a, b) =>
                    (b.redraft_auction_value || 0) - (a.redraft_auction_value || 0) || (b.fc_value || 0) - (a.fc_value || 0)
                );
                return { ...g, players: sortedPlayers, label: `Value ${Math.round(hi).toLocaleString()}\u2013${Math.round(lo).toLocaleString()}` };
            });
        }

        // Redraft / Dynasty tier grouping, sorted by auction within tier.
        const tierOf = (p: CheatSheetPlayer) =>
            tierMode === 'dynasty' ? ((sf ? p.rank_sf_tier : p.rank_1qb_tier) ?? null) : (p.redraft_rank_tier ?? null);
        const tiersPresent = Array.from(new Set(pool.map(tierOf))).sort((a, b) => {
            if (a == null) return 1;
            if (b == null) return -1;
            return a - b;
        });
        return tiersPresent.map(tier => ({
            tier,
            players: pool
                .filter(p => tierOf(p) === tier)
                .sort((a, b) => (b.redraft_auction_value || 0) - (a.redraft_auction_value || 0) || (b.fc_value || 0) - (a.fc_value || 0)),
        }));
    }, [players, posFilter, tierMode, sf]);

    const totalPlayers = groups.reduce((s, g) => s + g.players.length, 0);
    const vintage = tierMode === 'dynasty' ? dynastyVintage : redraftVintage;

    return (
        <div className="min-h-screen bg-white cheat-sheet-root">
            {/* Toolbar — hidden when printing */}
            <div className="sticky top-0 bg-white border-b border-zinc-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 print:hidden z-10">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900">Draft Cheat Sheet</h2>
                    <p className="text-xs text-zinc-500">
                        {tierMode === 'value'
                            ? 'Sorted by dynasty value · color bands from value cliffs'
                            : `Grouped by ${tierMode} tier · sorted by auction value`}
                        {vintage ? ` · ${vintage}` : ''}
                        {' '}· {totalPlayers} players · check off players as they&apos;re drafted
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Format toggle */}
                    <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
                        {(['1qb', 'sf'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFormat(f)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${format === f ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                                {f === '1qb' ? '1QB' : 'Superflex'}
                            </button>
                        ))}
                    </div>
                    {/* Tier mode toggle */}
                    <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
                        {([
                            { key: 'redraft', label: 'Redraft Tiers' },
                            { key: 'dynasty', label: 'Dynasty Tiers' },
                            { key: 'value', label: 'Dynasty Value' },
                        ] as const).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setTierMode(key)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tierMode === key ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {/* Position filter */}
                    <div className="flex items-center bg-zinc-100 rounded-lg p-0.5">
                        {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map(pos => (
                            <button
                                key={pos}
                                onClick={() => setPosFilter(pos)}
                                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${posFilter === pos ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
                            >
                                {pos}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"
                    >
                        <Printer className="h-4 w-4" />
                        Print
                    </button>
                </div>
            </div>

            {/* Sheet content */}
            <div className="p-4 print:p-2 max-w-3xl mx-auto">
                <div className="hidden print:block mb-2">
                    <h1 className="text-base font-bold text-black">Draft Cheat Sheet — {format === 'sf' ? 'Superflex' : '1QB'} · {tierMode === 'dynasty' ? 'Dynasty Tiers' : tierMode === 'value' ? 'Dynasty Value' : 'Redraft Tiers'}</h1>
                </div>

                {totalPlayers === 0 ? (
                    <div className="text-center py-16 text-zinc-400 text-sm">No ranked players available for this view.</div>
                ) : (
                    <div className="space-y-3">
                        {groups.map((g, gi) => {
                            const style = tierStyle(g.tier);
                            const label = (g as any).label || style.label;
                            return (
                                <div key={gi} className={`rounded-lg border-l-4 ${style.border} ${style.bg} print:break-inside-avoid`}>
                                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600 border-b border-zinc-200/60">
                                        {label} <span className="font-normal text-zinc-400">({g.players.length})</span>
                                    </div>
                                    <div className="divide-y divide-zinc-200/50">
                                        {g.players.map(p => {
                                            const isChecked = checked.has(p.id);
                                            return (
                                                <button
                                                    key={p.id}
                                                    onClick={() => toggleChecked(p.id)}
                                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/50 transition-colors ${isChecked ? 'opacity-40' : ''}`}
                                                >
                                                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-zinc-700 border-zinc-700' : 'border-zinc-300 bg-white'}`}>
                                                        {isChecked && <Check className="w-3 h-3 text-white" />}
                                                    </span>
                                                    <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded flex-shrink-0 ${posBadge(p.position)}`}>{p.position}</span>
                                                    <span className={`text-sm font-medium text-zinc-900 flex-1 truncate ${isChecked ? 'line-through' : ''}`}>{p.full_name}</span>
                                                    <span className="text-[10px] text-zinc-400 flex-shrink-0">{p.team || 'FA'}</span>
                                                    <span className="text-xs font-mono text-amber-600 w-10 text-right flex-shrink-0">
                                                        {p.redraft_auction_value ? `$${p.redraft_auction_value}` : '—'}
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-500 w-14 text-right flex-shrink-0">
                                                        {(p.fc_value || 0).toLocaleString()}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
