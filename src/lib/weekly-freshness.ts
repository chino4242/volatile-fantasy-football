/**
 * Weekly-ranking upload freshness (pure, no I/O).
 *
 * Weekly rankings are uploaded per kind (flex, qb, k, dst). `getLatestWeek()` is the
 * newest week across ALL kinds, so if flex rankings for week 12 are in but kickers
 * were never uploaded, the kicker lookup (which defaults to that week) quietly
 * returns an empty list. That silence reads as "no better kicker" when the truth is
 * "we can't tell". This module turns that into an explicit state.
 *
 *   ok      — the kind has rows at the overall latest week
 *   stale   — the kind's latest upload is an earlier week than the overall latest
 *   missing — the kind has never been uploaded
 *
 * No NFL calendar needed: freshness is judged against the newest upload of any kind.
 */

export type WeeklyKind = 'flex' | 'qb' | 'k' | 'dst';
export const WEEKLY_KINDS: WeeklyKind[] = ['flex', 'qb', 'k', 'dst'];

export type KindState = 'ok' | 'stale' | 'missing';

/** One row per kind from the database: its newest week, and how many ranked rows
 *  it has at the overall latest week. */
export interface KindRow {
    kind: string;
    latestWeek: number | null;
    rankedAtOverallLatest: number;
}

export interface KindStatus {
    state: KindState;
    latestWeek: number | null;
    /** Number of ranked rows in this kind's list this week (0 unless state is ok). */
    poolSize: number;
}

export interface WeeklyKindStatus {
    overallLatestWeek: number | null;
    kinds: Record<WeeklyKind, KindStatus>;
}

export function classifyKinds(rows: KindRow[], overallLatestWeek: number | null): WeeklyKindStatus {
    const kinds = {} as Record<WeeklyKind, KindStatus>;
    for (const k of WEEKLY_KINDS) {
        const r = rows.find(x => x.kind === k && x.latestWeek != null);
        if (!r || overallLatestWeek == null) {
            kinds[k] = { state: 'missing', latestWeek: r?.latestWeek ?? null, poolSize: 0 };
        } else if ((r.latestWeek as number) < overallLatestWeek) {
            kinds[k] = { state: 'stale', latestWeek: r.latestWeek, poolSize: 0 };
        } else {
            kinds[k] = { state: 'ok', latestWeek: r.latestWeek, poolSize: r.rankedAtOverallLatest };
        }
    }
    return { overallLatestWeek, kinds };
}

export interface KindNotice {
    kind: WeeklyKind;
    state: 'stale' | 'missing';
    latestWeek: number | null;
    overallLatestWeek: number | null;
    message: string;
}

const KIND_WORD: Record<WeeklyKind, string> = { qb: 'quarterback', flex: 'flex (RB/WR/TE)', k: 'kicker', dst: 'defense' };

/** Notices only for the kinds the league actually starts, and only when not ok. */
export function kindNotices(status: WeeklyKindStatus, startedKinds: WeeklyKind[]): KindNotice[] {
    const out: KindNotice[] = [];
    for (const kind of startedKinds) {
        const s = status.kinds[kind];
        if (s.state === 'ok') continue;
        const word = KIND_WORD[kind];
        const message = s.state === 'stale' && s.latestWeek != null && status.overallLatestWeek != null
            ? `No Week ${status.overallLatestWeek} ${word} ranking uploaded. Last upload: Week ${s.latestWeek}.`
            : `No ${word} ranking has been uploaded.`;
        out.push({ kind, state: s.state, latestWeek: s.latestWeek, overallLatestWeek: status.overallLatestWeek, message });
    }
    return out;
}
