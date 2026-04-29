'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: any[];
    format: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onPlayerClick: (player: any) => void;
    topN?: number;
    title?: string;
    emptyMessage?: string;
    defaultCollapsed?: boolean;
}

type ViewMode = 'dynasty' | 'zap' | 'redraft';

const TIER_BUCKETS = [
    { label: 'T1-3', max: 3, bg: 'bg-emerald-500', hex: '#10b981' },
    { label: 'T4-6', max: 6, bg: 'bg-sky-500', hex: '#0ea5e9' },
    { label: 'T7-9', max: 9, bg: 'bg-violet-500', hex: '#8b5cf6' },
    { label: 'T10-12', max: 12, bg: 'bg-yellow-400', hex: '#facc15' },
    { label: 'T13-15', max: 15, bg: 'bg-orange-500', hex: '#f97316' },
    { label: 'T16-18', max: 18, bg: 'bg-rose-500', hex: '#f43f5e' },
    { label: 'T19+', max: Infinity, bg: 'bg-zinc-400 dark:bg-zinc-600', hex: '#a1a1aa' },
] as const;

const ZAP_BUCKETS: Record<string, { label: string; bg: string; hex: string }> = {
    'Legendary Performer': { label: 'Legendary', bg: 'bg-purple-500', hex: '#a855f7' },
    'Elite Producer': { label: 'Elite', bg: 'bg-emerald-500', hex: '#10b981' },
    'Weekly Starter': { label: 'Starter', bg: 'bg-sky-500', hex: '#0ea5e9' },
    'Flex Play': { label: 'Flex', bg: 'bg-yellow-400', hex: '#facc15' },
    'Benchwarmer': { label: 'Bench', bg: 'bg-orange-500', hex: '#f97316' },
    'Waiver Wire Add': { label: 'Waiver', bg: 'bg-rose-500', hex: '#f43f5e' },
    'Dart Throw': { label: 'Dart', bg: 'bg-zinc-400 dark:bg-zinc-600', hex: '#a1a1aa' },
};
const ZAP_DEFAULT = { label: 'No ZAP', bg: 'bg-zinc-300 dark:bg-zinc-700', hex: '#d4d4d8' };
const ZAP_LEGEND = Object.values(ZAP_BUCKETS);

const REDRAFT_BUCKETS = [
    { label: 'T1-3', max: 3, bg: 'bg-emerald-400', hex: '#34d399' },
    { label: 'T4-6', max: 6, bg: 'bg-cyan-500', hex: '#06b6d4' },
    { label: 'T7-9', max: 9, bg: 'bg-amber-400', hex: '#fbbf24' },
    { label: 'T10-12', max: 12, bg: 'bg-orange-500', hex: '#f97316' },
    { label: 'T13-15', max: 15, bg: 'bg-rose-500', hex: '#f43f5e' },
    { label: 'T16-18', max: 18, bg: 'bg-purple-500', hex: '#a855f7' },
    { label: 'T19+', max: Infinity, bg: 'bg-zinc-400 dark:bg-zinc-600', hex: '#a1a1aa' },
] as const;

function getRedraftBucket(tier: number | null | undefined) {
    if (!tier) return REDRAFT_BUCKETS[REDRAFT_BUCKETS.length - 1];
    return REDRAFT_BUCKETS.find(b => tier <= b.max) || REDRAFT_BUCKETS[REDRAFT_BUCKETS.length - 1];
}

const POS_COLORS: Record<string, string> = {
    QB: 'bg-green-400', RB: 'bg-rose-400', WR: 'bg-cyan-400', TE: 'bg-amber-400',
};

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
const QUALITY_MAX_TIER = 9;

