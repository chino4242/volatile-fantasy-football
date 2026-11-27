import { describe, it, expect } from 'vitest';
import { computeSlotGaps, gapSummary, dedupeById, kickerCandidates, defenseCandidates, GAP_THRESHOLDS, type SlotGap } from '@/lib/slot-gaps';
import { findWaiverUpgrades, type WaiverUpgrade } from '@/lib/waiver-upgrades';
import type { PortfolioPlayer } from '@/lib/portfolio';

function P(o: Partial<PortfolioPlayer> & { sleeper_id: string; position: string }): PortfolioPlayer {
    return {
        sleeper_id: o.sleeper_id,
        full_name: o.full_name ?? o.sleeper_id,
        position: o.position,
        team: o.team ?? 'XXX',
        age: null,
        myRank: null,
        myPosRank: null,
        marketRank: null,
        marketValue: o.marketValue ?? 0,
        is_starter: o.is_starter ?? false,
        weeklyRank: o.weeklyRank ?? null,
        weeklyTotal: null,
        weeklyPosMatchup: null,
        rosRank: o.rosRank ?? null,
        rosPosRank: o.rosPosRank ?? null,
        rosPpg: o.rosPpg ?? null,
    };
}

const bySlot = (gaps: SlotGap[], slot: string, i = 0) => gaps.filter(g => g.slot === slot)[i];

