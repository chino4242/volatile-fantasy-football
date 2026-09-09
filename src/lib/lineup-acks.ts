/**
 * Lineup-flag acknowledgments ("On purpose"), week-scoped + local.
 *
 * When Chino benches the "better" player on purpose (injury hedge, matchup read),
 * acknowledging a lineup flag drops it from the Action Center for the CURRENT
 * week. It resets next week when matchups change. No persisted audit trail —
 * deliberately simple.
 *
 * Storage shape: { [week: string]: string[] }  (week → list of acked ackKeys)
 * ackKey = `${platform}:${leagueId}:${startId}->${benchId|none}` — matches the
 * lineup ActionItem id suffix from action-center.ts.
 *
 * Pure helpers (readAcks/writeAck/isAcked/pruneToWeek/ackKeyFor) are unit-tested;
 * the useLineupAcks hook is a thin client wrapper adding cross-component sync via
 * a custom event, mirroring useSeasonMode.
 */

export const ACKS_STORAGE_KEY = 'vff_lineup_acks';
const CHANGE_EVENT = 'vff-lineup-acks-change';

export type AcksByWeek = Record<string, string[]>;

export function ackKeyFor(platform: string, leagueId: string, startId: string, benchId: string | null): string {
    return `${platform}:${leagueId}:${startId}->${benchId ?? 'none'}`;
}

export function readAcks(): AcksByWeek {
    try {
        const raw = localStorage.getItem(ACKS_STORAGE_KEY);
        return raw ? (JSON.parse(raw) as AcksByWeek) : {};
    } catch {
        return {};
    }
}

function saveAcks(acks: AcksByWeek): void {
    try {
        localStorage.setItem(ACKS_STORAGE_KEY, JSON.stringify(acks));
    } catch {
        /* ignore quota/availability */
    }
}

export function isAcked(acks: AcksByWeek, week: number | null, ackKey: string): boolean {
    if (week == null) return false;
    return (acks[String(week)] ?? []).includes(ackKey);
}

export function writeAck(week: number | null, ackKey: string): void {
    if (week == null) return;
    const acks = readAcks();
    const wk = String(week);
    const list = acks[wk] ?? [];
    if (!list.includes(ackKey)) list.push(ackKey);
    acks[wk] = list;
    saveAcks(acks);
}

/** Keep only the current week's bucket (matchups reset weekly). No-op if null. */
export function pruneToWeek(week: number | null): void {
    if (week == null) return;
    const acks = readAcks();
    const wk = String(week);
    const next: AcksByWeek = {};
    if (acks[wk]) next[wk] = acks[wk];
    saveAcks(next);
}
