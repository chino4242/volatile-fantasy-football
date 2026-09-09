'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRightLeft, PlusCircle, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import type { ActionCenter as ActionCenterModel, ActionTypeGroup, ActionItem, ActionKind } from '@/lib/action-center';

/**
 * In-season Action Center — renders the aggregation engine's `byType` groups as
 * breathing sub-cards (amber lineups / indigo trades / green waivers), each item
 * deep-linking out. Quiet state when nothing is actionable. Mobile collapses
 * groups to tappable count rows.
 *
 * Off-season (byTeam) rendering is added in Story 2.5.
 */

const GROUP_STYLE: Record<ActionKind, { icon: React.ReactNode; head: string; ring: string }> = {
    lineup: {
        icon: <AlertTriangle className="h-4 w-4" />,
        head: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        ring: 'ring-amber-900/5',
    },
    trade: {
        icon: <ArrowRightLeft className="h-4 w-4" />,
        head: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
        ring: 'ring-indigo-900/5',
    },
    waiver: {
        icon: <PlusCircle className="h-4 w-4" />,
        head: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        ring: 'ring-green-900/5',
    },
    sell: {
        icon: <ArrowRightLeft className="h-4 w-4" />,
        head: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        ring: 'ring-red-900/5',
    },
};

const PLATFORM_LABEL: Record<string, string> = { sleeper: 'Sleeper', fleaflicker: 'Fleaflicker', yahoo: 'Yahoo', myffpc: 'MyFFPC' };

function summaryLine(counts: ActionCenterModel['counts']): string {
    const parts: string[] = [];
    if (counts.lineup) parts.push(`${counts.lineup} lineup fix${counts.lineup !== 1 ? 'es' : ''}`);
    if (counts.trade) parts.push(`${counts.trade} trade${counts.trade !== 1 ? 's' : ''}`);
    if (counts.waiver) parts.push(`${counts.waiver} waiver add${counts.waiver !== 1 ? 's' : ''}`);
    return parts.join(' · ');
}

export function ActionCenter({ model }: { model: ActionCenterModel | null }) {
    if (!model) return null;

    // Quiet state — nothing needs attention.
    if (model.isEmpty) {
        return (
            <div className="mb-8 rounded-xl bg-green-50 dark:bg-green-900/20 ring-1 ring-green-900/5 px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">You&apos;re all caught up</span>
                <span className="text-sm text-green-700/70 dark:text-green-300/70">— nothing needs attention right now.</span>
            </div>
        );
    }

    // In-season → byType. (Off-season byTeam lands in Story 2.5.)
    if (!model.byType || model.byType.length === 0) return null;

    return (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">⚡ Needs attention this week</span>
                <span className="text-xs text-zinc-500">{summaryLine(model.counts)}</span>
            </div>
            <div className="space-y-3.5">
                {model.byType.map(group => <ActionGroupCard key={group.kind} group={group} />)}
            </div>
        </div>
    );
}

function ActionGroupCard({ group }: { group: ActionTypeGroup }) {
    // Mobile: collapsed to a count row that expands. Desktop: always expanded.
    const [openMobile, setOpenMobile] = useState(false);
    const style = GROUP_STYLE[group.kind];
    const isFleaflickerScoped = group.items.some(i => i.scope === 'fleaflicker');

    return (
        <div className={`rounded-xl bg-white dark:bg-zinc-900 shadow-sm ring-1 ${style.ring} dark:ring-white/5 overflow-hidden`}>
            {/* Header — tap toggles on mobile only */}
            <button
                onClick={() => setOpenMobile(v => !v)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ${style.head} sm:cursor-default`}
                aria-expanded={openMobile}
            >
                {style.icon}
                <span>{group.label}</span>
                {isFleaflickerScoped && (
                    <span className="text-[10px] font-bold tracking-wide bg-white dark:bg-zinc-950 text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-600/30 rounded px-1.5 py-0.5">Fleaflicker</span>
                )}
                <span className="ml-auto text-xs font-medium opacity-70">{group.items.length}</span>
                <span className="sm:hidden">{openMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
            </button>

            {/* Rows — hidden on mobile until expanded, always shown ≥sm */}
            <div className={`${openMobile ? 'block' : 'hidden'} sm:block`}>
                {group.items.map(item => <ActionRow key={item.id} item={item} />)}
            </div>
        </div>
    );
}

function ActionRow({ item }: { item: ActionItem }) {
    const platform = PLATFORM_LABEL[item.platform] || item.platform;
    const linkLabel = item.kind === 'trade' ? 'Evaluate' : `Open ${platform}`;
    return (
        <div className="flex items-center gap-3 px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 first:border-t-0">
            <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-900 dark:text-zinc-100">
                    <span className="font-medium">{item.headline}</span>
                    {item.detail && <span className="text-zinc-400"> · {item.detail}</span>}
                    {item.kind === 'waiver' && item.edge != null && (
                        <span className="ml-1.5 text-xs font-bold text-green-600 dark:text-green-400">+{item.edge} edge</span>
                    )}
                </div>
                <span className="inline-block mt-1 text-[11px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5">
                    {item.leagueName} · {platform}
                </span>
            </div>
            <Link
                href={item.deepLink}
                aria-label={`${linkLabel} — ${item.leagueName}`}
                className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 transition-colors"
            >
                {linkLabel} <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
        </div>
    );
}
