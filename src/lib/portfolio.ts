/**
 * Portfolio contract — the lean, format-resolved shape the /portfolio page and
 * its Phase-1 features (contender/rebuild, weakest-starter, undervalued-FA sweep)
 * consume for EVERY platform (Sleeper, Fleaflicker, Yahoo, MyFFPC).
 *
 * The whole point of this contract is that FORMAT IS ALREADY RESOLVED at the
 * source: by the time a PortfolioLeague reaches the UI, `myRank`/`marketRank`/
 * `marketValue` are the correct lens for that league (SF vs 1QB vs redraft) — no
 * downstream code should ever re-pick a format. Mixing format lenses within a
 * league produces wrong advice, so the contract deliberately drops the raw
 * per-format columns and exposes single resolved numbers.
 *
 * Ranks: lower = better (rank 1 is the best). null = unranked in that lens.
 * Values: higher = better (market/FantasyCalc value). null = no market value.
 */

export type PortfolioFormat = '1qb' | 'sf';
export type PortfolioLeagueType = 'dynasty' | 'keeper' | 'redraft';
export type PortfolioPlatform = 'sleeper' | 'fleaflicker' | 'yahoo' | 'myffpc';

export interface PortfolioPlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    age: number | null;
    /** Chino's board — proprietary OVERALL rank in this league's format (lower=better). */
    myRank: number | null;
    /** Chino's board — proprietary POSITION rank in this league's format (lower=better). */
    myPosRank: number | null;
    /** Market/consensus (FantasyCalc) OVERALL rank in this format (lower=better). */
    marketRank: number | null;
    /** Market/consensus (FantasyCalc) value in this format (higher=better). */
    marketValue: number | null;
    /** Only meaningful for players ON a roster. */
    is_starter: boolean;
    /** Chino's manual portfolio-wide tag, if any: 'buy' | 'sell'. */
    tag?: 'buy' | 'sell' | null;
    /** Analyst transaction action from the feed, if any: 'buy' | 'sell' | 'add'. */
    txnAction?: 'buy' | 'sell' | 'add' | null;
    /** The analyst rationale (writeup) tied to txnAction. */
    txnNote?: string | null;
    /** This week's optimizer signal (attached by the portfolio route when weekly
     *  rankings exist). rank lower=better; total/posMatchup are tiebreakers. */
    weeklyRank?: number | null;
    weeklyTotal?: number | null;
    weeklyPosMatchup?: number | null;
}

export interface PortfolioTeam {
    /** Stable per-platform roster identifier (string form).
     *  - sleeper: String(roster_id)   - fleaflicker: String(team id)
     *  - yahoo/myffpc: rosters.roster_id */
    rosterId: string;
    ownerName: string;
    players: PortfolioPlayer[];
}

export interface PortfolioLeague {
    platform: PortfolioPlatform;
    leagueId: string;
    name: string;
    format: PortfolioFormat;
    leagueType: PortfolioLeagueType;
    teams: PortfolioTeam[];
    /** Available players (not on any roster), enriched + format-resolved. */
    freeAgents: PortfolioPlayer[];
    /** League starting-slot config (for the lineup optimizer). Null if unknown. */
    rosterPositions?: string[] | null;
    /** The week the attached weeklyRank values are for (null if none uploaded). */
    weeklyWeek?: number | null;
}

/** A single league descriptor the client hands the portfolio route. */
export interface PortfolioLeagueRef {
    platform: PortfolioPlatform;
    leagueId: string;
    format: PortfolioFormat;
    leagueType: PortfolioLeagueType;
    name?: string;
}

// ── Format-resolution helpers (the one place format→columns is decided) ──────

/** Column picks for a given format, used when reading playerValues rows. */
export interface FormatColumns {
    fcValue: 'fc_value_sf' | 'fc_value_1qb';
    fcRank: 'fc_rank_sf' | 'fc_rank_1qb';
    fcPosRank: 'fc_position_rank_sf' | 'fc_position_rank_1qb';
    myOverall: 'rank_sf_overall' | 'rank_1qb_overall';
    myPos: 'rank_sf_pos' | 'rank_1qb_pos';
}

/**
 * Resolve which playerValues columns to read for a league.
 * Dynasty/keeper use the SF-or-1QB dynasty ranks; redraft leagues use the
 * redraft rank set for the proprietary board (market value still comes from the
 * format-matched FantasyCalc column, which is the closest market proxy we have).
 */
export function formatColumns(format: PortfolioFormat, leagueType: PortfolioLeagueType): FormatColumns {
    const sf = format === 'sf';
    return {
        fcValue: sf ? 'fc_value_sf' : 'fc_value_1qb',
        fcRank: sf ? 'fc_rank_sf' : 'fc_rank_1qb',
        fcPosRank: sf ? 'fc_position_rank_sf' : 'fc_position_rank_1qb',
        // Proprietary board: redraft leagues read the redraft ranks; otherwise
        // the dynasty SF/1QB ranks. (redraft_rank_* is single-format.)
        myOverall: leagueType === 'redraft' ? ('redraft_rank_overall' as any) : (sf ? 'rank_sf_overall' : 'rank_1qb_overall'),
        myPos: leagueType === 'redraft' ? ('redraft_rank_pos' as any) : (sf ? 'rank_sf_pos' : 'rank_1qb_pos'),
    };
}

function toNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

/**
 * Build a PortfolioPlayer from a joined players+playerValues row, given the
 * already-resolved format columns. `row` is expected to expose the columns named
 * in FormatColumns plus sleeper_id/full_name/position/team/age.
 */
export function toPortfolioPlayer(
    row: Record<string, unknown>,
    cols: FormatColumns,
    isStarter: boolean,
): PortfolioPlayer {
    return {
        sleeper_id: String(row.sleeper_id),
        full_name: String(row.full_name ?? ''),
        position: (row.position as string) ?? null,
        team: (row.team as string) ?? null,
        age: toNum(row.age),
        myRank: toNum(row[cols.myOverall]),
        myPosRank: toNum(row[cols.myPos]),
        marketRank: toNum(row[cols.fcRank]),
        marketValue: toNum(row[cols.fcValue]),
        is_starter: isStarter,
    };
}



// ─────────────────────────────────────────────────────────────────────────
// Phase-1 insight computations — pure functions over the contract.
// Everything here assumes format is ALREADY resolved (myRank/marketRank/
// marketValue are the correct lens), so these are format-agnostic.
// ─────────────────────────────────────────────────────────────────────────

// Positions Chino actually values/ranks. K and DEF are excluded everywhere —
// he doesn't rank them, they carry no market value, and including them only
// adds zeros/noise to team-value totals and skews the contender ratio.
const VALUED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

/** Whether a player counts toward value calculations. */
function isValued(p: PortfolioPlayer): boolean {
    return VALUED_POSITIONS.has(p.position || '');
}

/** Total market value of a team's roster (skill positions only). */
export function teamMarketValue(team: PortfolioTeam): number {
    return team.players.reduce((sum, p) => sum + (isValued(p) ? (p.marketValue || 0) : 0), 0);
}

