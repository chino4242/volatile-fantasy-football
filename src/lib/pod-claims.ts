/**
 * Pod-claims engine — turn a fantasy-podcast transcript into structured
 * "player-claim" atoms, and aggregate them into the two-tier output the UI shows.
 *
 * The atom (see pod_claims table): who (sleeper_id) / signal_type / direction /
 * conviction / verbatim quote / show / week. Everything downstream is just
 * aggregating and routing atoms.
 *
 * Two-tier model:
 *   - Tier 1 SUMMARY (always, for any player with >=1 claim): neutral digest with
 *     counts + contradiction shown honestly.
 *   - Tier 2 RECOMMENDATION (only when a "heat" score clears a bar AND the takes
 *     mostly agree): graduates into an actionable buy/sell/hold lean.
 *
 * v1: NOT ranking-the-rankers — all shows weigh equally. Trust comes from always
 * carrying the verbatim quote (the receipt), never a naked robot verdict.
 */

import Anthropic from '@anthropic-ai/sdk';
import { cleanseName } from './nameUtils';

export type PodSignalType = 'role' | 'injury' | 'coachspeak' | 'vibe' | 'contrarian';
export type PodDirection = 'bull' | 'bear' | 'neutral';

/** A single extracted claim before DB insert (sleeper_id resolved separately). */
export interface ExtractedClaim {
    player_name: string;
    signal_type: PodSignalType;
    direction: PodDirection;
    conviction: number; // 1 (hedge) .. 5 (pounding the table)
    quote: string;      // verbatim
}

/** A claim row as stored / read back. */
export interface PodClaim {
    sleeper_id: string | null;
    player_name: string;
    show: string;
    week: number;
    signal_type: PodSignalType;
    direction: PodDirection;
    conviction: number;
    quote: string;
}

const VALID_SIGNAL = new Set<PodSignalType>(['role', 'injury', 'coachspeak', 'vibe', 'contrarian']);
const VALID_DIRECTION = new Set<PodDirection>(['bull', 'bear', 'neutral']);

const EXTRACTION_SYSTEM = `You extract structured fantasy-football "player claims" from a podcast transcript.

A claim is a statement about ONE specific NFL player that could influence a fantasy start/sit, add/drop, or trade decision — the kind of context that does NOT show up in a stat column or ranking: role/usage shifts, injury or practice nuance, coach-speak decoding, the analyst's conviction/vibe, or contrarian takes.

IMPORTANT — these transcripts are auto-generated from audio, so expect:
- Heavy noise: repeated/duplicated sentences, filler, crosstalk, false starts, and long off-topic comedy tangents. Read past all of it.
- Multiple hosts and multiple segments (e.g. week-in-review "take checks", news and notes, matchup previews, mailbag/trade questions). A typical fantasy episode contains MANY claims (often 15-40) scattered throughout — they are rarely stated cleanly in one place.
- Claims buried inside banter. "I feel good about X", "the usage of Y was not what it was", "Z is a must-start", "I'd trade away W", ranking a player in rest-of-season order — these are all claims. Extract them.

Dig the claims out of the noise. Returning an empty array should be RARE — only when the transcript genuinely contains no talk about specific NFL players at all. If players are discussed, extract every distinct claim you can support with a quote.

Return ONLY a JSON array (no prose, no markdown fences). Each element:
{
  "player_name": "<full player name exactly as a human would write it, e.g. 'Devaughn Vele'>",
  "signal_type": one of "role" | "injury" | "coachspeak" | "vibe" | "contrarian",
  "direction": "bull" (positive/buy/start) | "bear" (negative/sell/fade) | "neutral",
  "conviction": integer 1-5 (1 = hedged/uncertain, 5 = pounding the table),
  "quote": "<a short verbatim excerpt from the transcript that supports this claim>"
}

Rules:
- One element per DISTINCT claim. The same player may appear multiple times if the transcript makes multiple distinct claims.
- Contradictions across the transcript are fine — capture each as its own element.
- "quote" MUST be verbatim text from the transcript (trim to the relevant sentence(s)).
- Only include real NFL players who are named. Do not invent players or claims.
- If the transcript contains no usable player claims, return [].`;

