import { describe, it, expect } from 'vitest';
import { proposeAcquire, proposeShed, positionalImpact, startableSlotsByPosition, type TradePlayer } from '@/lib/targeted-trade';

const P = (id: string, name: string, pos: string, marketValue: number, extra: Partial<TradePlayer> = {}): TradePlayer =>
    ({ sleeper_id: id, full_name: name, position: pos, marketValue, age: 25, ...extra });

describe('proposeAcquire', () => {
    it('proposes a fair 1-for-1 when a close-value asset exists', () => {
        const target = P('t', 'Target WR', 'WR', 5000);
        const myRoster = [P('a', 'My RB1', 'RB', 5200), P('b', 'My WR3', 'WR', 1200), P('c', 'My RB2', 'RB', 4800)];
        const opp = [target, P('o2', 'Opp RB', 'RB', 3000)];
        const r = proposeAcquire(target, myRoster, opp);
        expect(r.proposal).not.toBeNull();
        // closest to 5000 is My RB1 (5200) or My RB2 (4800); both within 15%.
        expect(['a', 'c']).toContain(r.proposal!.iSend.sleeper_id);
        expect(r.proposal!.iReceive.sleeper_id).toBe('t');
        expect(r.advisor).not.toBeNull();
    });

    it('returns no proposal (needs a package) when nothing is within tolerance', () => {
        const target = P('t', 'Elite', 'WR', 8000);
        const myRoster = [P('a', 'Scrub', 'RB', 1000), P('b', 'Scrub2', 'WR', 900)];
        const r = proposeAcquire(target, myRoster, [target]);
        expect(r.proposal).toBeNull();
        expect(r.reason).toMatch(/package|underpay|overpay/i);
    });

    it('prefers trading from my surplus into their need on value ties', () => {
        const target = P('t', 'Target QB', 'QB', 4000);
        // Two equal-value sends: an RB (I have surplus) and a WR. Opp needs RB.
        const myRoster = [
            P('rb1', 'RB surplus', 'RB', 4000), P('rb2', 'RB2', 'RB', 3500), P('rb3', 'RB3', 'RB', 3200), P('rb4', 'RB4', 'RB', 3000), P('rb5', 'RB5', 'RB', 2800),
            P('wr1', 'WR equal', 'WR', 4000),
            target,
        ];
        const opp = [target, P('owr', 'Opp WR', 'WR', 3000)]; // opp thin at RB
        const r = proposeAcquire(target, myRoster, opp);
        expect(r.proposal!.iSend.position).toBe('RB'); // surplus + their need wins the tie
    });

    it('flags that RoS is not yet considered', () => {
        const target = P('t', 'T', 'WR', 5000);
        const r = proposeAcquire(target, [P('a', 'A', 'WR', 5000)], [target]);
        expect(r.rosConsidered).toBe(false);
    });
});

describe('proposeShed', () => {
    it('finds a fair return for a sell player', () => {
        const mine = P('m', 'My sell', 'WR', 4000);
        const myRoster = [mine, P('x', 'Keep', 'RB', 5000)];
        const opp = [P('o', 'Opp back', 'RB', 4100), P('o2', 'Opp scrub', 'TE', 500)];
        const r = proposeShed(mine, myRoster, opp);
        expect(r.proposal).not.toBeNull();
        expect(r.proposal!.iSend.sleeper_id).toBe('m');
        expect(r.proposal!.iReceive.sleeper_id).toBe('o');
    });

    it('suggests a drop when no fair return exists', () => {
        const mine = P('m', 'Low value', 'WR', 400);
        const r = proposeShed(mine, [mine], [P('o', 'Stud', 'RB', 6000)]);
        expect(r.proposal).toBeNull();
        expect(r.reason).toMatch(/package|partner|drop/i);
    });
});


