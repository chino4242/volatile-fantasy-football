/**
 * Waiver upgrades card (team page) — "better options on the waiver wire this
 * week." Shows free agents whose weekly rank beats one of your players, with the
 * 3-tier drop guardrail (safe / caution / block→informational). Complements the
 * Lineup Optimizer, which only reshuffles players already on your roster.
 *
 * Server component (pure display).
 */
import { TrendingUp } from 'lucide-react';
import type { WaiverUpgrade } from '@/lib/waiver-upgrades';

function poolLabel(pool: 'qb' | 'flex' | 'k' | null): string {
    return pool === 'qb' ? 'QB' : pool === 'flex' ? 'Flex' : pool === 'k' ? 'K' : '';
}

export function WaiverUpgradesCard({ upgrades }: { upgrades: WaiverUpgrade[] }) {
    if (!upgrades || upgrades.length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
            <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Waiver-wire upgrades</h3>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                    {upgrades.filter(u => !u.informational).length}
                </span>
            </div>
            <p className="text-xs text-zinc-500 mb-3">Available players who beat one of yours by this week&apos;s rankings.</p>

            <ul className="space-y-2">
                {upgrades.map((u, i) => {
                    const pl = poolLabel(u.pool);
                    const rankBit = u.addWeeklyRank != null && u.dropWeeklyRank != null && u.comparedTo
                        ? `${pl} #${u.addWeeklyRank} vs ${u.comparedTo.full_name} ${pl} #${u.dropWeeklyRank}`
                        : u.addWeeklyRank != null ? `${pl} #${u.addWeeklyRank} this week` : null;
                    const giveUp = u.type === 'swap' && u.valueSurrendered != null
                        ? `gives up ${Math.round(u.valueSurrendered).toLocaleString()} value` : null;
                    const headline = u.informational
                        ? `${u.add.full_name} (${u.add.position ?? '—'}) available — but no worthwhile drop`
                        : u.type === 'add'
                            ? `Add ${u.add.full_name} (${u.add.position ?? '—'}) — open spot`
                            : `Add ${u.add.full_name} (${u.add.position ?? '—'}) · drop ${u.drop?.full_name ?? '—'}`;
                    return (
                        <li key={`${u.add.sleeper_id}-${i}`} className={`text-sm ${u.informational ? 'opacity-60' : ''}`}>
                            <div className="text-zinc-800 dark:text-zinc-200">
                                {u.tier === 'caution' && !u.informational && (
                                    <span className="text-amber-500 mr-1" title="Valuable drop — consider before dropping">⚠️</span>
                                )}
                                {u.cracksLineup && !u.informational && (
                                    <span className="text-emerald-500 mr-1" title="Would crack your starting lineup">▲</span>
                                )}
                                {headline}
                                {u.weeklyRankGain != null && !u.informational && (
                                    <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">+{u.weeklyRankGain} spots</span>
                                )}
                            </div>
                            {(rankBit || giveUp) && (
                                <div className="text-[11px] text-zinc-400 mt-0.5">{[rankBit, giveUp].filter(Boolean).join(' · ')}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