describe('computeSlotGaps: weekly horizon', () => {
    const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'BN'];

    it('returns one SlotGap per starting slot, in order, skipping bench', () => {
        const gaps = computeSlotGaps({ roster: [], freeAgents: [], rosterPositions: slots });
        expect(gaps.map(g => g.slot)).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K']);
    });

    it('includes DEF slots (Story 3.2)', () => {
        const gaps = computeSlotGaps({ roster: [], freeAgents: [], rosterPositions: ['QB', 'DEF', 'BN'] });
        expect(gaps.map(g => g.slot)).toEqual(['QB', 'DEF']);
    });

    it('compares a kicker to the best available kicker in the k pool', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 20, full_name: 'My K' })];
        const fas = [
            P({ sleeper_id: 'k1', position: 'K', weeklyRank: 4, full_name: 'Best K' }),
            P({ sleeper_id: 'k2', position: 'K', weeklyRank: 9 }),
        ];
        const g = bySlot(computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'] }), 'K');
        expect(g.myPlayer?.sleeper_id).toBe('myk');
        expect(g.weekly.pool).toBe('k');
        expect(g.weekly.myRank).toBe(20);
        expect(g.weekly.best?.player.sleeper_id).toBe('k1');
        expect(g.weekly.best?.rank).toBe(4);
        expect(g.weekly.gap).toBe(16);
        expect(g.weekly.status).toBe('actionable');
    });

    it('reports "none" when my kicker beats every free agent (the "no action" case)', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5 })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 12 })];
        const g = bySlot(computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'] }), 'K');
        expect(g.weekly.status).toBe('none');
        expect(g.weekly.gap).toBe(-7);
        expect(g.weekly.best?.rank).toBe(12);
        expect(g.status).toBe('none');
    });

    it('threshold boundary: gap equal to threshold is minor, threshold + 1 is actionable', () => {
        const t = GAP_THRESHOLDS.weekly.k;
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 10 })];
        const mk = (rank: number) => [P({ sleeper_id: 'k1', position: 'K', weeklyRank: rank })];
        const eq = computeSlotGaps({ roster, freeAgents: mk(10 - t), rosterPositions: ['K'] })[0];
        const over = computeSlotGaps({ roster, freeAgents: mk(10 - t - 1), rosterPositions: ['K'] })[0];
        const zero = computeSlotGaps({ roster, freeAgents: mk(10), rosterPositions: ['K'] })[0];
        expect(eq.weekly.status).toBe('minor');
        expect(over.weekly.status).toBe('actionable');
        expect(zero.weekly.status).toBe('none');
    });

    it('uses the optimal-lineup assignment for "my player at the slot"', () => {
        // Two WRs, one WR slot: the better-ranked WR holds the slot even if not flagged starter.
        const roster = [
            P({ sleeper_id: 'wr_bad', position: 'WR', weeklyRank: 60, is_starter: true }),
            P({ sleeper_id: 'wr_good', position: 'WR', weeklyRank: 10, is_starter: false }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: [], rosterPositions: ['WR'] })[0];
        expect(g.myPlayer?.sleeper_id).toBe('wr_good');
    });

    it('flex slot compares within the flex pool across RB/WR/TE free agents', () => {
        const roster = [
            P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 30 }),
        ];
        const fas = [
            P({ sleeper_id: 'te_fa', position: 'TE', weeklyRank: 12 }),
            P({ sleeper_id: 'wr_fa', position: 'WR', weeklyRank: 40 }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['FLEX'] })[0];
        expect(g.weekly.pool).toBe('flex');
        expect(g.weekly.best?.player.sleeper_id).toBe('te_fa');
        expect(g.weekly.gap).toBe(18);
    });

    it('does not compare a QB free agent to a flex rank in a SUPERFLEX slot', () => {
        const roster = [P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 20 })];
        // QB FA has a "great" rank number but lives in a different pool.
        const fas = [P({ sleeper_id: 'qb_fa', position: 'QB', weeklyRank: 1 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['SUPER_FLEX'] })[0];
        expect(g.weekly.pool).toBe('flex');
        expect(g.weekly.best).toBeNull();
        expect(g.weekly.status).toBe('none');
    });

    it('a QB in a SUPERFLEX slot compares only against QB free agents', () => {
        const roster = [P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 15 })];
        const fas = [
            P({ sleeper_id: 'wr_fa', position: 'WR', weeklyRank: 2 }),
            P({ sleeper_id: 'qb_fa', position: 'QB', weeklyRank: 3 }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['SUPER_FLEX'] })[0];
        expect(g.weekly.pool).toBe('qb');
        expect(g.weekly.best?.player.sleeper_id).toBe('qb_fa');
        expect(g.weekly.gap).toBe(12);
    });

    it('excludes free agents whose game has started from the weekly horizon only', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 40, team: 'AAA', rosPosRank: 30 })];
        const fas = [
            P({ sleeper_id: 'rb_started', position: 'RB', weeklyRank: 1, team: 'BBB', rosPosRank: 2 }),
            P({ sleeper_id: 'rb_ok', position: 'RB', weeklyRank: 25, team: 'CCC', rosPosRank: 20 }),
        ];
        const g = computeSlotGaps({
            roster, freeAgents: fas, rosterPositions: ['RB'], startedTeams: new Set(['BBB']),
        })[0];
        expect(g.weekly.best?.player.sleeper_id).toBe('rb_ok');
        // ROS is never gated: the started-team RB is still the best ROS free agent.
        expect(g.ros.best?.player.sleeper_id).toBe('rb_started');
    });

    it('a locked slot player reports weekly unavailable + locked, but ROS still computes', () => {
        // A played player is a current starter (the optimizer only reserves a slot for locked starters).
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 40, team: 'AAA', rosPosRank: 30, is_starter: true })];
        const fas = [P({ sleeper_id: 'rb_fa', position: 'RB', weeklyRank: 5, team: 'CCC', rosPosRank: 5 })];
        const g = computeSlotGaps({
            roster, freeAgents: fas, rosterPositions: ['RB'], startedTeams: new Set(['AAA']),
        })[0];
        expect(g.weekly.status).toBe('unavailable');
        expect(g.weekly.locked).toBe(true);
        expect(g.ros.status).toBe('actionable');
    });

    it('empty slot is actionable when an eligible ranked free agent exists', () => {
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 8 })];
        const g = computeSlotGaps({ roster: [], freeAgents: fas, rosterPositions: ['K'] })[0];
        expect(g.myPlayer).toBeNull();
        expect(g.weekly.myRank).toBeNull();
        expect(g.weekly.status).toBe('actionable');
        expect(g.status).toBe('actionable');
    });

    it('unranked-mine: my player has no weekly rank but a ranked free agent exists', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: null })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 7 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'] })[0];
        expect(g.weekly.status).toBe('unranked-mine');
        expect(g.weekly.best?.rank).toBe(7);
        expect(g.status).toBe('unranked-mine');
    });

    it('no ranked free agents: none, best is null', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 7 })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: null })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'] })[0];
        expect(g.weekly.status).toBe('none');
        expect(g.weekly.best).toBeNull();
    });

    it('no weekly data at all: weekly unavailable', () => {
        const roster = [P({ sleeper_id: 'qb1', position: 'QB' })];
        const fas = [P({ sleeper_id: 'qb2', position: 'QB' })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['QB'] })[0];
        expect(g.weekly.status).toBe('unavailable');
    });
});