describe('startableSlotsByPosition', () => {
    it('falls back to ideal minimums when slot config is unknown', () => {
        const s = startableSlotsByPosition(null);
        expect(s).toEqual({ QB: 1, RB: 3, WR: 4, TE: 1 });
    });

    it('counts dedicated slots and splits a FLEX across RB/WR/TE', () => {
        // 1QB, 2RB, 2WR, 1TE, 1FLEX(RB/WR/TE)
        const s = startableSlotsByPosition(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN']);
        expect(s.QB).toBe(1);
        // RB: 2 dedicated + 1/3 flex → ceil(2.33) = 3
        expect(s.RB).toBe(3);
        // WR: 2 dedicated + 1/3 flex → ceil(2.33) = 3
        expect(s.WR).toBe(3);
        // TE: 1 dedicated + 1/3 flex → ceil(1.33) = 2
        expect(s.TE).toBe(2);
    });

    it('gives QB two startable slots in superflex', () => {
        const s = startableSlotsByPosition(['QB', 'SUPER_FLEX', 'RB', 'RB', 'WR', 'WR', 'TE']);
        expect(s.QB).toBe(2); // 1 dedicated + 1/4 SF rounds up
    });
});

describe('positionalImpact', () => {
    const roster: TradePlayer[] = [
        P('rb1', 'RB1', 'RB', 5000), P('rb2', 'RB2', 'RB', 4000), P('rb3', 'RB3', 'RB', 1500),
        P('wr1', 'WR1', 'WR', 4500), P('wr2', 'WR2', 'WR', 3000),
        P('te1', 'TE1', 'TE', 2000),
    ];
    const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];

    it('reports both affected positions with before→after counts', () => {
        // Send RB1 (RB), receive a WR → RB room shrinks, WR room grows.
        const incoming = P('inWR', 'New WR', 'WR', 4800);
        const impact = positionalImpact(roster, roster[0], incoming, slots);
        const rb = impact.find(i => i.position === 'RB')!;
        const wr = impact.find(i => i.position === 'WR')!;
        expect(rb.before.count).toBe(3);
        expect(rb.after.count).toBe(2);
        expect(wr.before.count).toBe(2);
        expect(wr.after.count).toBe(3);
    });

    it('flags thinsBelowStarters when a trade drops a group below its startable slots', () => {
        // Thin RB roster: only 2 RBs but slots want 3 (2 RB + flex share).
        const thin: TradePlayer[] = [P('rb1', 'RB1', 'RB', 5000), P('rb2', 'RB2', 'RB', 4000), P('wr1', 'WR1', 'WR', 4500)];
        const incoming = P('inWR', 'New WR', 'WR', 4900);
        const impact = positionalImpact(thin, thin[0], incoming, slots);
        const rb = impact.find(i => i.position === 'RB')!;
        expect(rb.after.count).toBe(1);
        expect(rb.thinsBelowStarters).toBe(true);
    });

    it('reports a single position when send and receive share it', () => {
        const incoming = P('inRB', 'New RB', 'RB', 4600);
        const impact = positionalImpact(roster, roster[0], incoming, slots);
        expect(impact).toHaveLength(1);
        expect(impact[0].position).toBe('RB');
        expect(impact[0].after.count).toBe(3); // count unchanged (RB out, RB in)
    });
});

describe('proposeAcquire / proposeShed positionalImpact wiring', () => {
    it('attaches positionalImpact to a successful acquire proposal', () => {
        const target = P('t', 'Target WR', 'WR', 5000);
        const myRoster = [P('a', 'My RB1', 'RB', 5100), P('b', 'My WR3', 'WR', 1200)];
        const r = proposeAcquire(target, myRoster, [target], 0.15, ['QB', 'RB', 'RB', 'WR', 'WR', 'FLEX']);
        expect(r.proposal).not.toBeNull();
        expect(r.positionalImpact).not.toBeNull();
        expect(r.positionalImpact!.some(i => i.position === 'RB')).toBe(true);
        expect(r.positionalImpact!.some(i => i.position === 'WR')).toBe(true);
    });

    it('leaves positionalImpact null when no fair proposal exists', () => {
        const target = P('t', 'Elite', 'WR', 8000);
        const r = proposeAcquire(target, [P('a', 'Scrub', 'RB', 1000)], [target]);
        expect(r.proposal).toBeNull();
        expect(r.positionalImpact).toBeNull();
    });
});