/**
 * Extract player-claim atoms from a transcript via the Anthropic SDK.
 * Returns [] on any failure or empty result (caller decides how to surface).
 */
export async function extractClaimsFromTranscript(transcript: string): Promise<ExtractedClaim[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || !transcript.trim()) return [];

    const client = new Anthropic({ apiKey });
    // Stream the response. Two reasons:
    //  1. Adaptive thinking is always on for Sonnet 5 and its reasoning tokens count
    //     against max_tokens. A long, dense transcript spends a few thousand tokens
    //     thinking BEFORE emitting a 40+ claim JSON array; at max_tokens=8000 the
    //     response was cut off (or thinking ate the whole budget), yielding [].
    //  2. With a high max_tokens, the SDK REFUSES a non-streaming request (worst-case
    //     duration could exceed 10 min). Streaming avoids that pre-flight rejection.
    // 32000 gives generous headroom for thinking + output, well under the 128k cap.
    const stream = client.messages.stream({
        model: 'claude-sonnet-5',
        max_tokens: 32000,
        system: EXTRACTION_SYSTEM,
        messages: [{ role: 'user', content: transcript.slice(0, 100_000) }], // cap very long transcripts
    });
    const message = await stream.finalMessage();

    const text = message.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map(c => c.text)
        .join('\n')
        .trim();

    return parseExtraction(text);
}

/** Parse + validate the model's JSON array (tolerant of stray fences/prose). */
export function parseExtraction(text: string): ExtractedClaim[] {
    if (!text) return [];
    // Grab the first [...] block in case the model wrapped it (e.g. ```json fences).
    const start = text.indexOf('[');
    if (start === -1) return [];
    const end = text.lastIndexOf(']');

    let raw: unknown = null;
    // 1) Try the clean full array.
    if (end > start) {
        try { raw = JSON.parse(text.slice(start, end + 1)); } catch { /* fall through to salvage */ }
    }
    // 2) Salvage a TRUNCATED array (model hit max_tokens mid-JSON): close it at
    //    the last complete object.
    if (!Array.isArray(raw)) {
        const lastObj = text.lastIndexOf('}');
        if (lastObj > start) {
            try { raw = JSON.parse(text.slice(start, lastObj + 1) + ']'); } catch { /* give up */ }
        }
    }
    if (!Array.isArray(raw)) return [];

    const out: ExtractedClaim[] = [];
    for (const r of raw as Record<string, unknown>[]) {
        if (!r || typeof r !== 'object') continue;
        const player_name = typeof r.player_name === 'string' ? r.player_name.trim() : '';
        const signal_type = String(r.signal_type) as PodSignalType;
        const direction = String(r.direction) as PodDirection;
        const quote = typeof r.quote === 'string' ? r.quote.trim() : '';
        let conviction = Math.round(Number(r.conviction));
        if (!Number.isFinite(conviction)) conviction = 3;
        conviction = Math.max(1, Math.min(5, conviction));
        if (!player_name || !quote) continue;
        if (!VALID_SIGNAL.has(signal_type) || !VALID_DIRECTION.has(direction)) continue;
        out.push({ player_name, signal_type, direction, conviction, quote });
    }
    return out;
}

/**
 * Resolve extracted claims to sleeper_ids and stamp show/week, producing rows
 * ready for insert. Unmatched names keep sleeper_id = null (still stored).
 * `nameToId` maps cleanseName(full_name) -> sleeper_id (built by the caller from
 * the players table).
 */
/** A minimal player record for matching (built by the caller from the players table). */
export interface MatchablePlayer {
    sleeper_id: string;
    full_name: string;
}

/** How a claim's player_name resolved to a sleeper_id. */
export type MatchMethod = 'exact' | 'fuzzy' | 'none';

export interface ResolvedClaim extends PodClaim {
    matchMethod: MatchMethod;
    /** For fuzzy matches: the DB name we matched to (so the admin can eyeball it). */
    matchedName?: string;
}

/** Levenshtein edit distance (small strings; iterative, no deps). */
function editDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let curr = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

