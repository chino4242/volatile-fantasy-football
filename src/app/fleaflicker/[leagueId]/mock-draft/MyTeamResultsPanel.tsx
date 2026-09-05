'use client';

import React, { useState } from 'react';
import { getPositionColor } from '@/lib/positionColors';

/**
 * My Team — results / validation panel for the on-the-clock live draft view.
 *
 * Per the UX spine (EXPERIENCE.md): this is a VALIDATION surface, not prescriptive.
 * It mirrors where the manager stands so they can judge the recommendation with
 * confidence. It never re-ranks or contradicts the rec. The only evaluative mark
 * is the ⚠ flag on an empty required starting position — stated as a neutral fact.
 *
 * Shows: a "starters filled" summary, then per-position groups
 * (count · Σ value · players with tier · ⚠ empty flag).
 */

export interface MyTeamPlayer {
    id: string;
    full_name: string;
    position: string | null;
    fc_value?: number | null;
    // tier: dynasty tier if available (rank_sf_tier / rank_1qb_tier)
    tier?: number | null;
}

interface MyTeamResultsPanelProps {
    players: MyTeamPlayer[];                       // kept + drafted, on-the-clock team
    startReqs: { QB: number; RB: number; WR: number; TE: number };
    /** Compact one-line mode for mobile (tap to expand). */
    compact?: boolean;
}

const POSITIONS: Array<'QB' | 'RB' | 'WR' | 'TE'> = ['QB', 'RB', 'WR', 'TE'];

export function MyTeamResultsPanel({ players, startReqs, compact = false }: MyTeamResultsPanelProps) {
    const [expanded, setExpanded] = useState(false);

    // Group players by position
    const byPos: Record<string, MyTeamPlayer[]> = { QB: [], RB: [], WR: [], TE: [] };
    for (const p of players) {
        const pos = p.position || '';
        if (pos in byPos) byPos[pos].push(p);
    }
    for (const pos of POSITIONS) {
        byPos[pos].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
    }

    const counts = { QB: byPos.QB.length, RB: byPos.RB.length, WR: byPos.WR.length, TE: byPos.TE.length };
    const values: Record<string, number> = {
        QB: byPos.QB.reduce((s, p) => s + (p.fc_value || 0), 0),
        RB: byPos.RB.reduce((s, p) => s + (p.fc_value || 0), 0),
        WR: byPos.WR.reduce((s, p) => s + (p.fc_value || 0), 0),
        TE: byPos.TE.reduce((s, p) => s + (p.fc_value || 0), 0),
    };

    // Starters filled: sum over positions of min(have, required) vs total required
    const totalReq = startReqs.QB + startReqs.RB + startReqs.WR + startReqs.TE;
    const filled = POSITIONS.reduce((s, pos) => s + Math.min(counts[pos], startReqs[pos]), 0);

    const isEmptyRequired = (pos: 'QB' | 'RB' | 'WR' | 'TE') => counts[pos] === 0 && startReqs[pos] > 0;

    // ---- Compact (mobile) strip ----
    if (compact) {
        return (
            <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 overflow-hidden">
                <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                    aria-expanded={expanded}
                >
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">My Team</div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 flex-wrap">
                            {POSITIONS.map(pos => (
                                <span key={pos}>
                                    {pos}{counts[pos]}
                                    {isEmptyRequired(pos) && <span className="text-amber-600 dark:text-amber-400"> ⚠</span>}
                                    {pos !== 'TE' && <span className="text-zinc-300 dark:text-zinc-600"> ·</span>}
                                </span>
                            ))}
                        </div>
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        {filled}/{totalReq} starters {expanded ? '▴' : '▾'}
                    </span>
                </button>
                {expanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-emerald-100 dark:border-emerald-900/50">
                        <PositionGroups byPos={byPos} counts={counts} values={values} startReqs={startReqs} />
                    </div>
                )}
            </div>
        );
    }

    // ---- Full (desktop) panel ----
    return (
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">My Team · results</div>
                <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{filled}/{totalReq} starters set</div>
            </div>
            <PositionGroups byPos={byPos} counts={counts} values={values} startReqs={startReqs} />
        </div>
    );
}

function PositionGroups({
    byPos, counts, values, startReqs,
}: {
    byPos: Record<string, MyTeamPlayer[]>;
    counts: Record<string, number>;
    values: Record<string, number>;
    startReqs: { QB: number; RB: number; WR: number; TE: number };
}) {
    return (
        <div className="divide-y divide-emerald-100 dark:divide-emerald-900/50">
            {POSITIONS.map(pos => {
                const empty = counts[pos] === 0 && startReqs[pos] > 0;
                const list = byPos[pos];
                return (
                    <div key={pos} className="py-1.5">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionColor(pos)}`}>{pos}</span>
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{counts[pos]}</span>
                            {empty && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">⚠ empty</span>}
                            <span className="ml-auto font-mono text-xs text-zinc-500 dark:text-zinc-400">{values[pos].toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 pl-0.5 truncate">
                            {list.length === 0
                                ? '—'
                                : list.map(p => `${p.full_name.split(' ').slice(-1)[0]}${p.tier ? ` (T${p.tier})` : ''}`).join(', ')}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
