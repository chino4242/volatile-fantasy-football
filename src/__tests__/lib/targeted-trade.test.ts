import { describe, it, expect } from 'vitest';
import { proposeAcquire, proposeShed, type TradePlayer } from '@/lib/targeted-trade';

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
