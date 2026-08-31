/**
 * Monte Carlo Draft Simulation — Outcome-Based EV Optimizer
 * 
 * Replicates the mock draft's proven scorePlayer/simulatePick logic in a headless
 * simulation that evaluates: "Which pick at each slot leads to the best final team?"
 * 
 * This file does NOT modify or interfere with the mock draft's DraftClient.tsx.
 * It uses the same algorithmic approach but operates on plain data arrays.
 */

import { DRAFT_STYLES } from './draft-simulation';

// ============================================================
// AVAILABILITY SIMULATION (simple, for % badges)
// ============================================================

export interface SimPlayer {
    id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
}

export interface SimPick {
    pickNumber: number;
    round: number;
    slot: number;
}

export interface SimConfig {
    draftPool: SimPlayer[];
    userPicks: SimPick[];
    numTeams: number;
    numSims: number;
    sf: boolean;
    onProgress?: (completed: number, total: number) => void;
}

export interface SimResult {
    availability: Map<string, number[]>;
    totalSims: number;
}

function simCPUPick(pool: SimPlayer[], sf: boolean): number {
    if (pool.length === 0) return -1;
    const K = Math.min(5, pool.length);
    const scored = pool
        .map((p, idx) => {
            let score = p.fc_value || 0;
            if (p.position === 'QB' && !sf) score *= 0.65;
            if (p.position === 'TE') score *= 0.88;
            return { idx, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, K);
    const totalWeight = scored.reduce((sum, s) => sum + s.score * s.score, 0);
    if (totalWeight === 0) return scored[0].idx;
    let rand = Math.random() * totalWeight;
    for (const c of scored) { rand -= c.score * c.score; if (rand <= 0) return c.idx; }
    return scored[0].idx;
}

export function runMonteCarloSim(config: SimConfig): SimResult {
    const { draftPool, userPicks, numTeams, numSims, sf, onProgress } = config;
    const aggregated = new Map<string, number[]>();
    for (const p of draftPool) aggregated.set(p.id, new Array(userPicks.length).fill(0));

    for (let sim = 0; sim < numSims; sim++) {
        const pool = [...draftPool];
        let lastOverall = 0;
        for (let pickIdx = 0; pickIdx < userPicks.length; pickIdx++) {
            const userPick = userPicks[pickIdx];
            const overall = userPick.pickNumber || ((userPick.round - 1) * numTeams + userPick.slot);
            const between = Math.max(0, overall - lastOverall - 1);
            for (let i = 0; i < between && pool.length > 0; i++) {
                const idx = simCPUPick(pool, sf);
                if (idx >= 0) pool.splice(idx, 1);
            }
            lastOverall = overall;
            for (const p of pool) {
                const counts = aggregated.get(p.id);
                if (counts) counts[pickIdx]++;
            }
            if (pool.length > 0) {
                const bestIdx = pool.reduce((best, p, idx) => (p.fc_value || 0) > (pool[best].fc_value || 0) ? idx : best, 0);
                pool.splice(bestIdx, 1);
            }
        }
        if (onProgress && (sim + 1) % 10 === 0) onProgress(sim + 1, numSims);
    }
    return { availability: aggregated, totalSims: numSims };
}

export function getMonteCarloAvailability(result: SimResult | null, playerId: string, pickIndex: number): number | null {
    if (!result) return null;
    const counts = result.availability.get(playerId);
    if (!counts || pickIndex >= counts.length) return null;
    return Math.round((counts[pickIndex] / result.totalSims) * 100);
}

// ============================================================
// TYPES
// ============================================================

export interface MCPlayer {
    id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
    redraft_auction_value?: number | null;
    // Rankings
    rank_sf_overall?: number | null;
    rank_1qb_overall?: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    redraft_rank_overall?: number | null;
    // Prospect data
    zap_score?: number | null;
    zap_stale?: boolean;
    target_fade?: string | null;
    writeups?: { ai_confidence?: number | null }[] | null;
}

export interface MCTeam {
    id: number;
    name: string;
    players: MCPlayer[];
    positionValues: { QB: number; RB: number; WR: number; TE: number };
}

export interface MCPick {
    round: number;
    slot: number;
    overall: number;
    teamId: number;
}

export interface MCConfig {
    teams: MCTeam[];
    freeAgents: MCPlayer[];
    draftOrder: MCPick[];          // Full draft board (all rounds, all teams)
    userTeamId: number;
    keeperCount: number;
    keeperIds: string[];           // Your selected keepers
    sf: boolean;
    numSims: number;               // Forward sims per candidate
    numCandidates: number;         // Top N candidates to test per pick
    rosterSlots?: { QB: number; RB: number; WR: number; TE: number; FLEX: number };
    onProgress?: (currentPick: number, totalPicks: number, candidate: number, totalCandidates: number) => void;
}

export interface CandidateResult {
    playerId: string;
    playerName: string;
    position: string | null;
    playerValue: number;
    playerAuction: number;
    avgTeamEV: number;
    medianTeamEV: number;
    minTeamEV: number;
    maxTeamEV: number;
    evDelta: number;
    positionFill: string;
}

export interface OutcomePickResult {
    pickNumber: number;
    round: number;
    slot: number;
    candidates: CandidateResult[];
    bestCandidate: CandidateResult;
    insight: string;
}

export interface OutcomeSimResult {
    pickResults: OutcomePickResult[];
    totalSims: number;
    simMode: 'quick' | 'deep';
}

// ============================================================
// HEADLESS DRAFT ENGINE (replicates mock draft logic)
// ============================================================

interface SimState {
    pool: MCPlayer[];
    teamRosters: Map<number, MCPlayer[]>;   // teamId -> players (keepers + drafted)
    teamDrafted: Map<number, MCPlayer[]>;   // teamId -> drafted this sim only
    teamStyles: Map<number, typeof DRAFT_STYLES[number]>;
    picksCompleted: MCPick[];               // Picks made so far (for scarcity calc)
    sf: boolean;
    keeperCount: number;
    rosterSlots: { QB: number; RB: number; WR: number; TE: number; FLEX: number };
    userTeamId: number;
}

function assignTeamStyles(teams: MCTeam[], userTeamId: number): Map<number, typeof DRAFT_STYLES[number]> {
    const styles = new Map<number, typeof DRAFT_STYLES[number]>();
    for (const team of teams) {
        if (team.id === userTeamId) {
            styles.set(team.id, DRAFT_STYLES[0]); // user = balanced
        } else {
            styles.set(team.id, DRAFT_STYLES[Math.floor(Math.random() * DRAFT_STYLES.length)]);
        }
    }
    return styles;
}

function getPositionCounts(state: SimState, teamId: number): Record<string, number> {
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const roster = state.teamRosters.get(teamId) || [];
    for (const p of roster) {
        const pos = p.position || '';
        if (pos in counts) counts[pos]++;
    }
    return counts;
}

function getIdealStarters(rosterSlots: { QB: number }): Record<string, number> {
    return rosterSlots.QB >= 2
        ? { QB: 2, RB: 3, WR: 4, TE: 2 }
        : { QB: 1, RB: 3, WR: 4, TE: 2 };
}

function getRosterCaps(rosterSlots: { QB: number }): Record<string, number> {
    return rosterSlots.QB >= 2
        ? { QB: 3, RB: 7, WR: 8, TE: 3 }
        : { QB: 2, RB: 7, WR: 8, TE: 2 };
}

function getRosterCapPenalty(position: string, teamId: number, state: SimState): number {
    const counts = getPositionCounts(state, teamId);
    const have = counts[position] || 0;
    const style = state.teamStyles.get(teamId) || DRAFT_STYLES[0];
    const caps = getRosterCaps(state.rosterSlots);
    const maxAtPos = caps[position] || 5;
    const ideal = getIdealStarters(state.rosterSlots);
    const target = ideal[position] || 2;

    if (style.style === 'bpa') {
        if (have >= maxAtPos) return 0.0;
        if (have >= maxAtPos - 1) return 0.6;
        return 1.0;
    } else if (style.style === 'need') {
        if (have >= maxAtPos) return 0.0;
        if (have >= target + 2) return 0.3;
        if (have >= target + 1) return 0.55;
        if (have >= target) return 0.75;
        return 1.0;
    } else {
        if (have >= maxAtPos) return 0.0;
        if (have >= target + 3) return 0.5;
        if (have >= target + 1) return 0.75;
        if (have >= target) return 0.85;
        return 1.0;
    }
}

function calculatePositionalNeed(teamId: number, state: SimState): Record<string, number> {
    const roster = state.teamRosters.get(teamId) || [];
    const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const values: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

    for (const p of roster) {
        const pos = p.position || '';
        if (pos in counts) {
            counts[pos]++;
            values[pos] += p.fc_value || 0;
        }
    }

    const totalValue = values.QB + values.RB + values.WR + values.TE || 1;
    const targetAlloc: Record<string, number> = { QB: 0.12, RB: 0.30, WR: 0.38, TE: 0.12 };
    const ideal = getIdealStarters(state.rosterSlots);

    const needs: Record<string, number> = {};
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
        const currentPct = values[pos] / totalValue;
        const targetPct = targetAlloc[pos];
        const allocNeed = Math.max(0, Math.min(1, (targetPct - currentPct) / targetPct));
        const startReq = ideal[pos] || 1;
        const depthNeed = counts[pos] < startReq ? (startReq - counts[pos]) / startReq : 0;
        needs[pos] = allocNeed * 0.5 + depthNeed * 0.3;
    }
    return needs;
}

/**
 * Score a player for a given team — headless version of mock draft's scorePlayer.
 * Simplified: removes UI-specific state dependencies while preserving core logic.
 */
function scorePlayerHeadless(player: MCPlayer, teamId: number, state: SimState): number {
    const style = state.teamStyles.get(teamId) || DRAFT_STYLES[0];
    const w = style.weights;
    const isRedraft = !state.keeperCount || state.keeperCount <= 3;
    const sf = state.sf;

    // Base value
    let value = isRedraft
        ? (player.redraft_auction_value || 0) * 100
        : (player.fc_value || 0);

    // Position supply/demand
    if (player.position === 'QB') {
        if (state.rosterSlots.QB <= 1) value *= 0.55;
    } else if (player.position === 'TE') {
        value *= state.rosterSlots.TE >= 2 ? 0.95 : 0.85;
    }

    // Dynasty conviction boost
    const dynRank = sf ? player.rank_sf_overall : player.rank_1qb_overall;
    const fcRank = sf ? player.fc_rank_sf : player.fc_rank_1qb;
    let dynastyBoost = 0;
    if (dynRank && fcRank) {
        const gap = fcRank - dynRank;
        if (gap >= 15) dynastyBoost = 0.12 * w.dynasty;
        else if (gap >= 8) dynastyBoost = 0.06 * w.dynasty;
        else if (gap <= -15) dynastyBoost = -0.08 * w.dynasty;
    }

    // Redraft production boost
    let redraftBoost = 0;
    if (player.redraft_rank_overall && fcRank) {
        const rdGap = fcRank - player.redraft_rank_overall;
        if (rdGap >= 20) redraftBoost = 0.10 * w.redraft;
        else if (rdGap >= 10) redraftBoost = 0.05 * w.redraft;
        else if (rdGap <= -20) redraftBoost = -0.05 * w.redraft;
    }

    // ZAP prospect boost
    let zapBoost = 0;
    if (player.zap_score && !player.zap_stale) {
        if (player.zap_score >= 80) zapBoost = 0.15 * w.prospect;
        else if (player.zap_score >= 60) zapBoost = 0.08 * w.prospect;
        else if (player.zap_score >= 40) zapBoost = 0.03 * w.prospect;
        else if (player.zap_score < 15) zapBoost = -0.08 * w.prospect;
    }

    // AI confidence
    if (player.writeups?.length) {
        const best = Math.max(...player.writeups.map(wr => wr.ai_confidence || 0));
        if (best >= 8) value *= 1.04;
        else if (best <= 3) value *= 0.96;
    }

    // Target/Fade
    if (player.target_fade === 'target') value *= 1.10;
    else if (player.target_fade === 'fade') value *= 0.85;

    const adjustedValue = value * (1 + dynastyBoost + redraftBoost + zapBoost);

    // Tier scarcity
    let tierScarcityBoost = 0;
    if (player.position) {
        const playerValue = isRedraft ? (player.redraft_auction_value || 0) : (player.fc_value || 0);
        const tierFloor = playerValue * 0.7;
        const samePosSameTier = state.pool.filter(p =>
            p.position === player.position &&
            p.id !== player.id &&
            (isRedraft ? (p.redraft_auction_value || 0) : (p.fc_value || 0)) >= tierFloor
        ).length;

        if (samePosSameTier === 0) tierScarcityBoost = 0.25;
        else if (samePosSameTier <= 2) tierScarcityBoost = 0.12;
        else if (samePosSameTier >= 8) tierScarcityBoost = -0.08;
    }

    // Positional need
    const needs = calculatePositionalNeed(teamId, state);
    const posNeed = needs[player.position || ''] || 0;

    // Dampen for depth picks
    const counts = getPositionCounts(state, teamId);
    const have = counts[player.position || ''] || 0;
    const ideal = getIdealStarters(state.rosterSlots);
    const starterTarget = ideal[player.position || ''] || 2;
    const isDepthPick = have >= starterTarget;
    const effectiveNeed = isDepthPick ? posNeed * 0.25 : posNeed;

    const rawScore = (adjustedValue * (1 + tierScarcityBoost) * w.value) + (effectiveNeed * adjustedValue * w.need);

    // Roster cap penalty
    const rosterPenalty = getRosterCapPenalty(player.position || '', teamId, state);
    return rawScore * rosterPenalty;
}

/**
 * Simulate a CPU pick — replicates mock draft's simulatePick.
 * Scores all available, picks weighted-random from top 3.
 */
function simulateCPUPick(teamId: number, state: SimState): MCPlayer | null {
    if (state.pool.length === 0) return null;

    // Roster floor check
    const counts = getPositionCounts(state, teamId);
    const remainingPicks = state.picksCompleted.filter(p => p.teamId === teamId).length; // approximation
    // Simplified: if no QB and pool is thin, force QB
    if (counts.QB === 0 && state.pool.length <= 20) {
        const bestQB = state.pool.filter(p => p.position === 'QB').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))[0];
        if (bestQB) return bestQB;
    }

    // Score top candidates
    const scored = state.pool
        .map(p => ({ player: p, score: scorePlayerHeadless(p, teamId, state) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (scored.length === 0) return null;

    // Weighted random from top 3 (score squared)
    const squared = scored.map(c => ({ ...c, w: c.score * c.score }));
    const totalW = squared.reduce((sum, c) => sum + c.w, 0);
    if (totalW === 0) return scored[0].player;

    let random = Math.random() * totalW;
    for (const c of squared) {
        random -= c.w;
        if (random <= 0) return c.player;
    }
    return scored[0].player;
}

/**
 * Make a pick in the simulation — removes from pool, adds to team roster.
 */
function makePick(player: MCPlayer, teamId: number, state: SimState): void {
    const idx = state.pool.findIndex(p => p.id === player.id);
    if (idx >= 0) state.pool.splice(idx, 1);

    const roster = state.teamRosters.get(teamId) || [];
    roster.push(player);
    state.teamRosters.set(teamId, roster);

    const drafted = state.teamDrafted.get(teamId) || [];
    drafted.push(player);
    state.teamDrafted.set(teamId, drafted);
}

/**
 * Greedy pick for "our" future picks in forward simulation.
 * Uses the same scorePlayer logic with balanced style.
 */
function greedyPickForUser(state: SimState): MCPlayer | null {
    if (state.pool.length === 0) return null;
    const scored = state.pool
        .map(p => ({ player: p, score: scorePlayerHeadless(p, state.userTeamId, state) }))
        .sort((a, b) => b.score - a.score);
    return scored[0]?.player || null;
}

/**
 * Evaluate a team's final roster value (dynasty + auction blend).
 */
function evaluateTeamRoster(teamId: number, state: SimState): number {
    const roster = state.teamRosters.get(teamId) || [];
    let totalDynasty = 0;
    let totalAuction = 0;
    const posCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };

    for (const p of roster) {
        totalDynasty += p.fc_value || 0;
        totalAuction += (p.redraft_auction_value || 0) * 250;
        const pos = p.position || '';
        if (pos in posCounts) posCounts[pos]++;
    }

    // 60/40 dynasty/auction blend
    const blended = (totalDynasty * 0.6) + (totalAuction * 0.4);

    // Starter slot bonus/penalty
    const ideal = getIdealStarters(state.rosterSlots);
    let starterBonus = 0;
    for (const [pos, target] of Object.entries(ideal)) {
        const have = posCounts[pos] || 0;
        if (have >= target) starterBonus += target * 500;
        else if (have > 0) { starterBonus += have * 500; starterBonus -= (target - have) * 800; }
        else starterBonus -= target * 1200;
    }

    return blended + starterBonus;
}

/**
 * Clone a SimState for branching (forward sims need independent copies).
 */
function cloneState(state: SimState): SimState {
    return {
        pool: [...state.pool],
        teamRosters: new Map(Array.from(state.teamRosters.entries()).map(([k, v]) => [k, [...v]])),
        teamDrafted: new Map(Array.from(state.teamDrafted.entries()).map(([k, v]) => [k, [...v]])),
        teamStyles: state.teamStyles, // Shared ref is fine — styles don't change
        picksCompleted: [...state.picksCompleted],
        sf: state.sf,
        keeperCount: state.keeperCount,
        rosterSlots: state.rosterSlots,
        userTeamId: state.userTeamId,
    };
}

// (runForwardSim removed — forward simulation now inlined in runOutcomeMonteCarloSim)

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Generate strategic insight from candidate comparison.
 */
function generateInsight(candidates: CandidateResult[], rosterSlots: { QB: number }, rosterCounts: Record<string, number>): string {
    if (candidates.length < 2) return '';
    const best = candidates[0];
    const second = candidates[1];
    const evGap = best.avgTeamEV - second.avgTeamEV;
    const evGapPct = second.avgTeamEV > 0 ? (evGap / second.avgTeamEV) * 100 : 0;
    const samePos = best.position === second.position;
    const ideal = getIdealStarters(rosterSlots);
    const bestPos = best.position || '';
    const have = rosterCounts[bestPos] || 0;
    const want = ideal[bestPos] || 0;
    const needsPos = have < want;

    if (evGapPct > 3) {
        if (!samePos && needsPos) {
            return `${best.playerName} is the clear EV pick (+${Math.round(evGap).toLocaleString()} avg team value). Fills ${bestPos}${have + 1} starter need.`;
        }
        return `${best.playerName} is the clear EV pick (+${Math.round(evGap).toLocaleString()} avg value over ${second.playerName}).`;
    }
    if (evGapPct > 1.5) {
        if (samePos) return `${best.playerName} edges ${second.playerName} at ${best.position} (+${Math.round(evGap).toLocaleString()} EV).`;
        return `${best.playerName} (${best.position}) leads by +${Math.round(evGap).toLocaleString()} EV over ${second.playerName} (${second.position}).`;
    }
    if (!samePos) {
        return `Tight call: ${best.playerName} (${best.position}) vs ${second.playerName} (${second.position}), +${Math.round(evGap).toLocaleString()} EV gap.`;
    }
    return `${best.playerName} edges ${second.playerName} (+${Math.round(evGap).toLocaleString()} EV) at ${best.position}.`;
}

/**
 * Run the outcome-based Monte Carlo EV optimizer.
 * 
 * Uses the same pool, draft order, and scoring logic as the mock draft.
 * For each user pick, tests top candidates by simulating the rest of the
 * draft and evaluating final team value.
 */
export async function runOutcomeMonteCarloSim(config: MCConfig): Promise<OutcomeSimResult> {
    const {
        teams,
        freeAgents,
        draftOrder,
        userTeamId,
        keeperCount,
        keeperIds,
        sf,
        numSims,
        numCandidates,
        rosterSlots: rosterSlotsInput,
        onProgress,
    } = config;

    const rosterSlots = rosterSlotsInput || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 };
    const simMode = numSims >= 75 ? 'deep' as const : 'quick' as const;

    // === BUILD INITIAL POOL (same as mock draft keeper confirmation) ===
    // Start with free agents
    const initialPool: MCPlayer[] = [...freeAgents];

    // Resolve effective keeper IDs: if user hasn't selected, auto-keep top N by value
    const effectiveKeeperIds = keeperIds.length > 0
        ? keeperIds
        : (() => {
            const userTeam = teams.find(t => t.id === userTeamId);
            if (!userTeam || keeperCount <= 0) return [];
            const sorted = [...userTeam.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            return sorted.slice(0, keeperCount).map(p => p.id);
        })();

    // Add dropped players from keeper cuts
    if (keeperCount > 0) {
        for (const team of teams) {
            if (team.id === userTeamId) {
                // Your team: non-keeper players get dropped to pool
                const dropped = team.players.filter(p => !effectiveKeeperIds.includes(p.id));
                initialPool.push(...dropped);
            } else {
                // CPU teams: keep top N by value, drop the rest
                const sorted = [...team.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
                const dropped = sorted.slice(keeperCount);
                initialPool.push(...dropped);
            }
        }
    }

    // Sort pool by value descending (same as mock draft)
    initialPool.sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // === BUILD INITIAL TEAM ROSTERS (keepers) ===
    const initialRosters = new Map<number, MCPlayer[]>();
    for (const team of teams) {
        if (team.id === userTeamId) {
            // Your keepers (effective — auto if not selected)
            const keepers = team.players.filter(p => effectiveKeeperIds.includes(p.id));
            initialRosters.set(team.id, [...keepers]);
        } else {
            // CPU keepers (top N by value)
            const sorted = [...team.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            initialRosters.set(team.id, sorted.slice(0, keeperCount));
        }
    }

    // === IDENTIFY USER PICKS in the draft order ===
    const userPickIndices: number[] = [];
    for (let i = 0; i < draftOrder.length; i++) {
        if (draftOrder[i].teamId === userTeamId) {
            userPickIndices.push(i);
        }
    }

    // === RUN THE SIMULATION ===
    const pickResults: OutcomePickResult[] = [];

    // We simulate the draft up to each user pick, then branch.
    // The "canonical state" is advanced pick by pick between user picks.
    const canonicalState: SimState = {
        pool: [...initialPool],
        teamRosters: new Map(Array.from(initialRosters.entries()).map(([k, v]) => [k, [...v]])),
        teamDrafted: new Map(teams.map(t => [t.id, [] as MCPlayer[]])),
        teamStyles: assignTeamStyles(teams, userTeamId),
        picksCompleted: [],
        sf,
        keeperCount,
        rosterSlots,
        userTeamId,
    };

    let lastCanonicalIdx = 0; // Index into draftOrder where canonical state is at

    for (let userPickNum = 0; userPickNum < userPickIndices.length; userPickNum++) {
        const userPickIdx = userPickIndices[userPickNum];
        const userPick = draftOrder[userPickIdx];

        // Build candidate pool: initial pool minus players we've already committed to prior picks
        const draftedIds = new Set((canonicalState.teamDrafted.get(userTeamId) || []).map(p => p.id));
        const candidatePool = initialPool.filter(p => !draftedIds.has(p.id));

        // Pre-filter candidates by estimated availability at this pick.
        // Run a few quick sims of CPU picks before this pick to see who survives.
        const availabilityCounts = new Map<string, number>();
        const availSims = 10; // quick check
        for (let s = 0; s < availSims; s++) {
            const tempState = cloneState(canonicalState);
            tempState.pool = [...candidatePool];
            // Randomize CPU styles
            for (const [tid] of tempState.teamStyles) {
                if (tid !== userTeamId) tempState.teamStyles.set(tid, DRAFT_STYLES[Math.floor(Math.random() * DRAFT_STYLES.length)]);
            }
            // Simulate CPU picks before this user pick
            for (let i = lastCanonicalIdx; i < userPickIdx; i++) {
                const pick = draftOrder[i];
                if (tempState.pool.length === 0) break;
                const chosen = simulateCPUPick(pick.teamId, tempState);
                if (chosen) makePick(chosen, pick.teamId, tempState);
            }
            // Record who survived
            for (const p of tempState.pool) {
                availabilityCounts.set(p.id, (availabilityCounts.get(p.id) || 0) + 1);
            }
        }

        // Only consider candidates available in at least 20% of quick sims
        const likelyCandidates = candidatePool.filter(p => {
            const count = availabilityCounts.get(p.id) || 0;
            return count >= availSims * 0.2; // at least 20% availability
        });

        // Score candidates from the likely-available pool
        const scoringState: SimState = { ...canonicalState, pool: likelyCandidates };
        const candidateCount = Math.min(numCandidates, likelyCandidates.length);
        const scoredPool = likelyCandidates
            .map(p => ({ player: p, score: scorePlayerHeadless(p, userTeamId, scoringState) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, candidateCount);

        // Evaluate each candidate via forward simulation
        const candidateResults: CandidateResult[] = [];

        for (let cIdx = 0; cIdx < scoredPool.length; cIdx++) {
            const candidate = scoredPool[cIdx];
            const evScores: number[] = [];

            for (let sim = 0; sim < numSims; sim++) {
                // Clone state fresh for each sim
                const simState = cloneState(canonicalState);
                // Reset pool to candidatePool (all players minus our prior picks)
                simState.pool = [...candidatePool];

                // Reassign CPU styles for variance
                for (const [tid] of simState.teamStyles) {
                    if (tid !== userTeamId) {
                        simState.teamStyles.set(tid, DRAFT_STYLES[Math.floor(Math.random() * DRAFT_STYLES.length)]);
                    }
                }

                // Simulate CPU picks before this user pick
                for (let i = lastCanonicalIdx; i < userPickIdx; i++) {
                    const pick = draftOrder[i];
                    if (simState.pool.length === 0) break;
                    const chosen = simulateCPUPick(pick.teamId, simState);
                    if (chosen) makePick(chosen, pick.teamId, simState);
                }

                // Check if candidate survived CPU picks
                const stillAvailable = simState.pool.some(p => p.id === candidate.player.id);
                if (stillAvailable) {
                    makePick(candidate.player, userTeamId, simState);
                } else {
                    // Candidate was sniped — pick greedy fallback
                    const fallback = greedyPickForUser(simState);
                    if (fallback) makePick(fallback, userTeamId, simState);
                }

                // Simulate all remaining picks after this one
                const afterOrder = draftOrder.slice(userPickIdx + 1);
                for (const pick of afterOrder) {
                    if (simState.pool.length === 0) break;
                    if (pick.teamId === userTeamId) {
                        const chosen = greedyPickForUser(simState);
                        if (chosen) makePick(chosen, userTeamId, simState);
                    } else {
                        const chosen = simulateCPUPick(pick.teamId, simState);
                        if (chosen) makePick(chosen, pick.teamId, simState);
                    }
                }

                const ev = evaluateTeamRoster(userTeamId, simState);
                evScores.push(ev);
            }

            evScores.sort((a, b) => a - b);
            const avgEV = evScores.reduce((s, v) => s + v, 0) / evScores.length;
            const medianEV = evScores[Math.floor(evScores.length / 2)];

            const pos = candidate.player.position || 'BPA';
            const posCounts = getPositionCounts(canonicalState, userTeamId);
            const positionFill = `${pos}${(posCounts[pos] || 0) + 1}`;

            candidateResults.push({
                playerId: candidate.player.id,
                playerName: candidate.player.full_name,
                position: candidate.player.position,
                playerValue: candidate.player.fc_value || 0,
                playerAuction: candidate.player.redraft_auction_value || 0,
                avgTeamEV: avgEV,
                medianTeamEV: medianEV,
                minTeamEV: evScores[0],
                maxTeamEV: evScores[evScores.length - 1],
                evDelta: 0,
                positionFill,
            });

            if (onProgress) {
                onProgress(userPickNum + 1, userPickIndices.length, cIdx + 1, scoredPool.length);
            }

            // Yield to UI thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Sort by EV
        candidateResults.sort((a, b) => b.avgTeamEV - a.avgTeamEV);
        const bestEV = candidateResults[0]?.avgTeamEV || 0;
        for (const c of candidateResults) c.evDelta = bestEV - c.avgTeamEV;

        const rosterCounts = getPositionCounts(canonicalState, userTeamId);
        const insight = generateInsight(candidateResults, rosterSlots, rosterCounts);
        const bestCandidate = candidateResults[0];

        pickResults.push({
            pickNumber: userPick.overall,
            round: userPick.round,
            slot: userPick.slot,
            candidates: candidateResults,
            bestCandidate,
            insight,
        });

        // Commit best candidate for next pick's context
        if (bestCandidate) {
            const bestPlayer = initialPool.find(p => p.id === bestCandidate.playerId);
            if (bestPlayer) makePick(bestPlayer, userTeamId, canonicalState);
        }
        lastCanonicalIdx = userPickIdx + 1;
    }

    return { pickResults, totalSims: numSims, simMode };
}
