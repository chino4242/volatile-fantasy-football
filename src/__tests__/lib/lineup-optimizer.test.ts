import { describe, it, expect } from 'vitest';
import { buildSlots, optimizeLineup, optimizeAndDiff, slotEligibility, type OptimizerPlayer } from '@/lib/lineup-optimizer';

const P = (id: string, name: string, pos: string, rank: number | null, isStarter = false, total: number | null = null, posMatchup: number | null = null): OptimizerPlayer =>
    ({ sleeper_id: id, full_name: name, position: pos, rank, total, posMatchup, isStarter });

describe('slotEligibility', () => {
    it('excludes bench/IR/taxi from starting slots', () => {
        expect(slotEligibility('BN')).toBeNull();
        expect(slotEligibility('IR')).toBeNull();
        expect(slotEligibility('TAXI')).toBeNull();
    });
    it('maps flex variants correctly', () => {
        expect([...slotEligibility('FLEX')!].sort()).toEqual(['RB', 'TE', 'WR']);
        expect([...slotEligibility('SUPER_FLEX')!].sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
        expect([...slotEligibility('WR/TE')!].sort()).toEqual(['TE', 'WR']);
    });
});

describe('optimizeLineup', () => {
    const slots = buildSlots(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN']);

    it('builds the correct number of starting slots (bench excluded)', () => {
        expect(slots.length).toBe(8);
    });

    const roster: OptimizerPlayer[] = [
        P('qb1', 'Elite QB', 'QB', 1), P('qb2', 'Backup QB', 'QB', 12),
        P('rb1', 'RB One', 'RB', 3), P('rb2', 'RB Two', 'RB', 8), P('rb3', 'RB Three', 'RB', 40),
        P('wr1', 'WR One', 'WR', 2), P('wr2', 'WR Two', 'WR', 10), P('wr3', 'WR Three', 'WR', 15),
        P('te1', 'TE One', 'TE', 6), P('te2', 'TE Two', 'TE', 50),
    ];
    const optimal = optimizeLineup(roster, slots);
    const at = (slot: string) => optimal.find(a => a.slot === slot)?.player?.sleeper_id;

    it('fills the dedicated QB slot with the best QB', () => expect(at('QB')).toBe('qb1'));
    it('does not let SUPER_FLEX consume the scarce QB before the QB slot is filled', () => {
        const ids = optimal.map(a => a.player?.sleeper_id);
        expect(ids).toContain('qb1');
        expect(ids).toContain('qb2');
    });
    it('fills FLEX with the best remaining non-QB after fixed slots', () => expect(at('FLEX')).toBe('wr3'));
});

describe('tiebreakers', () => {
    it('prefers higher team total when ranks tie', () => {
        const r = [P('a', 'A', 'RB', 5, false, 20, 10), P('b', 'B', 'RB', 5, false, 28, 10)];
        expect(optimizeLineup(r, buildSlots(['RB']))[0].player?.sleeper_id).toBe('b');
    });
    it('sorts unranked players last', () => {
        const r = [P('x', 'Ranked', 'WR', 30), P('y', 'Unranked', 'WR', null)];
        expect(optimizeLineup(r, buildSlots(['WR']))[0].player?.sleeper_id).toBe('x');
    });
});

describe('optimizeAndDiff', () => {
    const slots = buildSlots(['RB', 'BN']);
    it('detects a beneficial swap and computes rank gain', () => {
        const r = [P('good', 'Good RB', 'RB', 3, false), P('bad', 'Bad RB', 'RB', 40, true)];
        const d = optimizeAndDiff(r, slots);
        expect(d.isOptimal).toBe(false);
        expect(d.swaps).toHaveLength(1);
        expect(d.swaps[0].startPlayer.sleeper_id).toBe('good');
        expect(d.swaps[0].benchPlayer?.sleeper_id).toBe('bad');
        expect(d.swaps[0].rankGain).toBe(37);
    });
    it('reports optimal when the best lineup is already started', () => {
        const r = [P('good', 'Good RB', 'RB', 3, true), P('bad', 'Bad RB', 'RB', 40, false)];
        expect(optimizeAndDiff(r, slots).isOptimal).toBe(true);
    });
});
