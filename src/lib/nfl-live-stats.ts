/**
 * Live per-player fantasy points, computed by US from ESPN box scores.
 *
 * Why compute instead of using each platform's points field? So EVERY started
 * player shows a consistent live number that ticks up as games progress —
 * uniform across all platforms (not just Sleeper/Fleaflicker). The exact value
 * won't match any league's precise scoring (that's a planned per-league
 * follow-up); this is a "half-PPR, close enough, see who's cooking" signal.
 *
 * Source: ESPN summary?event={id} → boxscore.players[].statistics[] (live,
 * cumulative during games). Public, no auth, HTTP-only (Vercel-safe). DEF/K are
 * intentionally not scored in v1.
 */

import { cache, TTL } from './cache';

const ESPN_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const UA = 'Mozilla/5.0';

/** Half-PPR live line for one player, plus a light usage signal. */
export interface LivePlayerStat {
    /** ESPN athlete display name (bridged to sleeper_id by the caller). */
    name: string;
    points: number;
    /** Light "who's getting work" signal: targets + carries (touches-ish). */
    usage: number;
    /** Short usage detail for the UI, e.g. "7 tgt · 3 car". */
    usageLabel: string | null;
}

// ── Half-PPR scoring ─────────────────────────────────────────────────────────
const SCORING = {
    passYd: 0.04, passTD: 4, interception: -2,
    rushYd: 0.1, rushTD: 6,
    recYd: 0.1, recTD: 6, reception: 0.5,
    fumbleLost: -2,
} as const;

/** Look up a labeled stat value from ESPN's parallel labels[]/stats[] arrays. */
function statVal(labels: string[], stats: string[], label: string): number {
    const i = labels.indexOf(label);
    if (i === -1) return 0;
    const raw = stats[i];
    if (raw == null) return 0;
    // Some cells are like "23/33" (C/ATT) or "3-10" (sacks) — take the first number.
    const m = String(raw).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
}

/**
 * Compute half-PPR points for a single athlete from their category stat lines.
 * `byCat` maps ESPN category name → { labels, stats } for this athlete.
 */
export function scoreAthlete(byCat: Record<string, { labels: string[]; stats: string[] }>): { points: number; usage: number; usageLabel: string | null } {
    let points = 0;
    let targets = 0, carries = 0, receptions = 0;

    const passing = byCat['passing'];
    if (passing) {
        points += statVal(passing.labels, passing.stats, 'YDS') * SCORING.passYd;
        points += statVal(passing.labels, passing.stats, 'TD') * SCORING.passTD;
        points += statVal(passing.labels, passing.stats, 'INT') * SCORING.interception;
    }
    const rushing = byCat['rushing'];
    if (rushing) {
        carries = statVal(rushing.labels, rushing.stats, 'CAR');
        points += statVal(rushing.labels, rushing.stats, 'YDS') * SCORING.rushYd;
        points += statVal(rushing.labels, rushing.stats, 'TD') * SCORING.rushTD;
    }
    const receiving = byCat['receiving'];
    if (receiving) {
        receptions = statVal(receiving.labels, receiving.stats, 'REC');
        targets = statVal(receiving.labels, receiving.stats, 'TGTS');
        points += receptions * SCORING.reception;
        points += statVal(receiving.labels, receiving.stats, 'YDS') * SCORING.recYd;
        points += statVal(receiving.labels, receiving.stats, 'TD') * SCORING.recTD;
    }
    const fumbles = byCat['fumbles'];
    if (fumbles) {
        points += statVal(fumbles.labels, fumbles.stats, 'LOST') * SCORING.fumbleLost;
    }

    const usage = targets + carries;
    const parts: string[] = [];
    if (targets) parts.push(`${targets} tgt`);
    if (carries) parts.push(`${carries} car`);
    const usageLabel = parts.length ? parts.join(' · ') : null;

    return { points: Math.round(points * 10) / 10, usage, usageLabel };
}

/** Parse an ESPN summary payload → per-athlete half-PPR lines, keyed by name. */
export function parseSummary(json: any): LivePlayerStat[] {
    const out: LivePlayerStat[] = [];
    const teams = json?.boxscore?.players || [];
    for (const team of teams) {
        // Gather each athlete's category rows: athleteId → { cat → {labels, stats} }.
        const byAthlete = new Map<string, { name: string; cats: Record<string, { labels: string[]; stats: string[] }> }>();
        for (const catBlock of team?.statistics || []) {
            const cat = catBlock?.name;
            const labels: string[] = catBlock?.labels || [];
            if (!cat) continue;
            for (const a of catBlock?.athletes || []) {
                const id = a?.athlete?.id;
                const name = a?.athlete?.displayName;
                if (!id || !name) continue;
                let rec = byAthlete.get(id);
                if (!rec) { rec = { name, cats: {} }; byAthlete.set(id, rec); }
                rec.cats[cat] = { labels, stats: a?.stats || [] };
            }
        }
        for (const { name, cats } of byAthlete.values()) {
            const { points, usage, usageLabel } = scoreAthlete(cats);
            // Only surface players with any offensive involvement.
            if (points === 0 && usage === 0) continue;
            out.push({ name, points, usage, usageLabel });
        }
    }
    return out;
}

/** Fetch + score one game's live box score. Cached with the short LIVE TTL. */
export async function getLivePlayerStats(eventId: string): Promise<LivePlayerStat[]> {
    const cacheKey = `nfl:live:box:${eventId}`;
    const cached = cache.get<LivePlayerStat[]>(cacheKey, TTL.LIVE);
    if (cached) return cached;
    try {
        const res = await fetch(`${ESPN_SUMMARY}?event=${eventId}`, { headers: { 'user-agent': UA }, cache: 'no-store' });
        if (!res.ok) return [];
        const json = await res.json();
        const stats = parseSummary(json);
        cache.set(cacheKey, stats);
        return stats;
    } catch {
        return [];
    }
}
