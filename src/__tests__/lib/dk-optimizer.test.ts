import { describe, it, expect } from 'vitest';
import { optimizeDkLineups, DK_SALARY_CAP, type DkCandidate, type DkPosition } from '@/lib/dk-optimizer';

let counter = 0;
function P(position: DkPosition, projection: number, salary: number, teamTotal = 20): DkCandidate {
    counter++;
    return { id: `p${counter}`, name: `${position}${counter}`, position, salary, projection, team: 'AAA', teamTotal };
}

/** Build a pool with enough players at each position to fill a Classic roster. */
function basePool(): DkCandidate[] {
    const pool: DkCandidate[] = [];
    // Cheap filler so lineups are always affordable.
    pool.push(P('QB', 20, 6000), P('QB', 15, 5000));
    pool.push(P('RB', 18, 6000), P('RB', 16, 5500), P('RB', 12, 4000), P('RB', 8, 3000));
    pool.push(P('WR', 19, 6500), P('WR', 17, 6000), P('WR', 14, 5000), P('WR', 10, 4000), P('WR', 7, 3000));
    pool.push(P('TE', 12, 4500), P('TE', 9, 3500));
    pool.push(P('DST', 8, 3000), P('DST', 6, 2500));
    return pool;
}

function roster(l: ReturnType<typeof optimizeDkLineups>[number]) {
    return l.slots.map(s => s.slot);
}

describe('optimizeDkLineups', () => {
    it('returns a valid Classic roster (QB/RB×2/WR×3/TE/FLEX/DST) under cap', () => {
        const lineups = optimizeDkLineups(basePool(), { count: 1 });
        expect(lineups).toHaveLength(1);
        const l = lineups[0];
        expect(roster(l)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST']);
        expect(l.slots).toHaveLength(9);
        expect(l.totalSalary).toBeLessThanOrEqual(DK_SALARY_CAP);
        // All players distinct.
        const ids = l.slots.map(s => s.player.id);
        expect(new Set(ids).size).toBe(9);
        // FLEX is RB/WR/TE.
        const flex = l.slots.find(s => s.slot === 'FLEX')!;
        expect(['RB', 'WR', 'TE']).toContain(flex.player.position);
    });

    it('maximizes projection: picks the highest-projection affordable lineup', () => {
        const l = optimizeDkLineups(basePool(), { count: 1 })[0];
        // Best possible with cheap salaries: top QB(20)+RB(18,16)+WR(19,17,14)+TE(12)+DST(8)+FLEX(best leftover skill=RB12).
        // = 20+18+16+19+17+14+12+8+12 = 136
        expect(l.totalProjection).toBe(136);
    });

    it('respects the salary cap (expensive studs force cheaper choices)', () => {
        const pool = basePool();
        // Make the top options very expensive so they can't all fit.
        for (const p of pool) if (p.projection >= 17) p.salary = 12000;
        const l = optimizeDkLineups(pool, { count: 1 })[0];
        expect(l.totalSalary).toBeLessThanOrEqual(DK_SALARY_CAP);
        expect(l.slots).toHaveLength(9);
    });

    it('returns up to N distinct lineups sorted by projection desc', () => {
        const lineups = optimizeDkLineups(basePool(), { count: 3 });
        expect(lineups.length).toBe(3);
        // Sorted desc.
        expect(lineups[0].totalProjection).toBeGreaterThanOrEqual(lineups[1].totalProjection);
        expect(lineups[1].totalProjection).toBeGreaterThanOrEqual(lineups[2].totalProjection);
        // Distinct rosters.
        const keys = lineups.map(l => l.slots.map(s => s.player.id).sort().join('|'));
        expect(new Set(keys).size).toBe(3);
    });

    it('uses team environment (teamTotal) as a tiebreaker when projection ties', () => {
        // Two DSTs, same projection + salary, different teamTotal → prefer higher.
        const pool = basePool().filter(p => p.position !== 'DST');
        pool.push({ id: 'dstA', name: 'A', position: 'DST', salary: 3000, projection: 8, team: 'AAA', teamTotal: 15 });
        pool.push({ id: 'dstB', name: 'B', position: 'DST', salary: 3000, projection: 8, team: 'BBB', teamTotal: 30 });
        const l = optimizeDkLineups(pool, { count: 1 })[0];
        expect(l.slots.find(s => s.slot === 'DST')!.player.id).toBe('dstB');
    });

    it('returns [] when the pool cannot fill the roster', () => {
        const pool: DkCandidate[] = [P('QB', 20, 5000), P('RB', 18, 5000)]; // not enough WR/TE/DST
        expect(optimizeDkLineups(pool)).toEqual([]);
    });

    it('handles a realistic-size slate quickly', () => {
        const pool: DkCandidate[] = [];
        const mk = (pos: DkPosition, n: number) => {
            for (let i = 0; i < n; i++) pool.push(P(pos, 25 - i * 0.3, 4000 + (i % 5) * 800, 18 + (i % 6)));
        };
        mk('QB', 30); mk('RB', 60); mk('WR', 80); mk('TE', 30); mk('DST', 30);
        const t0 = Date.now();
        const lineups = optimizeDkLineups(pool, { count: 3 });
        const ms = Date.now() - t0;
        expect(lineups.length).toBe(3);
        expect(lineups[0].totalSalary).toBeLessThanOrEqual(DK_SALARY_CAP);
        expect(ms).toBeLessThan(3000); // should be well under a few seconds
    });
});
