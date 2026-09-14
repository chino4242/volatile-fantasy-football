/**
 * DraftKings Classic NFL lineup optimizer — pure, no I/O (unit-testable).
 *
 * Classic roster (9 slots, $50,000 cap):
 *   QB, RB, RB, WR, WR, WR, TE, FLEX (RB/WR/TE), DST
 *
 * Maximizes total projected points under the salary cap, returning the top-N
 * distinct lineups. Projection is the objective; implied team total breaks ties.
 *
 * Algorithm: DYNAMIC PROGRAMMING (salary-axis knapsack) — exact and fast.
 * Combinatorial enumeration fails because an optimal DFS lineup mixes expensive
 * studs with cheap punts, so you can't prune to top-projection players. Instead:
 *   1. Per position, buildPosDp → best[k][bucket] = max projection using EXACTLY
 *      k distinct players at EXACTLY that salary bucket, with backpointers to
 *      recover the chosen players. (DK salaries are $100 multiples → $100 buckets.)
 *   2. For FLEX ∈ {RB,WR,TE}, convolve the position DPs left-to-right over the
 *      salary axis (QB→DST→RB→WR→TE with the flex adding one to that position),
 *      storing split backpointers so we recover each position's bucket in O(1)
 *      per step — no brute re-search.
 *   3. Recover players, keep the global best across flex options.
 *   4. Top-N distinct lineups via "exclude one player, re-solve" perturbation.
 */

export type DkPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'DST';

export interface DkCandidate {
    id: string;
    name: string;
    position: DkPosition;
    salary: number;
    projection: number;
    team: string | null;
    teamTotal: number | null;
    opponent?: string | null;
}

export interface DkLineup {
    slots: { slot: string; player: DkCandidate }[];
    totalSalary: number;
    totalProjection: number;
    totalTeamEnvironment: number;
}

export const DK_SALARY_CAP = 50_000;
const BUCKET = 100;
const NEG = -Infinity;

interface Options {
    salaryCap?: number;
    count?: number;
    poolCapPerPos?: number;
}

/**
 * Per-position DP over EXACT salary buckets.
 *   best[k][b] = max projection using exactly k players costing exactly b buckets.
 *   pick[k][b] / prevB[k][b] = backpointers (last player index, previous bucket).
 */
interface PosDp {
    players: DkCandidate[];
    maxK: number;
    buckets: number;
    best: Float64Array[];
    pick: Int32Array[];
    prevB: Int32Array[];
}

function buildPosDp(players: DkCandidate[], maxK: number, buckets: number): PosDp {
    const best: Float64Array[] = [];
    const pick: Int32Array[] = [];
    const prevB: Int32Array[] = [];
    for (let k = 0; k <= maxK; k++) {
        best.push(new Float64Array(buckets + 1).fill(NEG));
        pick.push(new Int32Array(buckets + 1).fill(-1));
        prevB.push(new Int32Array(buckets + 1).fill(-1));
    }
    best[0][0] = 0; // exactly 0 players, 0 cost
    for (let i = 0; i < players.length; i++) {
        const cost = Math.round(players[i].salary / BUCKET);
        if (cost > buckets) continue;
        const proj = players[i].projection;
        for (let k = maxK; k >= 1; k--) {
            const cur = best[k], prev = best[k - 1], curPick = pick[k], curPrev = prevB[k];
            for (let b = buckets; b >= cost; b--) {
                const base = prev[b - cost];
                if (base === NEG) continue;
                const val = base + proj;
                if (val > cur[b]) { cur[b] = val; curPick[b] = i; curPrev[b] = b - cost; }
            }
        }
    }
    return { players, maxK, buckets, best, pick, prevB };
}

/** Recover the exact k players at exact bucket b. */
function recover(dp: PosDp, k: number, b: number): DkCandidate[] {
    const out: DkCandidate[] = [];
    let kk = k, bb = b;
    while (kk > 0) {
        const idx = dp.pick[kk][bb];
        if (idx < 0) return out; // infeasible chain
        out.push(dp.players[idx]);
        bb = dp.prevB[kk][bb];
        kk--;
    }
    return out;
}

/** A convolution layer result: for each total bucket, best projection + the
 *  bucket spent on THIS layer's position (backpointer to split the total). */
interface Layer { best: Float64Array; split: Int32Array; }

/** Convolve an accumulated profile with a position's best[k] profile. */
function convolve(acc: Float64Array, posBestK: Float64Array, buckets: number): Layer {
    const best = new Float64Array(buckets + 1).fill(NEG);
    const split = new Int32Array(buckets + 1).fill(-1);
    for (let ba = 0; ba <= buckets; ba++) {
        const va = acc[ba];
        if (va === NEG) continue;
        for (let bp = 0; ba + bp <= buckets; bp++) {
            const vp = posBestK[bp];
            if (vp === NEG) continue;
            const b = ba + bp, v = va + vp;
            if (v > best[b]) { best[b] = v; split[b] = bp; }
        }
    }
    return { best, split };
}