describe('computeSlotGaps: ROS horizon', () => {
    it('compares same position only, even in a FLEX slot', () => {
        const roster = [P({ sleeper_id: 'wr1', position: 'WR', rosPosRank: 30, rosRank: 80 })];
        const fas = [
            P({ sleeper_id: 'te_fa', position: 'TE', rosPosRank: 1 }),
            P({ sleeper_id: 'wr_fa', position: 'WR', rosPosRank: 10, rosRank: 25 }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['FLEX'] })[0];
        expect(g.ros.best?.player.sleeper_id).toBe('wr_fa');
        expect(g.ros.gap).toBe(20);
        expect(g.ros.status).toBe('actionable');
    });

    it('ROS threshold boundary per position', () => {
        const t = GAP_THRESHOLDS.ros.RB;
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', rosPosRank: 20 })];
        const mk = (r: number) => [P({ sleeper_id: 'f', position: 'RB', rosPosRank: r })];
        expect(computeSlotGaps({ roster, freeAgents: mk(20 - t), rosterPositions: ['RB'] })[0].ros.status).toBe('minor');
        expect(computeSlotGaps({ roster, freeAgents: mk(20 - t - 1), rosterPositions: ['RB'] })[0].ros.status).toBe('actionable');
    });

    it('weekly and ROS can name different best players', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 50, rosPosRank: 40 })];
        const fas = [
            P({ sleeper_id: 'weekly_best', position: 'RB', weeklyRank: 10, rosPosRank: 35 }),
            P({ sleeper_id: 'ros_best', position: 'RB', weeklyRank: 45, rosPosRank: 8 }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'] })[0];
        expect(g.weekly.best?.player.sleeper_id).toBe('weekly_best');
        expect(g.ros.best?.player.sleeper_id).toBe('ros_best');
    });

    it('K has no ROS horizon (unavailable, not applicable)', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5 })];
        const g = computeSlotGaps({ roster, freeAgents: [], rosterPositions: ['K'] })[0];
        expect(g.ros.status).toBe('unavailable');
    });

    it('no ROS data for the position: unavailable, no "unranked" status', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB' })];
        const fas = [P({ sleeper_id: 'f', position: 'RB' })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'] })[0];
        expect(g.ros.status).toBe('unavailable');
    });

    it('unranked-mine on ROS when I have no rank but a free agent does (horizon keeps the info)', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB' })];
        const fas = [P({ sleeper_id: 'f', position: 'RB', rosPosRank: 12 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'] })[0];
        expect(g.ros.status).toBe('unranked-mine');
        expect(g.ros.best?.rank).toBe(12);
    });

    it('a missing ROS rank is QUIET: it does not make the slot "worth a move" (injured / off the sheet)', () => {
        // Weekly is fine; ROS is unranked for my player (e.g. season-ending injury) while a free agent is ranked.
        const roster = [P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 10 })];
        const fas = [P({ sleeper_id: 'f', position: 'WR', weeklyRank: 40, rosPosRank: 12 })];
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['WR'] });
        expect(gaps[0].ros.status).toBe('unranked-mine');
        expect(gaps[0].status).toBe('none');
        expect(gaps[0].move).toBeNull();
        expect(gapSummary(gaps).worthAMove).toBe(0);
        expect(gapSummary(gaps).fine).toBe(1);
    });

    it('a missing WEEKLY rank still counts as worth a move', () => {
        const roster = [P({ sleeper_id: 'wr1', position: 'WR' })];
        const fas = [P({ sleeper_id: 'f', position: 'WR', weeklyRank: 20 })];
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['WR'] });
        expect(gaps[0].weekly.status).toBe('unranked-mine');
        expect(gaps[0].status).toBe('unranked-mine');
        expect(gapSummary(gaps).worthAMove).toBe(1);
    });
});

