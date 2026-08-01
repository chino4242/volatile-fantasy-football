import { describe, it, expect } from 'vitest';
import {
    detectBreakout,
    detectRegression,
    getAdvancedStatsBoost,
    comparePlayerStats,
    type PlayerAdvStats,
} from '@/lib/advanced-stats';

function makeStats(overrides: Partial<PlayerAdvStats>): PlayerAdvStats {
    return {
        season: 2024,
        position: 'WR',
        games_played: 17,
        fantasy_points_ppr: '200',
        targets: 100,
        receptions: 70,
        receiving_yards: 900,
        receiving_tds: 6,
        carries: null,
        rushing_yards: null,
        rushing_tds: null,
        passing_yards: null,
        passing_tds: null,
        interceptions: null,
        target_share: '0.20',
        wopr: '0.50',
        avg_separation: '2.8',
        avg_yac_above_expectation: '0.5',
        rush_yards_over_expected_per_att: null,
        rush_efficiency: null,
        completion_pct_above_expected: null,
        offense_snap_pct: '0.85',
        aggressiveness: null,
        avg_time_to_throw: null,
        ...overrides,
    };
}

describe('detectBreakout', () => {
    it('returns score 50 and stable verdict when no previous season', () => {
        const current = makeStats({});
        const result = detectBreakout(current, null);
        expect(result.score).toBe(50);
        expect(result.verdict).toBe('stable');
        expect(result.signals).toHaveLength(0);
    });

    it('detects breakout or trending up on significant target share increase', () => {
        const previous = makeStats({ target_share: '0.15', season: 2023 });
        const current = makeStats({ target_share: '0.25', season: 2024 });
        const result = detectBreakout(current, previous);
        expect(result.score).toBeGreaterThan(50);
        expect(['breakout', 'trending_up']).toContain(result.verdict);
        expect(result.signals.some(s => s.metric === 'target_share')).toBe(true);
    });

    it('detects declining when stats drop significantly', () => {
        const previous = makeStats({ receiving_yards: 1500, fantasy_points_ppr: '300', season: 2023 });
        const current = makeStats({ receiving_yards: 800, fantasy_points_ppr: '160', season: 2024 });
        const result = detectBreakout(current, previous);
        expect(result.score).toBeLessThan(50);
        expect(result.verdict).toBe('declining');
    });

    it('returns stable when stats are similar between years', () => {
        const previous = makeStats({ target_share: '0.20', receiving_yards: 900, fantasy_points_ppr: '200', season: 2023 });
        const current = makeStats({ target_share: '0.21', receiving_yards: 920, fantasy_points_ppr: '205', season: 2024 });
        const result = detectBreakout(current, previous);
        expect(result.verdict).toBe('stable');
    });

    it('produces a higher score when multiple metrics improve', () => {
        const previous = makeStats({
            target_share: '0.14',
            avg_separation: '2.2',
            receiving_yards: 600,
            fantasy_points_ppr: '130',
            season: 2023,
        });
        const current = makeStats({
            target_share: '0.26',
            avg_separation: '3.2',
            receiving_yards: 1100,
            fantasy_points_ppr: '260',
            season: 2024,
        });
        const result = detectBreakout(current, previous);
        expect(result.score).toBeGreaterThan(65);
        expect(result.signals.length).toBeGreaterThanOrEqual(2);
    });
});

describe('detectRegression', () => {
    it('flags TD Dependent for WR with high TDs and low target share', () => {
        const stats = makeStats({ receiving_tds: 10, target_share: '0.12' });
        const flags = detectRegression(stats);
        expect(flags.some(f => f.label === 'TD Dependent')).toBe(true);
    });

    it('flags Low Separation for WR with low separation but high yards', () => {
        const stats = makeStats({ avg_separation: '2.2', receiving_yards: 900 });
        const flags = detectRegression(stats);
        expect(flags.some(f => f.label === 'Low Separation')).toBe(true);
    });

    it('flags Volume TDs for RB with high TDs but negative RYOE', () => {
        const stats = makeStats({
            position: 'RB',
            rushing_tds: 10,
            receiving_tds: 2,
            rush_yards_over_expected_per_att: '-0.7',
        });
        const flags = detectRegression(stats);
        expect(flags.some(f => f.label === 'Volume TDs')).toBe(true);
    });

    it('flags Inefficient Volume for RB with many carries but low efficiency', () => {
        const stats = makeStats({
            position: 'RB',
            carries: 250,
            rush_efficiency: '3.5',
        });
        const flags = detectRegression(stats);
        expect(flags.some(f => f.label === 'Inefficient Volume')).toBe(true);
    });

    it('flags Unsustainable TD Rate for QB with high TDs but negative CPOE', () => {
        const stats = makeStats({
            position: 'QB',
            passing_tds: 32,
            completion_pct_above_expected: '-2',
        });
        const flags = detectRegression(stats);
        expect(flags.some(f => f.label === 'Unsustainable TD Rate')).toBe(true);
    });

    it('returns empty array for player with no regression flags', () => {
        const stats = makeStats({
            receiving_tds: 4,
            target_share: '0.22',
            avg_separation: '3.0',
            receiving_yards: 800,
        });
        const flags = detectRegression(stats);
        expect(flags).toHaveLength(0);
    });
});

