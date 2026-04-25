'use client';

import { useMemo, useState } from 'react';

interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: any[];
    format: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPlayerClick: (player: any) => void;
    topN?: number;
    title?: string;
}

type ViewMode = 'dynasty' | 'zap';

const TIER_BUCKETS = [
    { label: 'T1-3', max: 3, bg: 'bg-emerald-500' },
    { label: 'T4-6', max: 6, bg: 'bg-sky-500' },
    { label: 'T7-9', max: 9, bg: 'bg-violet-500' },
    { label: 'T10-12', max: 12, bg: 'bg-yellow-400' },
    { label: 'T13-15', max: 15, bg: 'bg-orange-500' },
    { label: 'T16-18', max: 18, bg: 'bg-rose-500' },
    { label: 'T19+', max: Infinity, bg: 'bg-zinc-400 dark:bg-zinc-600' },
] as const;

const ZAP_BUCKETS: Record<string, { label: string; bg: string }> = {
    'Legendary Performer': { label: 'Legendary', bg: 'bg-purple-500' },
    'Elite Producer': { label: 'Elite', bg: 'bg-emerald-500' },
    'Weekly Starter': { label: 'Starter', bg: 'bg-sky-500' },
    'Flex Play': { label: 'Flex', bg: 'bg-yellow-400' },
    'Benchwarmer': { label: 'Bench', bg: 'bg-orange-500' },
    'Waiver Wire Add': { label: 'Waiver', bg: 'bg-rose-500' },
    'Dart Throw': { label: 'Dart', bg: 'bg-zinc-400 dark:bg-zinc-600' },
};
const ZAP_DEFAULT = { label: 'No ZAP', bg: 'bg-zinc-300 dark:bg-zinc-700' };
const ZAP_LEGEND = Object.values(ZAP_BUCKETS);

function getDynastyBucket(tier: number | null | undefined) {
    if (!tier) return TIER_BUCKETS[TIER_BUCKETS.length - 1];
    return TIER_BUCKETS.find(b => tier <= b.max) || TIER_BUCKETS[TIER_BUCKETS.length - 1];
}

function getZapBucket(category: string | null | undefined) {
    if (!category) return ZAP_DEFAULT;
    const normalized = category.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return ZAP_BUCKETS[normalized] || ZAP_DEFAULT;
}

const POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export function PositionScarcityChart({ players, format, onPlayerClick, topN = 15, title = 'Position Scarcity' }: Props) {
    const [tooltip, setTooltip] = useState<{ player: any; x: number; y: number } | null>(null);
    const [view, setView] = useState<ViewMode>('dynasty');

    const data = useMemo(() => {
        const sf = format === 'sf';
        const byPos = POSITIONS.map(pos => {
            const posPlayers = players
                .filter(p => p.position === pos && (p.fc_value || 0) > 0)
                .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))
                .slice(0, topN);
            const total = posPlayers.reduce((s, p) => s + (p.fc_value || 0), 0);
            const segments = posPlayers.map(p => {
                const dynastyTier = (sf ? p.rank_sf_tier : p.rank_1qb_tier) || null;
                return {
                    player: p,
                    value: p.fc_value || 0,
                    dynastyBucket: getDynastyBucket(dynastyTier),
                    dynastyTier,
                    zapBucket: getZapBucket(p.zap_category),
                    zapCategory: p.zap_category || null,
                };
            });
            return { pos, segments, total };
        });
        const maxTotal = Math.max(...byPos.map(d => d.total), 1);
        return { byPos, maxTotal };
    }, [players, format, topN]);

    const legend = view === 'dynasty' ? TIER_BUCKETS : ZAP_LEGEND;

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{title}</h3>
                <div className="flex rounded-md overflow-hidden border border-zinc-300 dark:border-zinc-600 ml-2">
                    <button
                        onClick={() => setView('dynasty')}
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${view === 'dynasty' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    >Dynasty</button>
                    <button
                        onClick={() => setView('zap')}
                        className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${view === 'zap' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                    >Rookie ZAP</button>
                </div>
                <div className="flex gap-2 ml-auto flex-wrap">
                    {legend.map(b => (
                        <span key={b.label} className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                            <span className={`w-2 h-2 rounded-sm ${b.bg}`} />
                            {b.label}
                        </span>
                    ))}
                </div>
            </div>
            <div className="space-y-1.5">
                {data.byPos.map(({ pos, segments, total }) => (
                    <div key={pos} className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 w-6 text-right">{pos}</span>
                        <div className="flex-1 flex h-7 rounded overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                            {segments.map((seg, i) => {
                                const widthPct = (seg.value / data.maxTotal) * 100;
                                if (widthPct < 0.3) return null;
                                const bg = view === 'dynasty' ? seg.dynastyBucket.bg : seg.zapBucket.bg;
                                return (
                                    <div
                                        key={seg.player.id}
                                        className={`${bg} ${i > 0 ? 'border-l border-white/30 dark:border-black/30' : ''} cursor-pointer hover:brightness-110 transition-all`}
                                        style={{ width: `${widthPct}%` }}
                                        onClick={() => onPlayerClick(seg.player)}
                                        onMouseEnter={e => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setTooltip({ player: { ...seg.player, _dynastyTier: seg.dynastyTier, _zapCategory: seg.zapCategory }, x: rect.left + rect.width / 2, y: rect.top });
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                    />
                                );
                            })}
                        </div>
                        <span className="text-[10px] text-zinc-400 w-12 text-right tabular-nums">{total.toLocaleString()}</span>
                    </div>
                ))}
            </div>
            {tooltip && (
                <div
                    className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-lg shadow-lg bg-zinc-900 text-white text-xs whitespace-nowrap"
                    style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
                >
                    <span className="font-semibold">{tooltip.player.full_name}</span>
                    <span className="text-zinc-400 ml-1.5">{tooltip.player.fc_value?.toLocaleString()}</span>
                    {view === 'dynasty' && tooltip.player._dynastyTier && (
                        <span className="text-zinc-400 ml-1.5">T{tooltip.player._dynastyTier}</span>
                    )}
                    {view === 'zap' && tooltip.player._zapCategory && (
                        <span className="text-zinc-400 ml-1.5">{tooltip.player._zapCategory}</span>
                    )}
                </div>
            )}
        </div>
    );
}
