import { describe, it, expect } from 'vitest';
import { buildSlots, optimizeLineup, optimizeAndDiff, slotEligibility, isGameStarted, type OptimizerPlayer } from '@/lib/lineup-optimizer';

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

describe('optimizeAndDiff — bench + close calls', () => {
    it('returns every non-optimal player on the bench, best-rank first', () => {
        const slots = buildSlots(['RB', 'BN', 'BN']);
        const r = [
            P('rb1', 'Starter', 'RB', 5, true),
            P('rb2', 'Bench A', 'RB', 20, false),
            P('rb3', 'Bench B', 'RB', 9, false),
        ];
        const d = optimizeAndDiff(r, slots);
        // Optimal RB is rb1 (rank 5); the other two are bench, sorted 9 then 20.
        expect(d.bench.map(b => b.player.sleeper_id)).toEqual(['rb3', 'rb2']);
    });

    it('flags a bench player within the close-call threshold of a startable slot', () => {
        const slots = buildSlots(['RB', 'BN']);
        // Starter rank 5; bench rank 7 → gap 2 (<= 5) → close call to RB.
        const r = [P('rb1', 'Starter', 'RB', 5, true), P('rb2', 'Bench', 'RB', 7, false)];
        const d = optimizeAndDiff(r, slots);
        const bench = d.bench.find(b => b.player.sleeper_id === 'rb2')!;
        expect(bench.isCloseCall).toBe(true);
        expect(bench.gapToStart).toBe(2);
        expect(bench.nearestSlot).toBe('RB');
    });

    it('does NOT flag a bench player far below the starter', () => {
        const slots = buildSlots(['RB', 'BN']);
        const r = [P('rb1', 'Starter', 'RB', 5, true), P('rb2', 'Bench', 'RB', 40, false)];
        const d = optimizeAndDiff(r, slots);
        const bench = d.bench.find(b => b.player.sleeper_id === 'rb2')!;
        expect(bench.isCloseCall).toBe(false);
        expect(bench.gapToStart).toBe(35);
    });

    it('computes gap against the eligible slot only (position-aware)', () => {
        // A bench WR is close to the WR starter, not the (ineligible) RB slot.
        const slots = buildSlots(['RB', 'WR', 'BN']);
        const r = [
            P('rb1', 'RB Starter', 'RB', 2, true),
            P('wr1', 'WR Starter', 'WR', 10, true),
            P('wr2', 'WR Bench', 'WR', 12, false),
        ];
        const d = optimizeAndDiff(r, slots);
        const bench = d.bench.find(b => b.player.sleeper_id === 'wr2')!;
        expect(bench.nearestSlot).toBe('WR');
        expect(bench.gapToStart).toBe(2);
        expect(bench.isCloseCall).toBe(true);
    });

    it('marks an unranked bench player with no gap and not a close call', () => {
        const slots = buildSlots(['RB', 'BN']);
        const r = [P('rb1', 'Starter', 'RB', 5, true), P('rb2', 'Unranked', 'RB', null, false)];
        const d = optimizeAndDiff(r, slots);
        const bench = d.bench.find(b => b.player.sleeper_id === 'rb2')!;
        expect(bench.gapToStart).toBeNull();
        expect(bench.isCloseCall).toBe(false);
    });

    it('never flags a LOCKED bench player as a close call', () => {
        const slots = buildSlots(['RB', 'BN']);
        const r = [
            P('rb1', 'Starter', 'RB', 5, true),
            { ...P('rb2', 'Locked Bench', 'RB', 6, false), locked: true },
        ];
        const d = optimizeAndDiff(r, slots);
        const bench = d.bench.find(b => b.player.sleeper_id === 'rb2')!;
        expect(bench.isCloseCall).toBe(false); // locked → can't be played this week
    });
});

