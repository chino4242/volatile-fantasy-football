/**
 * Value-based waiver recommendations card (free-agents page).
 *
 * "Of everyone available, who should you ADD — and who do you DROP for him?"
 * Driven by rest-of-season / dynasty value (not just this week's rank), each
 * recommendation pairs an add with a guarded drop (safe / caution / block).
 *
 * Server component (pure display).
 */
import { TrendingUp } from 'lucide-react';
import type { WaiverValueRec } from '@/lib/waiver-value';

function posBadge(pos: string | null): string {
    switch (pos) {
        case 'QB': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
        case 'RB': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
        case 'WR': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
        case 'TE': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
        default: return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400';
    }
}

export function WaiverValueCard({ recs }: { recs: WaiverValueRec[] }) {
    if (!recs || recs.length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Recommended for your team</h3>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">{recs.length}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Best available by rest-of-season value, each with who to drop. ⚠️ = valuable drop; use judgment.</p>
            </div>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {recs.map((r, i) => (
                    <li key={`${r.add.sleeper_id}-${i}`} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-zinc-400 w-5 text-center flex-shrink-0">{i + 1}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${posBadge(r.add.position)}`}>{r.add.position}</span>
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add {r.add.full_name}</span>
                            {r.strongThisWeek && (
                                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 rounded px-1 py-0.5" title="Also a strong start this week">this week ▲</span>
                            )}
                            {r.type === 'swap' && r.drop ? (
                                <span className="text-sm text-zinc-500">
                                    · drop{' '}
                                    <span className={r.tier === 'block' ? 'text-red-600 dark:text-red-400 font-medium' : r.tier === 'caution' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'}>
                                        {r.tier === 'caution' && <span title="Valuable — consider before dropping">⚠️ </span>}
                                        {r.tier === 'block' && <span title="Valuable asset — probably don't drop">⛔ </span>}
                                        {r.drop.full_name}
                                    </span>
                                    <span className="text-[10px] text-zinc-400"> ({r.drop.position})</span>
                                </span>
                            ) : (
                                <span className="text-sm text-emerald-600 dark:text-emerald-400">· open spot, no drop needed</span>
                            )}
                        </div>
                        {r.reasons.length > 0 && (
                            <div className="mt-0.5 pl-7 text-[11px] text-zinc-500">
                                {r.reasons.join(' · ')}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