/** Median helper. */
function median(nums: number[]): number {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Average age of the "core" (top-N valued players by market value). */
export function teamCoreAvgAge(team: PortfolioTeam, coreN = 12): number | null {
    const withAge = team.players
        .filter(p => isValued(p) && p.marketValue != null && p.age != null)
        .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
        .slice(0, coreN)
        .map(p => p.age as number);
    if (withAge.length === 0) return null;
    return withAge.reduce((a, b) => a + b, 0) / withAge.length;
}

export type CompetitiveState = 'contender' | 'middle' | 'rebuild';

export interface TeamLabel {
    state: CompetitiveState;
    /** Team's total market value. */
    totalValue: number;
    /** League median team value, for context. */
    leagueMedian: number;
    coreAvgAge: number | null;
    reason: string;
}

/**
 * Feature H — contender/rebuild/middle label for a team, relative to its league.
 * Heuristic (dynasty-oriented): combine roster VALUE (vs league median) with core
 * AGE. High value = win-now capable; a young core leans "build for later" even
 * when strong; an old core with mid value screams "rebuild".
 * For redraft leagues, age is irrelevant → label purely on value percentile.
 */
export function labelTeam(team: PortfolioTeam, league: PortfolioLeague): TeamLabel {
    const values = league.teams.map(teamMarketValue);
    const leagueMedian = median(values);
    const totalValue = teamMarketValue(team);
    const coreAvgAge = teamCoreAvgAge(team);
    const ratio = leagueMedian > 0 ? totalValue / leagueMedian : 1;

    // Redraft: no dynasty age dimension — pure value percentile.
    if (league.leagueType === 'redraft') {
        const state: CompetitiveState = ratio >= 1.08 ? 'contender' : ratio <= 0.92 ? 'rebuild' : 'middle';
        return { state, totalValue, leagueMedian, coreAvgAge, reason: `Roster value ${Math.round(ratio * 100)}% of league median` };
    }

    // Dynasty/keeper: value × age.
    const strong = ratio >= 1.08;
    const weak = ratio <= 0.92;
    const young = coreAvgAge != null && coreAvgAge <= 24.5;
    const old = coreAvgAge != null && coreAvgAge >= 27;

    let state: CompetitiveState;
    let reason: string;
    if (strong && !young) { state = 'contender'; reason = `Top-heavy value (${Math.round(ratio * 100)}% of median), win-now core`; }
    else if (weak && old) { state = 'rebuild'; reason = `Below-median value (${Math.round(ratio * 100)}%) with an aging core`; }
    else if (young && !strong) { state = 'rebuild'; reason = `Young core (avg ${coreAvgAge?.toFixed(1)}), building`; }
    else if (strong && young) { state = 'contender'; reason = `Strong AND young — win now, sustainable`; }
    else { state = 'middle'; reason = `Middle of the pack (${Math.round(ratio * 100)}% of median)`; }

    return { state, totalValue, leagueMedian, coreAvgAge, reason };
}

export interface WeakestStarter {
    player: PortfolioPlayer | null;
    /** How this starter ranks among the team's own starters (1 = weakest). */
    note: string;
}

/**
 * Feature G — the weakest player in a team's starting lineup = the upgrade
 * target. "Weakest" by market value (what the position is actually worth),
 * falling back to worst rank when value is missing. Returns null if the platform
 * doesn't flag starters (e.g. Fleaflicker here) so the UI can show "n/a".
 */
export function weakestStarter(team: PortfolioTeam): WeakestStarter {
    // Only consider skill positions Chino actually ranks (K/DEF are excluded —
    // he doesn't rank them and they're not meaningful upgrade targets).
    const starters = team.players.filter(p => p.is_starter && ['QB', 'RB', 'WR', 'TE'].includes(p.position || ''));
    if (starters.length === 0) return { player: null, note: 'No rankable starters for this platform' };
    const sorted = [...starters].sort((a, b) => {
        const av = a.marketValue ?? -1, bv = b.marketValue ?? -1;
        return av - bv; // ascending → weakest first
    });
    const w = sorted[0];
    return { player: w, note: `Weakest of ${starters.length} starters` };
}

export interface UndervaluedFA {
    player: PortfolioPlayer;
    /** Positive = Chino ranks him better than the market (the edge). Null if unrankable. */
    rankEdge: number | null;
    /** True when surfaced because Chino tagged him 'buy' or the feed said 'add'. */
    tagged: boolean;
    /** Why it surfaced: 'buy' tag, 'add' from the feed, or 'edge' (pure rank gap). */
    reason: 'buy' | 'add' | 'edge';
    /** Analyst rationale, if this came from the transactions feed. */
    note?: string | null;
}

/**
 * Feature R — undervalued free-agent sweep. A free agent surfaces if ANY of:
 *  1. Dual-value gap: Chino's board ranks him meaningfully higher than the
 *     market → rankEdge = marketRank - myRank ≥ minEdge.
 *  2. Chino tagged him 'buy' on his board.
 *  3. The analyst transactions feed said 'add' or 'buy' him.
 * Explicit directives (buy tag / add feed) sort first, then by rank edge.
 */
export function undervaluedFreeAgents(league: PortfolioLeague, minEdge = 15, limit = 12): UndervaluedFA[] {
    const out: UndervaluedFA[] = [];
    for (const p of league.freeAgents) {
        const hasRanks = p.myRank != null && p.marketRank != null;
        const rankEdge = hasRanks ? (p.marketRank as number) - (p.myRank as number) : null;
        const isBuy = p.tag === 'buy' || p.txnAction === 'buy';
        const isAdd = p.txnAction === 'add';
        const hasEdge = rankEdge != null && rankEdge >= minEdge;
        if (isBuy || isAdd || hasEdge) {
            const reason: 'buy' | 'add' | 'edge' = isBuy ? 'buy' : isAdd ? 'add' : 'edge';
            out.push({ player: p, rankEdge, tagged: isBuy || isAdd, reason, note: p.txnNote ?? null });
        }
    }
    const rank = (r: 'buy' | 'add' | 'edge') => (r === 'buy' ? 0 : r === 'add' ? 1 : 2);
    return out
        .sort((a, b) => {
            if (rank(a.reason) !== rank(b.reason)) return rank(a.reason) - rank(b.reason);
            return (b.rankEdge ?? 0) - (a.rankEdge ?? 0);
        })
        .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────
// Lineup optimizer glue (pure) — runs the tested engine on a PortfolioTeam using
// the weekly fields the route attaches. No DB access → safe on the client.
// ─────────────────────────────────────────────────────────────────────────

import { buildSlots, optimizeAndDiff, type OptimizerPlayer, type OptimizerResult } from './lineup-optimizer';

/** Run the lineup optimizer for one portfolio team. Returns null if the league
 *  has no slot config or no weekly rankings to act on. */
export function optimizePortfolioTeam(league: PortfolioLeague, team: PortfolioTeam): (OptimizerResult & { hasWeeklyData: boolean }) | null {
    if (!league.rosterPositions || league.rosterPositions.length === 0) return null;
    const slots = buildSlots(league.rosterPositions);
    const players: OptimizerPlayer[] = team.players.map(p => ({
        sleeper_id: p.sleeper_id,
        full_name: p.full_name,
        position: p.position,
        rank: p.weeklyRank ?? null,
        total: p.weeklyTotal ?? null,
        posMatchup: p.weeklyPosMatchup ?? null,
        isStarter: p.is_starter,
    }));
    const hasWeeklyData = players.some(p => p.rank != null);
    if (!hasWeeklyData) return null;
    return { ...optimizeAndDiff(players, slots), hasWeeklyData };
}