describe('getAdvancedStatsBoost', () => {
    it('boosts WR with elite target share and good separation above 1.10', () => {
        const stats = makeStats({ target_share: '0.28', avg_separation: '3.3', offense_snap_pct: '0.90' });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeGreaterThan(1.10);
    });

    it('penalizes WR with low target share and low separation below 0.95', () => {
        const stats = makeStats({ target_share: '0.08', avg_separation: '2.1', offense_snap_pct: '0.55' });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeLessThan(0.95);
    });

    it('boosts RB with positive RYOE and high target share above 1.10', () => {
        const stats = makeStats({
            position: 'RB',
            rush_yards_over_expected_per_att: '1.2',
            target_share: '0.09',
            offense_snap_pct: '0.75',
        });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeGreaterThan(1.10);
    });

    it('penalizes RB with negative RYOE and low snap share below 0.90', () => {
        const stats = makeStats({
            position: 'RB',
            rush_yards_over_expected_per_att: '-0.8',
            target_share: '0.02',
            offense_snap_pct: '0.30',
        });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeLessThan(0.90);
    });

    it('boosts QB with good CPOE and rushing above 1.10', () => {
        const stats = makeStats({
            position: 'QB',
            completion_pct_above_expected: '4.0',
            rushing_yards: 600,
        });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeGreaterThan(1.10);
    });

    it('penalizes QB with bad CPOE and no rushing below 0.95', () => {
        const stats = makeStats({
            position: 'QB',
            completion_pct_above_expected: '-4.0',
            rushing_yards: 50,
        });
        const boost = getAdvancedStatsBoost(stats);
        expect(boost).toBeLessThan(0.95);
    });

    it('clamps boost between 0.85 and 1.20', () => {
        // Extreme positive case
        const eliteStats = makeStats({
            target_share: '0.30',
            avg_separation: '4.0',
            avg_yac_above_expectation: '2.0',
            offense_snap_pct: '0.95',
        });
        expect(getAdvancedStatsBoost(eliteStats)).toBeLessThanOrEqual(1.20);

        // Extreme negative case
        const badStats = makeStats({
            target_share: '0.05',
            avg_separation: '1.5',
            avg_yac_above_expectation: '-2.0',
            offense_snap_pct: '0.40',
        });
        expect(getAdvancedStatsBoost(badStats)).toBeGreaterThanOrEqual(0.85);
    });
});

describe('comparePlayerStats', () => {
    it('returns metrics with winner field when comparing two WRs', () => {
        const playerA = makeStats({ target_share: '0.25', receiving_yards: 1100 });
        const playerB = makeStats({ target_share: '0.18', receiving_yards: 800 });
        const metrics = comparePlayerStats(playerA, playerB);
        expect(metrics.length).toBeGreaterThan(0);
        expect(metrics[0]).toHaveProperty('winner');
        expect(metrics[0]).toHaveProperty('playerA');
        expect(metrics[0]).toHaveProperty('playerB');
    });

    it('assigns winner "a" when playerA has higher value for higher-is-better metric', () => {
        const playerA = makeStats({ target_share: '0.25' });
        const playerB = makeStats({ target_share: '0.15' });
        const metrics = comparePlayerStats(playerA, playerB);
        const targetShareMetric = metrics.find(m => m.label === 'Target Share');
        expect(targetShareMetric?.winner).toBe('a');
    });

    it('assigns winner "b" when playerB has higher value for higher-is-better metric', () => {
        const playerA = makeStats({ receiving_yards: 700 });
        const playerB = makeStats({ receiving_yards: 1200 });
        const metrics = comparePlayerStats(playerA, playerB);
        const ydsMetric = metrics.find(m => m.label === 'Rec Yards');
        expect(ydsMetric?.winner).toBe('b');
    });

    it('handles null values gracefully', () => {
        const playerA = makeStats({ avg_separation: null });
        const playerB = makeStats({ avg_separation: '3.0' });
        const metrics = comparePlayerStats(playerA, playerB);
        const sepMetric = metrics.find(m => m.label === 'Separation');
        expect(sepMetric?.winner).toBe('b');
        expect(sepMetric?.playerA).toBeNull();
    });
});