describe('computeSlotGaps: recommended moves', () => {
    const POS = ['K', 'BN'];
    const run = (roster: PortfolioPlayer[], fas: PortfolioPlayer[], opts: { coreCapacity?: number } = {}) => {
        const upgrades = findWaiverUpgrades(
            { rosterId: 'me', ownerName: 'me', players: roster }, fas, POS, 'redraft',
            { coreCapacity: opts.coreCapacity ?? 2, actualCoreCount: roster.length },
        );
        return computeSlotGaps({ roster, freeAgents: fas, rosterPositions: POS, upgrades });
    };

    it('attaches a swap with a guarded drop for an actionable slot', () => {
        const roster = [
            P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, is_starter: true, marketValue: 0 }),
        ];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3 })];
        const g = run(roster, fas, { coreCapacity: 1 })[0];
        expect(g.weekly.status).toBe('actionable');
        expect(g.move?.add.sleeper_id).toBe('k1');
        expect(g.move?.drop?.sleeper_id).toBe('myk');
        expect(g.move?.type).toBe('swap');
        expect(g.move?.informational).toBe(false);
    });

    it('open roster spot yields a pure add', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, is_starter: true })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3 })];
        const g = run(roster, fas, { coreCapacity: 2 })[0];
        expect(g.move?.type).toBe('add');
        expect(g.move?.drop).toBeNull();
    });

    it('block-tier-only drop is surfaced as informational with no actionable drop', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, is_starter: true, marketValue: 9999 })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3 })];
        const g = run(roster, fas, { coreCapacity: 1 })[0];
        expect(g.move?.informational).toBe(true);
        expect(g.move?.tier).toBe('block');
    });

    it('no move for slots that are not actionable', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5, is_starter: true })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 12 })];
        expect(run(roster, fas)[0].move).toBeNull();
    });

    it('ROS-only actionable slot suggests the add without inventing a drop', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', rosPosRank: 40 })];
        const fas = [P({ sleeper_id: 'f', position: 'RB', rosPosRank: 5 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'], upgrades: [] })[0];
        expect(g.ros.status).toBe('actionable');
        expect(g.move?.add.sleeper_id).toBe('f');
        expect(g.move?.drop).toBeNull();
        expect(g.move?.note).toMatch(/bench/i);
    });

    it('a free agent is attached as the recommended add to only one slot', () => {
        // Two flex-eligible slots (WR + FLEX) both see the same best free agent.
        const roster = [
            P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 60 }),
            P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 90 }),
        ];
        const fas = [P({ sleeper_id: 'star', position: 'WR', weeklyRank: 5 })];
        const upgrade: WaiverUpgrade = {
            add: fas[0], drop: roster[1], type: 'swap', tier: 'safe', informational: false,
            cracksLineup: true, weeklyRankGain: 85, comparedTo: roster[1], pool: 'flex',
            addWeeklyRank: 5, dropWeeklyRank: 90, valueSurrendered: 0,
        };
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['WR', 'FLEX'], upgrades: [upgrade] });
        const withMove = gaps.filter(g => g.move?.add.sleeper_id === 'star');
        expect(withMove).toHaveLength(1);
        // Attached to the slot with the largest gap (the one holding the worst player).
        expect(withMove[0].weekly.gap).toBeGreaterThanOrEqual(Math.max(...gaps.map(g => g.weekly.gap ?? 0)));
    });
});

describe('gapSummary', () => {
    it('counts slots worth a move vs fine; unavailable slots are in neither bucket', () => {
        const roster = [
            P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 30 }),
            P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5 }),
        ];
        const fas = [
            P({ sleeper_id: 'qb2', position: 'QB', weeklyRank: 2 }),
            P({ sleeper_id: 'k2', position: 'K', weeklyRank: 12 }),
        ];
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['QB', 'K', 'TE'] });
        const s = gapSummary(gaps);
        expect(s.worthAMove).toBe(1);
        expect(s.fine).toBe(1);
        expect(s.total).toBe(3);
    });
});

describe('dedupeById', () => {
    it('keeps the first occurrence of each sleeper_id (page list wins over added candidates)', () => {
        const out = dedupeById([
            { sleeper_id: 'a', src: 'page' },
            { sleeper_id: 'b', src: 'page' },
            { sleeper_id: 'a', src: 'weekly' },
        ]);
        expect(out).toEqual([{ sleeper_id: 'a', src: 'page' }, { sleeper_id: 'b', src: 'page' }]);
    });
});