/** Similarity ratio 0..1 from edit distance (1 = identical). */
function similarity(a: string, b: string): number {
    const max = Math.max(a.length, b.length);
    return max === 0 ? 1 : 1 - editDistance(a, b) / max;
}

const lastName = (cleansed: string): string => {
    const parts = cleansed.split(' ');
    return parts[parts.length - 1] || cleansed;
};

/**
 * Fuzzy-match a (possibly mis-transcribed) player name against the players table.
 * Podcast transcripts come from audio, so names get garbled ("Tedaro McMillan" →
 * Tetairoa McMillan, "Ladd McConkie" → Ladd McConkey). Strategy, most confident first:
 *   1. exact cleansed match (handled by the caller before this)
 *   2. same last name + first-name similarity >= 0.6  (last names transcribe best)
 *   3. whole-name similarity >= 0.82
 * Returns the best candidate above threshold, or null. Conservative on purpose —
 * a wrong auto-match is worse than an honest "unmatched".
 */
export function fuzzyMatchPlayer(rawName: string, playersList: MatchablePlayer[]): MatchablePlayer | null {
    const target = cleanseName(rawName);
    if (!target) return null;
    const targetLast = lastName(target);
    const targetFirst = target.split(' ')[0] || '';

    let best: { p: MatchablePlayer; score: number } | null = null;
    for (const p of playersList) {
        const cand = cleanseName(p.full_name);
        if (!cand) continue;
        const candLast = lastName(cand);
        const candFirst = cand.split(' ')[0] || '';

        let score = 0;
        // Last-name anchor: last names match closely AND first names are in the ballpark.
        const lastSim = similarity(targetLast, candLast);
        if (lastSim >= 0.8) {
            const firstSim = similarity(targetFirst, candFirst);
            if (firstSim >= 0.6 || targetFirst[0] === candFirst[0]) {
                score = Math.max(score, 0.5 * lastSim + 0.5 * firstSim + 0.05);
            }
        }
        // Whole-name similarity fallback.
        const whole = similarity(target, cand);
        if (whole >= 0.82) score = Math.max(score, whole);

        if (score > 0 && (!best || score > best.score)) best = { p, score };
    }
    return best ? best.p : null;
}

/**
 * Resolve extracted claims to sleeper_ids and stamp show/week. Tries an EXACT
 * cleansed match first, then a conservative FUZZY match against `playersList`
 * (handles audio-transcription misspellings). Unmatched names keep sleeper_id =
 * null (still stored). Each row carries how it matched so callers can report /
 * flag fuzzy matches for review.
 */