export function PositionScarcityChart({
    players, format, onPlayerClick, topN = 15,
    title = 'Position Scarcity', emptyMessage, defaultCollapsed = false,
}: Props) {
    const [tooltip, setTooltip] = useState<{ player: any; x: number; y: number } | null>(null);
    const [view, setView] = useState<ViewMode>('dynasty');
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Dismiss tooltip on outside tap (mobile)
    useEffect(() => {
        if (!tooltip) return;
        const dismiss = () => setTooltip(null);
        document.addEventListener('scroll', dismiss, { passive: true });
        return () => document.removeEventListener('scroll', dismiss);
    }, [tooltip]);

    const handleSegmentInteraction = useCallback((e: React.MouseEvent | React.TouchEvent, player: any, dynastyTier: number | null, zapCategory: string | null, redraftTier: number | null = null) => {
        e.stopPropagation();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top;
        setTooltip({ player: { ...player, _dynastyTier: dynastyTier, _zapCategory: zapCategory, _redraftTier: redraftTier }, x, y });
        clearTimeout(tooltipTimeout.current);
        tooltipTimeout.current = setTimeout(() => setTooltip(null), 3000);
    }, []);

    const data = useMemo(() => {
        const sf = format === 'sf';
        const byPos = POSITIONS.map(pos => {
            const posPlayers = players
                .filter(p => p.position === pos && (p.fc_value || 0) > 0)
                .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))
                .slice(0, topN);
            const total = posPlayers.reduce((s, p) => s + (p.fc_value || 0), 0);
            const qualityCount = posPlayers.filter(p => {
                const tier = sf ? p.rank_sf_tier : p.rank_1qb_tier;
                return tier && tier <= QUALITY_MAX_TIER;
            }).length;
            const segments = posPlayers.map(p => {
                const dynastyTier = (sf ? p.rank_sf_tier : p.rank_1qb_tier) || null;
                return {
                    player: p,
                    value: p.fc_value || 0,
                    dynastyBucket: getDynastyBucket(dynastyTier),
                    dynastyTier,
                    zapBucket: getZapBucket(p.zap_category),
                    zapCategory: p.zap_category || null,
                    redraftBucket: getRedraftBucket(p.redraft_rank_tier),
                    redraftTier: p.redraft_rank_tier || null,
                };
            });
            return { pos, segments, total, qualityCount, count: posPlayers.length };
        });
        const maxTotal = Math.max(...byPos.map(d => d.total), 1);
        return { byPos, maxTotal };
    }, [players, format, topN]);

    const legend = view === 'dynasty' ? TIER_BUCKETS : view === 'redraft' ? REDRAFT_BUCKETS : ZAP_LEGEND;
    const hasPlayers = data.byPos.some(d => d.segments.length > 0);

    return (
        <div className="mb-4" onClick={() => setTooltip(null)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
                <button
                    onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                    className="flex items-center gap-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                >
                    {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    {title}
                </button>
                {!collapsed && (
                    <>
                        <div className="flex rounded-md overflow-hidden border border-zinc-300 dark:border-zinc-600 ml-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); setView('dynasty'); }}
                                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${view === 'dynasty' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >Dynasty</button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setView('zap'); }}
                                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${view === 'zap' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >Rookie ZAP</button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setView('redraft'); }}
                                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${view === 'redraft' ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                            >Redraft</button>
                        </div>
                        {/* Legend — hidden on mobile, shown on sm+ */}
                        <div className="hidden sm:flex gap-2 ml-auto flex-wrap">
                            {legend.map(b => (
                                <span key={b.label} className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                                    <span className={`w-2 h-2 rounded-sm ${b.bg}`} />
                                    {b.label}
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Collapsible body */}
            <div className={`transition-all duration-300 overflow-hidden ${collapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                {!hasPlayers && emptyMessage ? (
                    <div className="flex items-center justify-center h-20 text-xs text-zinc-400 dark:text-zinc-500 italic">
                        {emptyMessage}
                    </div>
                ) : (
                    <>
                        {/* Bars */}
                        <div className="space-y-1.5">
                            {data.byPos.map(({ pos, segments, total, qualityCount, count }) => (
                                <div key={pos} className="flex items-center gap-2">
                                    {/* Position label with color dot */}
                                    <div className="flex items-center gap-1 w-10 justify-end">
                                        <span className={`w-2 h-2 rounded-full ${POS_COLORS[pos] || 'bg-zinc-400'}`} />
                                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{pos}</span>
                                    </div>
                                    {/* Bar */}
                                    <div className="flex-1 flex h-7 sm:h-7 rounded overflow-hidden bg-zinc-100 dark:bg-zinc-800 gap-px">
                                        {segments.map((seg) => {
                                            const widthPct = (seg.value / data.maxTotal) * 100;
                                            if (widthPct < 0.3) return null;
                                            const bg = view === 'dynasty' ? seg.dynastyBucket.bg : view === 'redraft' ? seg.redraftBucket.bg : seg.zapBucket.bg;
                                            return (
                                                <div
                                                    key={seg.player.id}
                                                    className={`${bg} cursor-pointer hover:brightness-110 active:brightness-90 transition-all duration-500 ease-out rounded-sm`}
                                                    style={{ width: `${widthPct}%` }}
                                                    onClick={(e) => { e.stopPropagation(); onPlayerClick(seg.player); }}
                                                    onMouseEnter={e => handleSegmentInteraction(e, seg.player, seg.dynastyTier, seg.zapCategory, seg.redraftTier)}
                                                    onMouseLeave={() => { clearTimeout(tooltipTimeout.current); setTooltip(null); }}
                                                    onTouchStart={e => handleSegmentInteraction(e, seg.player, seg.dynastyTier, seg.zapCategory, seg.redraftTier)}
                                                />
                                            );
                                        })}
                                    </div>
                                    {/* Count badge + total */}
                                    <div className="flex items-center gap-1 w-16 sm:w-20 justify-end">
                                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1">{qualityCount}/{count}</span>
                                        <span className="hidden sm:inline text-[10px] text-zinc-400 tabular-nums">{total.toLocaleString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Mobile legend — below bars */}
                        <div className="flex sm:hidden gap-2 mt-2 overflow-x-auto pb-1">
                            {legend.map(b => (
                                <span key={b.label} className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap flex-shrink-0">
                                    <span className={`w-2 h-2 rounded-sm ${b.bg}`} />
                                    {b.label}
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Tooltip */}
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
                    {view === 'redraft' && tooltip.player._redraftTier && (
                        <span className="text-amber-400 ml-1.5">RD T{tooltip.player._redraftTier}</span>
                    )}
                </div>
            )}
        </div>
    );
}