describe('computeSlotGaps: DEF (dst pool)', () => {
    const POS = ['DEF', 'BN'];
    const D = (id: string, rank: number | null, team?: string, extra: Partial<PortfolioPlayer> = {}) =>
        P({ ...extra, sleeper_id: id, position: 'DEF', team: team ?? id.replace('DEF_', ''), weeklyRank: rank });

    it('compares my defense to the best available defense within the dst pool', () => {
        const roster = [D('DEF_NYG', 25, undefined, { is_starter: true })];
        const fas = [D('DEF_LAC', 1), D('DEF_SEA', 2)];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: POS })[0];
        expect(g.weekly.pool).toBe('dst');
        expect(g.weekly.best?.player.sleeper_id).toBe('DEF_LAC');
        expect(g.weekly.gap).toBe(24);
        expect(g.weekly.status).toBe('actionable');
        expect(g.ros.status).toBe('unavailable'); // no ROS horizon for DEF
    });

    it('threshold boundary: dst gap equal to threshold is minor, threshold + 1 is actionable', () => {
        const t = GAP_THRESHOLDS.weekly.dst;
        expect(t).toBe(5);
        const roster = [D('DEF_NYG', 10, undefined, { is_starter: true })];
        const eq = computeSlotGaps({ roster, freeAgents: [D('DEF_LAC', 10 - t)], rosterPositions: POS })[0];
        const over = computeSlotGaps({ roster, freeAgents: [D('DEF_LAC', 10 - t - 1)], rosterPositions: POS })[0];
        expect(eq.weekly.status).toBe('minor');
        expect(over.weekly.status).toBe('actionable');
    });

    it('"no action": my defense beats everything available', () => {
        const roster = [D('DEF_NYG', 3, undefined, { is_starter: true })];
        const g = computeSlotGaps({ roster, freeAgents: [D('DEF_LAC', 9)], rosterPositions: POS })[0];
        expect(g.weekly.status).toBe('none');
        expect(g.status).toBe('none');
    });

    it('a defense not in this week\'s list is unranked-mine (and still shows the best available)', () => {
        const roster = [D('DEF_NYG', null, undefined, { is_starter: true })];
        const g = computeSlotGaps({ roster, freeAgents: [D('DEF_LAC', 4)], rosterPositions: POS })[0];
        expect(g.weekly.status).toBe('unranked-mine');
        expect(g.weekly.best?.rank).toBe(4);
        expect(g.status).toBe('unranked-mine');
    });

    it('my defense already played: locked, no gap this week', () => {
        const roster = [D('DEF_NYG', 25, 'NYG', { is_starter: true })];
        const g = computeSlotGaps({
            roster, freeAgents: [D('DEF_LAC', 1)], rosterPositions: POS, startedTeams: new Set(['NYG']),
        })[0];
        expect(g.weekly.locked).toBe(true);
        expect(g.weekly.status).toBe('unavailable');
    });

    it('a free-agent defense whose game already started is excluded', () => {
        const roster = [D('DEF_NYG', 25, undefined, { is_starter: true })];
        const fas = [D('DEF_LAC', 1), D('DEF_SEA', 2)];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: POS, startedTeams: new Set(['LAC']) })[0];
        expect(g.weekly.best?.player.sleeper_id).toBe('DEF_SEA');
    });

    it('DEF recommendation is a one-for-one swap that drops my current defense', () => {
        const roster = [D('DEF_NYG', 25, undefined, { is_starter: true })];
        const g = computeSlotGaps({ roster, freeAgents: [D('DEF_LAC', 1)], rosterPositions: POS })[0];
        expect(g.move?.add.sleeper_id).toBe('DEF_LAC');
        expect(g.move?.drop?.sleeper_id).toBe('DEF_NYG');
        expect(g.move?.type).toBe('swap');
        expect(g.move?.source).toBe('stream');
        expect(g.move?.informational).toBe(false);
    });

    it('an empty DEF slot recommends a pure add of the best defense', () => {
        const g = computeSlotGaps({ roster: [], freeAgents: [D('DEF_LAC', 1)], rosterPositions: POS })[0];
        expect(g.myPlayer).toBeNull();
        expect(g.weekly.pool).toBe('dst');
        expect(g.move?.type).toBe('add');
        expect(g.move?.drop).toBeNull();
    });

    it('a defense is never compared to a flex or k rank', () => {
        const roster = [D('DEF_NYG', 25, undefined, { is_starter: true })];
        const fas = [P({ sleeper_id: 'rb', position: 'RB', weeklyRank: 1 }), P({ sleeper_id: 'k', position: 'K', weeklyRank: 1 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: POS })[0];
        expect(g.weekly.best).toBeNull();
    });
});

