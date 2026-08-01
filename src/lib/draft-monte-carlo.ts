/**
 * Monte Carlo Draft Simulation
 * 
 * Runs N simulated drafts with randomized CPU behavior to produce
 * probabilistic availability % for each player at each pick.
 */

export interface SimPlayer {
    id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
    redraft_auction_value?: number | null;
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
    // player.id -> pick index -> number of sims where player was available
    availability: Map<string, number[]>;
    // Summary: for each user pick, top available players with probabilities
    pickSummaries: PickSummary[];
    totalSims: number;
}

export interface PickSummary {
    pickNumber: number;
    round: number;
    slot: number;
    topAvailable: { playerId: string; playerName: string; position: string | null; probability: number }[];
}

/**
 * Score a player for CPU pick decision.
 * Position discounts are lighter than the draft plan's scoring —
 * CPU teams DO draft QBs/TEs, just less frequently.
 */
function scoreCPU(player: SimPlayer, sf: boolean): number {
    let value = player.fc_value || 0;
    // In 1QB: QBs are taken less often but NOT never — ~1 per team over a draft
    if (player.position === 'QB' && !sf) value *= 0.75;
    if (player.position === 'TE') value *= 0.90;
    return value;
}

/**
 * Simulate a single CPU pick with randomness.
 * Selects from top K candidates using weighted-random (score squared).
 */
function simulateCPUPick(pool: SimPlayer[], sf: boolean): number {
    if (pool.length === 0) return -1;

    // Score top candidates
    const K = Math.min(5, pool.length);
    const scored = pool
        .map((p, idx) => ({ idx, score: scoreCPU(p, sf) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, K);

    // Weighted random selection (score squared for heavier top-weighting)
    const totalWeight = scored.reduce((sum, s) => sum + s.score * s.score, 0);
    if (totalWeight === 0) return scored[0].idx;

    let rand = Math.random() * totalWeight;
    for (const candidate of scored) {
        rand -= candidate.score * candidate.score;
        if (rand <= 0) return candidate.idx;
    }
    return scored[0].idx;
}

/**
 * Run a single draft simulation.
 * Returns which players from the pool survived to each of the user's picks.
 */
function runSingleSim(
    draftPool: SimPlayer[],
    userPicks: SimPick[],
    numTeams: number,
    sf: boolean,
): Map<string, boolean[]> {
    // Track availability: player.id -> [available at pick 0, pick 1, ...]
    const availability = new Map<string, boolean[]>();
    const allPlayerIds = draftPool.map(p => p.id);
    for (const id of allPlayerIds) {
        availability.set(id, new Array(userPicks.length).fill(false));
    }

    // Simulate the draft
    const remainingPool = [...draftPool];
    let lastOverall = 0;

    for (let pickIdx = 0; pickIdx < userPicks.length; pickIdx++) {
        const userPick = userPicks[pickIdx];
        const overallPick = userPick.pickNumber || ((userPick.round - 1) * numTeams + userPick.slot);

        // Simulate CPU picks between our last pick and this one
        const picksBetween = Math.max(0, overallPick - lastOverall - 1);

        for (let i = 0; i < picksBetween && remainingPool.length > 0; i++) {
            // Apply random "skip" (10% chance a player falls past a team)
            const pickedIdx = simulateCPUPick(remainingPool, sf);
            if (pickedIdx >= 0) {
                remainingPool.splice(pickedIdx, 1);
            }
        }

        lastOverall = overallPick;

        // Record which players are still available at this pick
        for (const player of remainingPool) {
            const avail = availability.get(player.id);
            if (avail) avail[pickIdx] = true;
        }

        // Simulate our pick (remove the best available for next iteration)
        if (remainingPool.length > 0) {
            // Remove the top-scored player (what we'd likely pick)
            const bestIdx = remainingPool.reduce((best, p, idx) =>
                scoreCPU(p, sf) > scoreCPU(remainingPool[best], sf) ? idx : best, 0);
            remainingPool.splice(bestIdx, 1);
        }
    }

    return availability;
}

/**
 * Run Monte Carlo draft simulation.
 * Executes numSims drafts and aggregates availability probabilities.
 */
export function runMonteCarloSim(config: SimConfig): SimResult {
    const { draftPool, userPicks, numTeams, numSims, sf, onProgress } = config;

    // Aggregate: player.id -> [count available at pick 0, pick 1, ...]
    const aggregated = new Map<string, number[]>();
    for (const player of draftPool) {
        aggregated.set(player.id, new Array(userPicks.length).fill(0));
    }

    // Run simulations
    for (let sim = 0; sim < numSims; sim++) {
        const simResult = runSingleSim(draftPool, userPicks, numTeams, sf);

        // Accumulate results
        for (const [playerId, pickAvailability] of simResult) {
            const counts = aggregated.get(playerId);
            if (counts) {
                for (let i = 0; i < pickAvailability.length; i++) {
                    if (pickAvailability[i]) counts[i]++;
                }
            }
        }

        // Report progress
        if (onProgress && (sim + 1) % 10 === 0) {
            onProgress(sim + 1, numSims);
        }
    }

    // Build pick summaries
    const pickSummaries: PickSummary[] = userPicks.map((pick, pickIdx) => {
        const playerProbs = draftPool
            .map(p => {
                const counts = aggregated.get(p.id);
                const prob = counts ? Math.round((counts[pickIdx] / numSims) * 100) : 0;
                return { playerId: p.id, playerName: p.full_name, position: p.position, probability: prob };
            })
            .filter(p => p.probability > 0)
            .sort((a, b) => b.probability - a.probability);

        return {
            pickNumber: pick.pickNumber,
            round: pick.round,
            slot: pick.slot,
            topAvailable: playerProbs.slice(0, 20),
        };
    });

    return {
        availability: aggregated,
        pickSummaries,
        totalSims: numSims,
    };
}

/**
 * Get the Monte Carlo availability % for a specific player at a specific pick.
 */
export function getMonteCarloAvailability(
    result: SimResult | null,
    playerId: string,
    pickIndex: number,
): number | null {
    if (!result) return null;
    const counts = result.availability.get(playerId);
    if (!counts || pickIndex >= counts.length) return null;
    return Math.round((counts[pickIndex] / result.totalSims) * 100);
}
