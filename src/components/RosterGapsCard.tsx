/**
 * Roster Gaps card (team page) — for each starting slot, where my player ranks vs
 * the best available free agent, this week and rest-of-season.
 *
 * Quiet by design: slots with no worthwhile gap are collapsed one-liners
 * ("K · Aubrey · K #5 vs #12 · no action"); only actionable slots open by default
 * and show the recommended move. Renders nothing when there are no starting slots,
 * and adds no badge/count anywhere else in the app.
 *
 * Server component, pure display (native <details>, no client JS). Advisory only:
 * the deep link goes to the real platform; nothing is executed here.
 */
import type { SlotGap, HorizonGap, SlotMove, WeeklyPool } from '@/lib/slot-gaps';
import { gapSummary } from '@/lib/slot-gaps';
import type { PortfolioPlayer } from '@/lib/portfolio';

const POOL_LABEL: Record<WeeklyPool, string> = { qb: 'QB', flex: 'Flex', k: 'K' };

function who(p: PortfolioPlayer): string {
    return `${p.full_name}${p.position ? ` (${p.position}${p.team ? ` · ${p.team}` : ''})` : ''}`;
}

/** "Flex #14 vs #6" / "ROS #22 vs #9" — null when the horizon has nothing to show. */
function horizonText(h: HorizonGap, label: string): string | null {
    if (h.locked) return 'locked (game started)';
    if (h.status === 'unavailable') return null;
    const mine = h.myRank != null ? `#${h.myRank}` : 'unranked';
    return h.best ? `${label} ${mine} vs #${h.best.rank}` : `${label} ${mine}`;
}

function statusText(g: SlotGap): string {
    switch (g.status) {
        case 'none': return 'no action';
        case 'minor': return 'close';
        case 'unranked-mine': return 'unranked';
        case 'actionable': return g.myPlayer ? 'worth a move' : 'empty slot';
        default: return '';
    }
}

function MoveLine({ move }: { move: SlotMove }) {
    if (move.informational) {
        return (
            <div className="text-xs text-zinc-500">
                {move.add.full_name} would help. {move.note}
            </div>
        );
    }
    const tierMark = move.tier === 'caution' ? (
        <span className="text-amber-500 mr-1" title="Valuable drop. Consider before dropping.">⚠</span>
    ) : null;
    return (
        <div className="text-sm text-zinc-800 dark:text-zinc-200">
            {tierMark}
            {move.type === 'add' && move.source === 'weekly-upgrade'
                ? <>Add <strong>{move.add.full_name}</strong> (open roster spot)</>
                : move.drop
                    ? <>Add <strong>{move.add.full_name}</strong> · drop {move.drop.full_name}</>
                    : <>Add <strong>{move.add.full_name}</strong></>}
            {move.source === 'ros-only' && move.note && (
                <span className="ml-1 text-xs text-zinc-500">({move.note})</span>
            )}
        </div>
    );
}

function SlotRow({ g, deepLink, linkLabel }: { g: SlotGap; deepLink?: string | null; linkLabel?: string }) {
    const open = g.status === 'actionable' || g.status === 'unranked-mine';
    const poolLabel = g.weekly.pool ? POOL_LABEL[g.weekly.pool] : 'Wk';
    const bits = [
        horizonText(g.weekly, `Wk ${poolLabel}`),
        horizonText(g.ros, 'ROS'),
    ].filter(Boolean);
    const sameBest = g.weekly.best && g.ros.best && g.weekly.best.player.sleeper_id === g.ros.best.player.sleeper_id;

    return (
        <details open={open} className="group py-1.5 border-t border-zinc-100 dark:border-zinc-800 first:border-t-0">
            <summary className="flex items-center gap-2 cursor-pointer list-none text-sm">
                <span className="text-[10px] font-semibold uppercase text-zinc-400 w-16 flex-shrink-0">{g.slot}</span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[10rem]">
                    {g.myPlayer ? g.myPlayer.full_name : <span className="text-zinc-400">Empty</span>}
                </span>
                <span className="text-xs text-zinc-500 flex-1 truncate">{bits.join(' · ')}</span>
                <span
                    className={`text-[11px] flex-shrink-0 ${open
                        ? 'font-semibold text-amber-600 dark:text-amber-400'
                        : 'text-zinc-400'}`}
                >
                    {statusText(g)}
                </span>
            </summary>

            <div className="pl-[4.5rem] pt-1.5 space-y-1">
                {g.weekly.best && (
                    <div className="text-xs text-zinc-500">
                        Best available this week: {who(g.weekly.best.player)} · {POOL_LABEL[g.weekly.pool ?? 'flex']} #{g.weekly.best.rank}
                    </div>
                )}
                {g.ros.best && !sameBest && (
                    <div className="text-xs text-zinc-500">
                        Best available ROS: {who(g.ros.best.player)} · ROS #{g.ros.best.rank}
                        {g.ros.best.player.rosPpg != null ? ` · ${g.ros.best.player.rosPpg.toFixed(1)} PPG` : ''}
                    </div>
                )}
                {g.ros.best && sameBest && g.ros.best.player.rosPpg != null && (
                    <div className="text-xs text-zinc-500">ROS #{g.ros.best.rank} · {g.ros.best.player.rosPpg.toFixed(1)} PPG</div>
                )}
                {!g.weekly.best && !g.ros.best && g.status !== 'unavailable' && (
                    <div className="text-xs text-zinc-400">No ranked free agents.</div>
                )}
                {g.move && <MoveLine move={g.move} />}
                {g.move && deepLink && (
                    <a
                        href={deepLink}
                        target={deepLink.startsWith('http') ? '_blank' : undefined}
                        rel="noreferrer"
                        className="inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                        Open {linkLabel ?? 'league'} ↗
                    </a>
                )}
            </div>
        </details>
    );
}

export function RosterGapsCard({
    gaps,
    week,
    hasWeeklyData,
    deepLink,
    linkLabel,
}: {
    gaps: SlotGap[];
    week: number | null;
    hasWeeklyData: boolean;
    deepLink?: string | null;
    linkLabel?: string;
}) {
    // No starting-slot config → the optimizer card already explains it. Say nothing.
    if (!gaps || gaps.length === 0) return null;

    const summary = gapSummary(gaps);
    const allClear = summary.worthAMove === 0 && summary.fine > 0;

    return (
        <div className="bg-white dark:bg-zinc-900 p-4 sm:p-6 rounded-xl shadow-sm ring-1 ring-zinc-900/5">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Roster Gaps</h2>
                <span className="text-xs text-zinc-400">
                    {summary.worthAMove > 0 && `${summary.worthAMove} slot${summary.worthAMove > 1 ? 's' : ''} worth a move`}
                    {summary.worthAMove > 0 && summary.fine > 0 && ' · '}
                    {summary.fine > 0 && `${summary.fine} fine`}
                </span>
            </div>

            {!hasWeeklyData && (
                <p className="text-xs text-zinc-500 mb-2">
                    Weekly rankings aren&apos;t uploaded{week != null ? ` for week ${week}` : ''}, so only rest-of-season is shown.{' '}
                    <a href="/admin" className="text-indigo-600 dark:text-indigo-400 hover:underline">Upload in Admin</a>
                </p>
            )}

            {allClear && (
                <p className="text-sm text-green-600 dark:text-green-400 mb-2">
                    No better free agents for your starters.
                </p>
            )}

            <div>
                {gaps.map((g, i) => (
                    <SlotRow key={`${g.slot}-${i}`} g={g} deepLink={deepLink} linkLabel={linkLabel} />
                ))}
            </div>
        </div>
    );
}