describe('computeSlotGaps: pool size and stale rankings', () => {
    it('stamps the pool size on the weekly horizon for the slot pool', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5 })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 12 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'], poolSizes: { k: 32, dst: 24 } })[0];
        expect(g.weekly.poolSize).toBe(32);
    });

    it('omits poolSize when it is not supplied', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 5 })];
        const g = computeSlotGaps({ roster, freeAgents: [], rosterPositions: ['K'] })[0];
        expect(g.weekly.poolSize).toBeUndefined();
    });

    it('a stale/missing ranking pool is flagged noRanking and never reads as "no action"', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: null })];
        const g = computeSlotGaps({ roster, freeAgents: [], rosterPositions: ['K'], staleKinds: new Set(['k'] as const) })[0];
        expect(g.weekly.noRanking).toBe(true);
        expect(g.weekly.status).toBe('unavailable');
        expect(g.status).toBe('unavailable');
        expect(gapSummary([g]).fine).toBe(0);
    });

    it('stale flag applies to an empty single-position slot too', () => {
        const g = computeSlotGaps({ roster: [], freeAgents: [], rosterPositions: ['DEF'], staleKinds: new Set(['dst'] as const) })[0];
        expect(g.weekly.noRanking).toBe(true);
        expect(g.weekly.pool).toBe('dst');
    });

    it('stale kinds do not affect other pools', () => {
        const roster = [P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: 3 })];
        const fas = [P({ sleeper_id: 'qb2', position: 'QB', weeklyRank: 20 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['QB'], staleKinds: new Set(['k', 'dst'] as const) })[0];
        expect(g.weekly.noRanking).toBeUndefined();
        expect(g.weekly.status).toBe('none');
    });
});

describe('review patches: ROS tie-break and caution tier', () => {
    it('ROS tie-break: equal position rank is broken by overall ROS rank', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', rosPosRank: 30 })];
        const fas = [
            P({ sleeper_id: 'worse_overall', position: 'RB', rosPosRank: 10, rosRank: 90 }),
            P({ sleeper_id: 'better_overall', position: 'RB', rosPosRank: 10, rosRank: 40 }),
        ];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'] })[0];
        expect(g.ros.best?.player.sleeper_id).toBe('better_overall');
    });

    it('a caution-tier swap is surfaced with its tier (and a safe one is not flagged)', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, is_starter: true, marketValue: 2000 })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3 })];
        const upgrades = findWaiverUpgrades(
            { rosterId: 'me', ownerName: 'me', players: roster }, fas, ['K', 'BN'], 'redraft',
            { coreCapacity: 1, actualCoreCount: 1 },
        );
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K', 'BN'], upgrades })[0];
        expect(g.move?.tier).toBe('caution');
        expect(g.move?.drop?.sleeper_id).toBe('myk');
        expect(g.move?.informational).toBe(false);
    });
});