export function resolveClaims(
    claims: ExtractedClaim[],
    show: string,
    week: number,
    nameToId: Map<string, string>,
    playersList?: MatchablePlayer[],
): ResolvedClaim[] {
    const byId = playersList ? new Map(playersList.map(p => [p.sleeper_id, p.full_name])) : new Map<string, string>();
    return claims.map(c => {
        const base = { player_name: c.player_name, show, week, signal_type: c.signal_type, direction: c.direction, conviction: c.conviction, quote: c.quote };
        const exact = nameToId.get(cleanseName(c.player_name));
        if (exact) return { ...base, sleeper_id: exact, matchMethod: 'exact' as const };
        if (playersList) {
            const f = fuzzyMatchPlayer(c.player_name, playersList);
            if (f) return { ...base, sleeper_id: f.sleeper_id, matchMethod: 'fuzzy' as const, matchedName: byId.get(f.sleeper_id) };
        }
        return { ...base, sleeper_id: null, matchMethod: 'none' as const };
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Two-tier aggregation
// ─────────────────────────────────────────────────────────────────────────

export interface PlayerPodSummary {
    mentions: number;
    bull: number;
    bear: number;
    neutral: number;
    /** Average conviction across claims (1..5). */
    avgConviction: number;
    /** 0..1 — how one-sided the directional takes are (excludes neutral). */
    agreementRatio: number;
    /** Composite 0..100 "how loud + confident" the chatter is. */
    heat: number;
    /** Tier-2 graduated lean, or null when it stays summary-only. */
    recommendation: { lean: 'buy' | 'sell' | 'hold'; confident: boolean } | null;
    /** One-line human digest, e.g. "3 mentions · 2 bullish (role), 1 cautious". */
    blurb: string;
    /** Distinct signal types present, most common first. */
    signals: PodSignalType[];
}

const HEAT_RECOMMEND_BAR = 45;   // below → summary only
const AGREE_CONFIDENT_BAR = 0.7; // one-sided enough to call it "confident"

/** Aggregate a set of claims for ONE player into the two-tier summary. */
export function aggregatePlayerClaims(claims: PodClaim[]): PlayerPodSummary | null {
    if (claims.length === 0) return null;

    const mentions = claims.length;
    let bull = 0, bear = 0, neutral = 0, convictionSum = 0;
    const signalCounts = new Map<PodSignalType, number>();
    for (const c of claims) {
        if (c.direction === 'bull') bull++;
        else if (c.direction === 'bear') bear++;
        else neutral++;
        convictionSum += c.conviction;
        signalCounts.set(c.signal_type, (signalCounts.get(c.signal_type) ?? 0) + 1);
    }
    const avgConviction = convictionSum / mentions;
    const directional = bull + bear;
    const agreementRatio = directional > 0 ? Math.max(bull, bear) / directional : 0;

    // Heat = volume × conviction × agreement, scaled to ~0..100.
    // - volume: saturates around 5 mentions
    // - conviction: 1..5 → 0..1
    // - agreement: neutral-only chatter shouldn't spike heat, so floor at 0.4
    const volume = Math.min(mentions / 5, 1);
    const conv = (avgConviction - 1) / 4;
    const agree = directional > 0 ? agreementRatio : 0.4;
    const heat = Math.round(volume * conv * agree * 100);

    const signals = [...signalCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);

    // Tier 2: only graduate when hot enough AND directional.
    let recommendation: PlayerPodSummary['recommendation'] = null;
    if (heat >= HEAT_RECOMMEND_BAR && directional > 0 && bull !== bear) {
        recommendation = {
            lean: bull > bear ? 'buy' : 'sell',
            confident: agreementRatio >= AGREE_CONFIDENT_BAR,
        };
    }

    return {
        mentions, bull, bear, neutral, avgConviction, agreementRatio, heat,
        recommendation, signals, blurb: buildBlurb(mentions, bull, bear, neutral, signals),
    };
}

function buildBlurb(mentions: number, bull: number, bear: number, neutral: number, signals: PodSignalType[]): string {
    const parts: string[] = [];
    if (bull) parts.push(`${bull} bullish`);
    if (bear) parts.push(`${bear} bearish`);
    if (neutral) parts.push(`${neutral} neutral`);
    const split = bull > 0 && bear > 0 ? ' — split take' : '';
    const sig = signals.length ? ` (${signals[0]})` : '';
    return `${mentions} mention${mentions === 1 ? '' : 's'}${sig} · ${parts.join(', ')}${split}`;
}

/** Group a flat list of claims (many players) by sleeper_id → summaries. Claims
 *  with a null sleeper_id are grouped under a `name:<cleansed>` key so unmatched
 *  players still aggregate. */
export function aggregateClaimsByPlayer(claims: PodClaim[]): Map<string, PlayerPodSummary> {
    const byKey = new Map<string, PodClaim[]>();
    for (const c of claims) {
        const key = c.sleeper_id ?? `name:${cleanseName(c.player_name)}`;
        const arr = byKey.get(key);
        if (arr) arr.push(c); else byKey.set(key, [c]);
    }
    const out = new Map<string, PlayerPodSummary>();
    for (const [key, arr] of byKey) {
        const summary = aggregatePlayerClaims(arr);
        if (summary) out.set(key, summary);
    }
    return out;
}


// ─────────────────────────────────────────────────────────────────────────
// Episode summary — a detailed, human-readable roundup of ONE upload, derived
// entirely from the extracted claims (no extra LLM call, so it never drifts
// from what actually got stored). Surfaced right after extraction so the user
// sees who was discussed and what was said without clicking through.
// ─────────────────────────────────────────────────────────────────────────

/** Minimal claim shape the summary needs (ExtractedClaim / PodClaim both satisfy it). */
type SummarizableClaim = {
    player_name: string;
    signal_type: PodSignalType;
    direction: PodDirection;
    conviction: number;
    quote: string;
};

export interface PlayerSummaryLine {
    player: string;
    lean: PodDirection;          // net lean across this player's claims in the episode
    mentions: number;
    maxConviction: number;
    signals: PodSignalType[];    // distinct signal types, most common first
    topQuote: string;            // the highest-conviction quote for this player
}

export interface EpisodeSummary {
    totalClaims: number;
    players: number;             // distinct players discussed
    bull: number;
    bear: number;
    neutral: number;
    /** One-line headline, e.g. "39 claims on 34 players — 18 bullish, 12 bearish, 9 neutral." */
    headline: string;
    /** Loudest bullish takes (highest conviction first), with quotes. */
    topBull: PlayerSummaryLine[];
    /** Loudest bearish takes. */
    topBear: PlayerSummaryLine[];
    /** Injury / news items called out in the episode. */
    injuryNotes: PlayerSummaryLine[];
    /** Every player discussed, one line each, ordered by notability. */
    perPlayer: PlayerSummaryLine[];
}

const DIRECTION_WEIGHT: Record<PodDirection, number> = { bull: 1, bear: -1, neutral: 0 };

/**
 * Build a detailed episode summary from a set of claims (one show+week upload).
 * Groups by player, computes each player's net lean + loudest quote, and buckets
 * the notable ones into bullish / bearish / injury lists. Pure + deterministic.
 */
export function summarizeClaims(claims: SummarizableClaim[]): EpisodeSummary | null {
    if (!claims.length) return null;

    // Group by cleansed name so "Debo" / "Deebo Samuel" style dupes fold together.
    const byPlayer = new Map<string, SummarizableClaim[]>();
    for (const c of claims) {
        const key = cleanseName(c.player_name);
        const arr = byPlayer.get(key);
        if (arr) arr.push(c); else byPlayer.set(key, [c]);
    }

    let bull = 0, bear = 0, neutral = 0;
    for (const c of claims) {
        if (c.direction === 'bull') bull++;
        else if (c.direction === 'bear') bear++;
        else neutral++;
    }

    const lines: PlayerSummaryLine[] = [];
    for (const arr of byPlayer.values()) {
        // Prefer the human-written display name (longest is usually the fullest form).
        const player = arr.map(c => c.player_name).sort((a, b) => b.length - a.length)[0];
        let net = 0, maxConviction = 0;
        const sigCounts = new Map<PodSignalType, number>();
        let top = arr[0];
        for (const c of arr) {
            net += DIRECTION_WEIGHT[c.direction] * c.conviction;
            if (c.conviction > maxConviction) { maxConviction = c.conviction; }
            if (c.conviction > top.conviction) top = c;
            sigCounts.set(c.signal_type, (sigCounts.get(c.signal_type) ?? 0) + 1);
        }
        const lean: PodDirection = net > 0 ? 'bull' : net < 0 ? 'bear' : 'neutral';
        const signals = [...sigCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
        lines.push({ player, lean, mentions: arr.length, maxConviction, signals, topQuote: top.quote });
    }

    // Notability = loudest + most-discussed first.
    const byNotability = (a: PlayerSummaryLine, b: PlayerSummaryLine) =>
        (b.maxConviction - a.maxConviction) || (b.mentions - a.mentions) || a.player.localeCompare(b.player);

    const topBull = lines.filter(l => l.lean === 'bull').sort(byNotability).slice(0, 6);
    const topBear = lines.filter(l => l.lean === 'bear').sort(byNotability).slice(0, 6);
    const injuryNotes = lines.filter(l => l.signals.includes('injury')).sort(byNotability).slice(0, 8);
    const perPlayer = [...lines].sort(byNotability);

    const headline = `${claims.length} claim${claims.length === 1 ? '' : 's'} on ${byPlayer.size} player${byPlayer.size === 1 ? '' : 's'} — ${bull} bullish, ${bear} bearish, ${neutral} neutral.`;

    return { totalClaims: claims.length, players: byPlayer.size, bull, bear, neutral, headline, topBull, topBear, injuryNotes, perPlayer };
}