describe('optimizeAndDiff — locked (already-played) players', () => {
    const slots = buildSlots(['RB', 'BN']);

    it('never suggests benching a LOCKED starter, even if a better bench player exists', () => {
        // Locked starter already played; a higher-ranked bench RB is available,
        // but we cannot un-play the locked starter → no swap.
        const r = [
            { ...P('locked_start', 'Locked Starter', 'RB', 40, true), locked: true },
            P('better_bench', 'Better Bench', 'RB', 3, false),
        ];
        const d = optimizeAndDiff(r, slots);
        expect(d.isOptimal).toBe(true);
        expect(d.swaps).toHaveLength(0);
        // The locked starter keeps the RB slot.
        expect(d.optimal.find(a => a.slot === 'RB')?.player?.sleeper_id).toBe('locked_start');
    });

    it('never suggests starting a LOCKED bench player', () => {
        // Locked bench player is higher-ranked but already played → cannot add.
        const r = [
            { ...P('locked_bench', 'Locked Bench', 'RB', 2, false), locked: true },
            P('current_start', 'Current Starter', 'RB', 30, true),
        ];
        const d = optimizeAndDiff(r, slots);
        expect(d.isOptimal).toBe(true);
        expect(d.swaps).toHaveLength(0);
        expect(d.optimal.find(a => a.slot === 'RB')?.player?.sleeper_id).toBe('current_start');
    });

    it('still optimizes among NOT-locked players around a locked starter', () => {
        // Two RB slots. One locked starter holds a slot; the other slot should
        // pick the best non-locked player (a swap for the second slot).
        const twoRb = buildSlots(['RB', 'RB', 'BN']);
        const r = [
            { ...P('locked_start', 'Locked Starter', 'RB', 25, true), locked: true },
            P('bad_start', 'Bad Starter', 'RB', 50, true),
            P('good_bench', 'Good Bench', 'RB', 5, false),
        ];
        const d = optimizeAndDiff(r, twoRb);
        // good_bench should replace bad_start in the second RB slot.
        expect(d.swaps).toHaveLength(1);
        expect(d.swaps[0].startPlayer.sleeper_id).toBe('good_bench');
        expect(d.swaps[0].benchPlayer?.sleeper_id).toBe('bad_start');
        // The locked starter is untouched.
        const ids = d.optimal.map(a => a.player?.sleeper_id);
        expect(ids).toContain('locked_start');
    });
});

describe('isGameStarted', () => {
    it('is true only when the player team is in the started set (case-insensitive)', () => {
        const started = new Set(['DET', 'GB']);
        expect(isGameStarted('DET', started)).toBe(true);
        expect(isGameStarted('det', started)).toBe(true);
        expect(isGameStarted('SF', started)).toBe(false);
    });

    it('fails open: no started set, empty set, or no team means not started', () => {
        expect(isGameStarted('DET', undefined)).toBe(false);
        expect(isGameStarted('DET', new Set())).toBe(false);
        expect(isGameStarted(null, new Set(['DET']))).toBe(false);
        expect(isGameStarted(undefined, new Set(['DET']))).toBe(false);
    });
});

describe('team-page lineup with started games (Thanksgiving-style week)', () => {
    // Slots: QB, 2 RB, 2 WR, TE, FLEX. Games that already kicked off: DET, GB, DAL.
    const slots = buildSlots(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN']);
    const started = new Set(['DET', 'GB', 'DAL']);
    const mk = (id: string, name: string, pos: string, team: string, rank: number, isStarter: boolean): OptimizerPlayer =>
        ({ ...P(id, name, pos, rank, isStarter), locked: isGameStarted(team, started) });

    const roster = [
        mk('goff', 'Jared Goff', 'QB', 'DET', 20, true),       // played, started
        mk('purdy', 'Brock Purdy', 'QB', 'SF', 5, false),      // would be "better", but Goff already played
        mk('rb1', 'RB One', 'RB', 'MIA', 3, true),
        mk('rb2', 'Emmett Johnson', 'RB', 'GB', 30, true),     // played, started
        mk('rb3', 'Ashton Jeanty', 'RB', 'LV', 19, false),
        mk('wr1', 'WR One', 'WR', 'MIA', 2, true),
        mk('wr2', 'WR Two', 'WR', 'SEA', 10, true),
        mk('te1', 'Colston Loveland', 'TE', 'DAL', 50, true),  // played, started
        mk('te2', 'George Kittle', 'TE', 'SF', 34, false),
        mk('wr3', 'Javonte Williams', 'RB', 'DAL', 60, true),  // FLEX, played, started
        mk('wr4', 'Emeka Egbuka', 'WR', 'TB', 55, false),
    ];

    it('never suggests benching a player whose game has already been played', () => {
        const d = optimizeAndDiff(roster, slots);
        const benched = d.swaps.map(s => s.benchPlayer?.sleeper_id);
        for (const id of ['goff', 'rb2', 'te1', 'wr3']) expect(benched).not.toContain(id);
    });

    it('never suggests starting a locked bench player', () => {
        const withLockedBench = [...roster, mk('qb_locked', 'Locked QB', 'QB', 'GB', 1, false)];
        const d = optimizeAndDiff(withLockedBench, slots);
        expect(d.swaps.map(s => s.startPlayer.sleeper_id)).not.toContain('qb_locked');
    });

    it('still suggests swaps among players whose games have NOT started', () => {
        // Same roster but nobody locked: Purdy should replace Goff, Kittle should replace Loveland.
        const unlocked = roster.map(p => ({ ...p, locked: false }));
        const d = optimizeAndDiff(unlocked, slots);
        const starts = d.swaps.map(s => s.startPlayer.sleeper_id);
        expect(starts).toContain('purdy');
        expect(starts).toContain('te2');
    });

    it('with locks applied, those same swaps disappear', () => {
        const d = optimizeAndDiff(roster, slots);
        const starts = d.swaps.map(s => s.startPlayer.sleeper_id);
        expect(starts).not.toContain('purdy'); // QB slot is held by played Goff
        expect(starts).not.toContain('te2');   // TE slot is held by played Loveland
    });
});
