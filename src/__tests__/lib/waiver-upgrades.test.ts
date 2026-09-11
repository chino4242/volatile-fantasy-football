import { describe, it, expect } from 'vitest';
import { findWaiverUpgrades, isBadgeWorthy } from '@/lib/waiver-upgrades';
import type { PortfolioPlayer, PortfolioTeam } from '@/lib/portfolio';

// Minimal PortfolioPlayer factory.
function P(overrides: Partial<PortfolioPlayer> & { sleeper_id: string; position: string }): PortfolioPlayer {
    return {
        sleeper_id: overrides.sleeper_id,
        full_name: overrides.full_name ?? overrides.sleeper_id,
        position: overrides.position,
        team: overrides.team ?? 'FA',
        age: null,
        myRank: null,
        myPosRank: null,
        marketRank: null,
        marketValue: overrides.marketValue ?? 0,
        is_starter: overrides.is_starter ?? false,
        weeklyRank: overrides.weeklyRank ?? null,
        weeklyTotal: overrides.weeklyTotal ?? null,
        weeklyPosMatchup: overrides.weeklyPosMatchup ?? null,
    };
}

function team(players: PortfolioPlayer[]): PortfolioTeam {
    return { rosterId: '1', ownerName: 'Me', players };
}

// A simple 1-WR + 1-BN league (so a full roster forces a drop decision).
const WR_BN = ['WR', 'BN'];
// A QB/RB/WR/TE/FLEX/BN starting config for eligibility tests.
const FULL = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN'];