describe('review patches: attachMoves fallbacks', () => {
    it('an actionable slot with no matching waiver upgrade still gets a plain add with no drop', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, is_starter: true })];
        const fas = [P({ sleeper_id: 'k1', position: 'K', weeklyRank: 3 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'], upgrades: [] })[0];
        expect(g.weekly.status).toBe('actionable');
        expect(g.move?.add.sleeper_id).toBe('k1');
        expect(g.move?.drop).toBeNull();
        expect(g.move?.note).toMatch(/bench/i);
    });

    it('two moves never recommend dropping the same player', () => {
        const roster = [
            P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 60 }),
            P({ sleeper_id: 'rb1', position: 'RB', weeklyRank: 70 }),
            P({ sleeper_id: 'bench', position: 'WR', weeklyRank: 120 }),
        ];
        const fas = [
            P({ sleeper_id: 'fa_a', position: 'WR', weeklyRank: 5 }),
            P({ sleeper_id: 'fa_b', position: 'RB', weeklyRank: 8 }),
        ];
        const mk = (add: PortfolioPlayer): WaiverUpgrade => ({
            add, drop: roster[2], type: 'swap', tier: 'safe', informational: false, cracksLineup: true,
            comparedTo: roster[2], pool: 'flex', addWeeklyRank: add.weeklyRank ?? null, dropWeeklyRank: 120,
            weeklyRankGain: 100, valueSurrendered: 0,
        });
        const gaps = computeSlotGaps({
            roster, freeAgents: fas, rosterPositions: ['WR', 'RB', 'BN'], upgrades: [mk(fas[0]), mk(fas[1])],
        });
        const drops = gaps.map(g => g.move?.drop?.sleeper_id).filter(Boolean);
        expect(new Set(drops).size).toBe(drops.length);
        expect(gaps.filter(g => g.move).length).toBe(2); // both slots still get an add
    });
});

describe('review patches: team abbreviation convention (JAC vs JAX)', () => {
    it('kickerCandidates normalizes a JAC row to our JAX convention', () => {
        const c = kickerCandidates([{ sleeper_id: 'k1', rank: 4, name: 'Cam Little', team: 'JAC' }], new Set());
        expect(c[0].team).toBe('JAX');
    });

    it('a Jacksonville kicker whose game started (JAX in started set) is excluded even if the row said JAC', () => {
        const roster = [P({ sleeper_id: 'myk', position: 'K', weeklyRank: 25, team: 'KC' })];
        const cands = kickerCandidates([{ sleeper_id: 'k1', rank: 1, name: 'JAX K', team: 'JAC' }, { sleeper_id: 'k2', rank: 6, name: 'Other', team: 'BUF' }], new Set());
        const fas = cands.map(c => P({ ...c, weeklyRank: c.sleeper_id === 'k1' ? 1 : 6 }));
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['K'], startedTeams: new Set(['JAX']) })[0];
        expect(g.weekly.best?.player.sleeper_id).toBe('k2');
    });

    it('defenseCandidates takes the team from the DEF_ id, not from a row team that may disagree', () => {
        const c = defenseCandidates([{ sleeper_id: 'DEF_JAX', rank: 3, name: 'Jaguars', team: 'JAC' }], new Set());
        expect(c[0].team).toBe('JAX');
        const d = defenseCandidates([{ sleeper_id: 'DEF_SEA', rank: 3, name: 'Seahawks', team: 'LAR' }], new Set());
        expect(d[0].team).toBe('SEA');
    });
});

describe('review patches: stale QB / flex lists', () => {
    it('a stale flex list marks flex slots noRanking, while ROS still computes', () => {
        const roster = [P({ sleeper_id: 'rb1', position: 'RB', rosPosRank: 30 })];
        const fas = [P({ sleeper_id: 'f', position: 'RB', rosPosRank: 5 })];
        const g = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['RB'], staleKinds: new Set(['flex'] as const) })[0];
        expect(g.weekly.noRanking).toBe(true);
        expect(g.weekly.pool).toBe('flex');
        expect(g.ros.status).toBe('actionable');
        expect(g.status).toBe('actionable'); // ROS still drives the slot
    });

    it('a stale qb list marks QB slots noRanking but leaves flex slots alone', () => {
        const roster = [P({ sleeper_id: 'qb1', position: 'QB', weeklyRank: null }), P({ sleeper_id: 'wr1', position: 'WR', weeklyRank: 5 })];
        const fas = [P({ sleeper_id: 'wr2', position: 'WR', weeklyRank: 40 })];
        const gaps = computeSlotGaps({ roster, freeAgents: fas, rosterPositions: ['QB', 'WR'], staleKinds: new Set(['qb'] as const) });
        expect(gaps.find(g => g.slot === 'QB')!.weekly.noRanking).toBe(true);
        expect(gaps.find(g => g.slot === 'WR')!.weekly.noRanking).toBeUndefined();
    });
});
