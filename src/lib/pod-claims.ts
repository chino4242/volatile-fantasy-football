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
    const message = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system: EXTRACTION_SYSTEM,
        messages: [{ role: 'user', content: transcript.slice(0, 100_000) }], // cap very long transcripts
    });

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
    // Grab the first [...] block in case the model wrapped it.
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return [];
    let raw: unknown;
    try {
        raw = JSON.parse(text.slice(start, end + 1));
    } catch {
        return [];
    }
    if (!Array.isArray(raw)) return [];

    const out: ExtractedClaim[] = [];
    for (const r of raw as Record<string, unknown>[]) {
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
export function resolveClaims(
    claims: ExtractedClaim[],
    show: string,
    week: number,
    nameToId: Map<string, string>,
): PodClaim[] {
    return claims.map(c => ({
        sleeper_id: nameToId.get(cleanseName(c.player_name)) ?? null,
        player_name: c.player_name,
        show,
        week,
        signal_type: c.signal_type,
        direction: c.direction,
        conviction: c.conviction,
        quote: c.quote,
    }));
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
