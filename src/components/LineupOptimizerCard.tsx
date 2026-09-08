import { ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import type { TeamOptimization } from "@/lib/weekly-rankings";

/**
 * Renders a team's lineup optimization: suggested swaps (rank-based) + the
 * optimal lineup. Advisory — highlights WHY a lineup is sub-optimal and the
 * recommended change; the manager decides. Server component (pure display).
 */
export function LineupOptimizerCard({ opt }: { opt: TeamOptimization }) {
    if (!opt.hasWeeklyData) {
        return (
            <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Lineup Optimizer</h2>
                <p className="text-sm text-zinc-500">
                    No weekly rankings uploaded{opt.week ? ` for week ${opt.week}` : ''} yet. Upload Flex/QB rankings in Admin to enable start/sit suggestions.
                </p>
            </div>
        );
    }

    // No starting-slot config → we can't build an optimal lineup (would falsely
    // report "optimal"). Be honest instead.
    if (opt.optimal.length === 0) {
        return (
            <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Lineup Optimizer</h2>
                <p className="text-sm text-zinc-500">
                    Starting-lineup slots aren&apos;t available for this league yet, so the optimal lineup can&apos;t be computed. Re-sync the league to capture its lineup slots.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Lineup Optimizer</h2>
                {opt.week != null && <span className="text-xs text-zinc-400">Week {opt.week}</span>}
            </div>

            {opt.isOptimal ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-4">
                    <CheckCircle2 className="h-4 w-4" /> Your lineup is already optimal by this week&apos;s rankings.
                </div>
            ) : (
                <div className="mb-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                        <AlertTriangle className="h-4 w-4" /> {opt.swaps.length} suggested change{opt.swaps.length > 1 ? 's' : ''}
                    </div>
                    <ul className="space-y-1.5">
                        {opt.swaps.map((s, i) => (
                            <li key={i} className="text-sm flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-semibold uppercase text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5">{s.slot}</span>
                                <span className="text-green-700 dark:text-green-300 font-medium">Start {s.startPlayer.full_name}</span>
                                <span className="text-zinc-400">({s.startPlayer.position}{s.startPlayer.rank != null ? ` · #${s.startPlayer.rank}` : ''})</span>
                                {s.benchPlayer && (
                                    <>
                                        <ArrowRight className="h-3 w-3 text-zinc-400" />
                                        <span className="text-zinc-500">bench {s.benchPlayer.full_name}</span>
                                        <span className="text-zinc-400">{s.benchPlayer.rank != null ? `(#${s.benchPlayer.rank})` : ''}</span>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Optimal lineup */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <div className="text-xs font-medium text-zinc-500 mb-1.5">Optimal lineup</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {opt.optimal.map((a, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="text-[10px] font-semibold uppercase text-zinc-400 w-16 flex-shrink-0">{a.slot}</span>
                            <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">
                                {a.player ? a.player.full_name : <span className="text-zinc-400">—</span>}
                            </span>
                            {a.player?.rank != null && <span className="text-xs text-zinc-400 flex-shrink-0">#{a.player.rank}</span>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