export function optimizeDkLineups(pool: DkCandidate[], opts: Options = {}): DkLineup[] {
    const cap = opts.salaryCap ?? DK_SALARY_CAP;
    const count = opts.count ?? 3;
    const poolCap = opts.poolCapPerPos ?? 40;
    const buckets = Math.floor(cap / BUCKET);

    const grouped: Record<DkPosition, DkCandidate[]> = { QB: [], RB: [], WR: [], TE: [], DST: [] };
    for (const p of pool) if (grouped[p.position] && p.salary > 0) grouped[p.position].push(p);
    for (const pos of Object.keys(grouped) as DkPosition[]) {
        grouped[pos].sort((a, b) => b.projection - a.projection || (b.teamTotal ?? 0) - (a.teamTotal ?? 0));
        grouped[pos] = grouped[pos].slice(0, poolCap);
    }
    if (grouped.QB.length < 1 || grouped.RB.length < 2 || grouped.WR.length < 3 || grouped.TE.length < 1 || grouped.DST.length < 1) {
        return [];
    }

    const solveBest = (excluded: Set<string>): DkLineup | null => {
        const filt = (arr: DkCandidate[]) => (excluded.size ? arr.filter(p => !excluded.has(p.id)) : arr);
        const QB = filt(grouped.QB), DST = filt(grouped.DST), RB = filt(grouped.RB), WR = filt(grouped.WR), TE = filt(grouped.TE);
        if (QB.length < 1 || DST.length < 1 || RB.length < 2 || WR.length < 3 || TE.length < 1) return null;

        const dpQB = buildPosDp(QB, 1, buckets);
        const dpDST = buildPosDp(DST, 1, buckets);
        const dpRB = buildPosDp(RB, 3, buckets);
        const dpWR = buildPosDp(WR, 4, buckets);
        const dpTE = buildPosDp(TE, 2, buckets);

        let globalBest: { proj: number; lineup: DkLineup } | null = null;
        const flexOptions: DkPosition[] = ['RB', 'WR', 'TE'];

        for (const flex of flexOptions) {
            const nRB = 2 + (flex === 'RB' ? 1 : 0);
            const nWR = 3 + (flex === 'WR' ? 1 : 0);
            const nTE = 1 + (flex === 'TE' ? 1 : 0);
            if (RB.length < nRB || WR.length < nWR || TE.length < nTE) continue;

            // Convolve in fixed order: QB, DST, RB, WR, TE. Keep each layer to
            // backtrack the per-position bucket split.
            const start = new Float64Array(buckets + 1).fill(NEG);
            start[0] = 0;
            const L_QB = convolve(start, dpQB.best[1], buckets);
            const L_DST = convolve(L_QB.best, dpDST.best[1], buckets);
            const L_RB = convolve(L_DST.best, dpRB.best[nRB], buckets);
            const L_WR = convolve(L_RB.best, dpWR.best[nWR], buckets);
            const L_TE = convolve(L_WR.best, dpTE.best[nTE], buckets);

            // Best total under cap.
            let bestB = -1, bestV = NEG;
            for (let b = 0; b <= buckets; b++) {
                if (L_TE.best[b] > bestV) { bestV = L_TE.best[b]; bestB = b; }
            }
            if (bestB < 0 || bestV === NEG) continue;
            if (globalBest && bestV <= globalBest.proj) continue;

            // Backtrack the per-position buckets via each layer's split pointer.
            const bTE = L_TE.split[bestB];
            const afterWR = bestB - bTE;
            const bWR = L_WR.split[afterWR];
            const afterRB = afterWR - bWR;
            const bRB = L_RB.split[afterRB];
            const afterDST = afterRB - bRB;
            const bDST = L_DST.split[afterDST];
            const bQB = afterDST - bDST;

            const qbSel = recover(dpQB, 1, bQB);
            const dstSel = recover(dpDST, 1, bDST);
            const rbSel = recover(dpRB, nRB, bRB);
            const wrSel = recover(dpWR, nWR, bWR);
            const teSel = recover(dpTE, nTE, bTE);
            const all = [...qbSel, ...dstSel, ...rbSel, ...wrSel, ...teSel];
            if (all.length !== 9) continue;
            const salary = all.reduce((s, p) => s + p.salary, 0);
            if (salary > cap) continue;

            const slots: { slot: string; player: DkCandidate }[] = [];
            slots.push({ slot: 'QB', player: qbSel[0] });
            for (const p of rbSel.slice(0, 2)) slots.push({ slot: 'RB', player: p });
            for (const p of wrSel.slice(0, 3)) slots.push({ slot: 'WR', player: p });
            for (const p of teSel.slice(0, 1)) slots.push({ slot: 'TE', player: p });
            const flexPlayer = [...rbSel.slice(2), ...wrSel.slice(3), ...teSel.slice(1)][0];
            slots.push({ slot: 'FLEX', player: flexPlayer });
            slots.push({ slot: 'DST', player: dstSel[0] });

            const lineup: DkLineup = {
                slots,
                totalSalary: salary,
                totalProjection: all.reduce((s, p) => s + p.projection, 0),
                totalTeamEnvironment: all.reduce((s, p) => s + (p.teamTotal ?? 0), 0),
            };
            if (!globalBest || lineup.totalProjection > globalBest.proj) {
                globalBest = { proj: lineup.totalProjection, lineup };
            }
        }
        return globalBest?.lineup ?? null;
    };

    const first = solveBest(new Set());
    if (!first) return [];

    const results: DkLineup[] = [first];
    const seen = new Set<string>([first.slots.map(s => s.player.id).sort().join('|')]);

    // Alternates: exclude one player of the best lineup at a time, re-solve.
    const alternates: DkLineup[] = [];
    for (const s of first.slots) {
        const alt = solveBest(new Set([s.player.id]));
        if (!alt) continue;
        const key = alt.slots.map(x => x.player.id).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        alternates.push(alt);
    }
    alternates.sort((a, b) =>
        b.totalProjection - a.totalProjection ||
        b.totalTeamEnvironment - a.totalTeamEnvironment ||
        a.totalSalary - b.totalSalary);
    for (const alt of alternates) {
        if (results.length >= count) break;
        results.push(alt);
    }
    return results.slice(0, count);
}