describe('findWaiverUpgrades', () => {
    it('flags a free agent who out-ranks a roster player this week (swap, safe drop)', () => {
        const roster = team([
            P({ sleeper_id: 'starter_wr', position: 'WR', weeklyRank: 30, is_starter: true, marketValue: 500 }),
            P({ sleeper_id: 'bench_wr', position: 'WR', weeklyRank: 80, marketValue: 100 }),
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 12, marketValue: 200 })];
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', { coreCapacity: 2 });
        expect(ups).toHaveLength(1);
        expect(ups[0].add.sleeper_id).toBe('fa_wr');
        expect(ups[0].type).toBe('swap');
        expect(ups[0].tier).toBe('safe');
        expect(ups[0].informational).toBe(false);
        expect(ups[0].cracksLineup).toBe(true); // beats the WR starter
        // Prefers dropping the non-starter bench WR (lowest value non-starter).
        expect(ups[0].drop?.sleeper_id).toBe('bench_wr');
    });

    it('does not flag a free agent who out-ranks no one at an eligible slot', () => {
        const roster = team([P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 5, is_starter: true, marketValue: 500 })]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 50, marketValue: 100 })];
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', { coreCapacity: 2 });
        expect(ups).toHaveLength(0);
    });

    it('is position-aware: a WR free agent is not compared against a QB', () => {
        const roster = team([
            P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 40, is_starter: true, marketValue: 500 }),
        ]);
        // FA WR out-ranks the QB numerically, but WR can't fill a QB slot.
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 10, marketValue: 100 })];
        const ups = findWaiverUpgrades(roster, fas, ['QB', 'BN'], 'redraft', { coreCapacity: 2 });
        expect(ups).toHaveLength(0);
    });

    it('pure ADD (no drop) when there is an open roster spot — the bye-week case', () => {
        const roster = team([
            P({ sleeper_id: 'wr_bye', position: 'WR', weeklyRank: null, is_starter: true, marketValue: 6000 }), // stud on bye (no weekly rank)
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 25, marketValue: 100 })];
        // capacity 2, roster has 1 → one open spot.
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', { coreCapacity: 2 });
        expect(ups).toHaveLength(1);
        expect(ups[0].type).toBe('add');
        expect(ups[0].drop).toBeNull();
        expect(ups[0].tier).toBe('safe');
        expect(isBadgeWorthy(ups[0])).toBe(true);
    });

    it('classifies a valuable drop as CAUTION (still shown, flagged)', () => {
        const roster = team([
            P({ sleeper_id: 'valuable_wr', position: 'WR', weeklyRank: 35, is_starter: true, marketValue: 2000 }), // meaningful asset
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 15, marketValue: 100 })];
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', {
            coreCapacity: 1, cautionAtValue: 1500, blockAtValue: 4000,
        });
        expect(ups).toHaveLength(1);
        expect(ups[0].type).toBe('swap');
        expect(ups[0].tier).toBe('caution');
        expect(ups[0].informational).toBe(false);
        expect(isBadgeWorthy(ups[0])).toBe(false); // caution never counts toward badge
    });

    it('emits an INFORMATIONAL item when the only legal drop is a blocked asset', () => {
        const roster = team([
            P({ sleeper_id: 'stud_wr', position: 'WR', weeklyRank: 40, is_starter: true, marketValue: 8000 }), // major asset
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 18, marketValue: 100 })];
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', {
            coreCapacity: 1, blockAtValue: 4000,
        });
        expect(ups).toHaveLength(1);
        expect(ups[0].informational).toBe(true);
        expect(ups[0].tier).toBe('block');
        expect(isBadgeWorthy(ups[0])).toBe(false);
    });

    it('sorts lineup-crackers and safe items above bench-only / caution items', () => {
        const roster = team([
            P({ sleeper_id: 'wr_start', position: 'WR', weeklyRank: 20, is_starter: true, marketValue: 300 }),
            P({ sleeper_id: 'wr_bench', position: 'WR', weeklyRank: 90, marketValue: 80 }),
            P({ sleeper_id: 'te_start', position: 'TE', weeklyRank: 15, is_starter: true, marketValue: 2500 }),
        ]);
        const fas = [
            // Cracks lineup at WR (beats the WR starter) — should sort first.
            P({ sleeper_id: 'fa_wr_good', position: 'WR', weeklyRank: 8, marketValue: 100 }),
            // Only beats the bench WR — lower priority.
            P({ sleeper_id: 'fa_wr_meh', position: 'WR', weeklyRank: 85, marketValue: 50 }),
        ];
        const ups = findWaiverUpgrades(roster, fas, FULL, 'redraft', { coreCapacity: 3 });
        // Open spot? capacity 3, roster 3 → full → swaps.
        expect(ups[0].add.sleeper_id).toBe('fa_wr_good');
        expect(ups[0].cracksLineup).toBe(true);
    });

    it('respects an injected long-term value lens (redraft ROS placeholder)', () => {
        const roster = team([
            P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 30, is_starter: true, marketValue: 100 }),
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 10, marketValue: 100 })];
        // Inject a lens that treats wr1 as extremely valuable → block.
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', {
            coreCapacity: 1,
            longTermValueOf: (p) => (p.sleeper_id === 'wr1' ? 9999 : 0),
            blockAtValue: 4000,
        });
        expect(ups[0].informational).toBe(true); // blocked by the injected lens
    });

    it('suppresses a free agent whose NFL game has already kicked off', () => {
        const roster = team([
            P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 40, is_starter: true, marketValue: 100, team: 'DAL' }),
        ]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 10, marketValue: 100, team: 'PHI' })];
        // PHI's game already started → the FA can't help this week.
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', {
            coreCapacity: 2, startedTeams: new Set(['PHI']),
        });
        expect(ups).toHaveLength(0);
        // Same FA, game not yet started → surfaces normally.
        const ups2 = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', {
            coreCapacity: 2, startedTeams: new Set(['BUF']),
        });
        expect(ups2).toHaveLength(1);
    });

    it('returns nothing when the league has no slot config', () => {
        const roster = team([P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 30, is_starter: true })]);
        const fas = [P({ sleeper_id: 'fa_wr', position: 'WR', weeklyRank: 10 })];
        expect(findWaiverUpgrades(roster, fas, null, 'redraft', {})).toEqual([]);
        expect(findWaiverUpgrades(roster, fas, [], 'redraft', {})).toEqual([]);
    });

    it('ignores free agents with no weekly rank (can not help this week)', () => {
        const roster = team([P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 30, is_starter: true, marketValue: 100 })]);
        const fas = [P({ sleeper_id: 'fa_unranked', position: 'WR', weeklyRank: null, marketValue: 5000 })];
        const ups = findWaiverUpgrades(roster, fas, WR_BN, 'redraft', { coreCapacity: 2 });
        expect(ups).toHaveLength(0);
    });
});
