/**
 * Advanced Stats Utilities
 * 
 * Breakout detection, regression flags, player comparison, and scoring integration.
 */

export interface PlayerAdvStats {
    season: number;
    position: string | null;
    games_played: number | null;
    fantasy_points_ppr: string | null;
    targets: number | null;
    receptions: number | null;
    receiving_yards: number | null;
    receiving_tds: number | null;
    carries: number | null;
    rushing_yards: number | null;
    rushing_tds: number | null;
    passing_yards: number | null;
    passing_tds: number | null;
    interceptions: number | null;
    target_share: string | null;
    wopr: string | null;
    avg_separation: string | null;
    avg_yac_above_expectation: string | null;
    rush_yards_over_expected_per_att: string | null;
    rush_efficiency: string | null;
    completion_pct_above_expected: string | null;
    offense_snap_pct: string | null;
    aggressiveness: string | null;
    avg_time_to_throw: string | null;
}

export interface BreakoutSignal {
    metric: string;
    label: string;
    prevValue: number;
    currValue: number;
    changePct: number;
    significance: 'high' | 'medium' | 'low';
}

export interface BreakoutResult {
    score: number; // 0-100
    signals: BreakoutSignal[];
    verdict: 'breakout' | 'trending_up' | 'stable' | 'declining';
}

export interface RegressionFlag {
    metric: string;
    label: string;
    reason: string;
    severity: 'high' | 'medium' | 'low';
}

// --- Breakout Detection ---

export function detectBreakout(current: PlayerAdvStats, previous: PlayerAdvStats | null): BreakoutResult {
    if (!previous) return { score: 50, signals: [], verdict: 'stable' };

    const signals: BreakoutSignal[] = [];
    const pos = current.position;

    // Helper to compare metrics
    const compare = (metric: string, label: string, currVal: string | number | null, prevVal: string | number | null, threshold: number) => {
        const curr = parseFloat(String(currVal || '0'));
        const prev = parseFloat(String(prevVal || '0'));
        if (prev === 0 || !curr) return;
        const changePct = ((curr - prev) / Math.abs(prev)) * 100;
        if (Math.abs(changePct) >= threshold) {
            signals.push({
                metric,
                label,
                prevValue: prev,
                currValue: curr,
                changePct: Math.round(changePct),
                significance: Math.abs(changePct) >= threshold * 2 ? 'high' : Math.abs(changePct) >= threshold * 1.3 ? 'medium' : 'low',
            });
        }
    };

    // Position-specific breakout signals
    if (pos === 'WR' || pos === 'TE') {
        compare('target_share', 'Target Share', current.target_share, previous.target_share, 20);
        compare('avg_separation', 'Separation', current.avg_separation, previous.avg_separation, 10);
        compare('wopr', 'WOPR', current.wopr, previous.wopr, 20);
        compare('receiving_yards', 'Rec Yards', current.receiving_yards, previous.receiving_yards, 25);
        compare('avg_yac_above_expectation', 'YAC vs Exp', current.avg_yac_above_expectation, previous.avg_yac_above_expectation, 30);
    }

    if (pos === 'RB') {
        compare('rush_yards_over_expected_per_att', 'RYOE/Att', current.rush_yards_over_expected_per_att, previous.rush_yards_over_expected_per_att, 25);
        compare('carries', 'Carries', current.carries, previous.carries, 25);
        compare('target_share', 'Target Share', current.target_share, previous.target_share, 25);
        compare('rushing_yards', 'Rush Yards', current.rushing_yards, previous.rushing_yards, 25);
    }

    if (pos === 'QB') {
        compare('completion_pct_above_expected', 'CPOE', current.completion_pct_above_expected, previous.completion_pct_above_expected, 30);
        compare('passing_yards', 'Pass Yards', current.passing_yards, previous.passing_yards, 15);
        compare('passing_tds', 'Pass TDs', current.passing_tds, previous.passing_tds, 20);
        compare('rushing_yards', 'Rush Yards', current.rushing_yards, previous.rushing_yards, 30);
    }

    // Snap % growth (all positions)
    compare('offense_snap_pct', 'Snap %', current.offense_snap_pct, previous.offense_snap_pct, 15);

    // Fantasy points growth
    compare('fantasy_points_ppr', 'PPR Points', current.fantasy_points_ppr, previous.fantasy_points_ppr, 20);

    // Calculate breakout score
    const positiveSignals = signals.filter(s => s.changePct > 0);
    const negativeSignals = signals.filter(s => s.changePct < 0);
    const highPositive = positiveSignals.filter(s => s.significance === 'high').length;
    const medPositive = positiveSignals.filter(s => s.significance === 'medium').length;

    let score = 50; // baseline
    score += highPositive * 15;
    score += medPositive * 8;
    score += positiveSignals.filter(s => s.significance === 'low').length * 4;
    score -= negativeSignals.filter(s => s.significance === 'high').length * 12;
    score -= negativeSignals.filter(s => s.significance === 'medium').length * 6;
    score = Math.max(0, Math.min(100, score));

    const verdict: BreakoutResult['verdict'] = 
        score >= 75 ? 'breakout' :
        score >= 60 ? 'trending_up' :
        score >= 40 ? 'stable' :
        'declining';

    return { score, signals, verdict };
}

// --- Regression Detection ---

export function detectRegression(stats: PlayerAdvStats): RegressionFlag[] {
    const flags: RegressionFlag[] = [];
    const pos = stats.position;

    if (pos === 'WR' || pos === 'TE') {
        // High TDs but low target share = TD-dependent (regression risk)
        const tds = stats.receiving_tds || 0;
        const targetShare = parseFloat(stats.target_share || '0');
        if (tds >= 8 && targetShare < 0.18) {
            flags.push({ metric: 'td_dependency', label: 'TD Dependent', reason: `${tds} TDs on only ${(targetShare * 100).toFixed(1)}% target share — scoring could regress`, severity: 'high' });
        }

        // Low separation but high yards = scheme/volume dependent
        const sep = parseFloat(stats.avg_separation || '0');
        const yards = stats.receiving_yards || 0;
        if (sep > 0 && sep < 2.5 && yards > 800) {
            flags.push({ metric: 'low_separation', label: 'Low Separation', reason: `Only ${sep.toFixed(1)} yds separation — production may be volume/scheme dependent`, severity: 'medium' });
        }
    }

    if (pos === 'RB') {
        // High TDs but negative RYOE = volume-dependent scorer
        const tds = (stats.rushing_tds || 0) + (stats.receiving_tds || 0);
        const ryoe = parseFloat(stats.rush_yards_over_expected_per_att || '0');
        if (tds >= 10 && ryoe < -0.5) {
            flags.push({ metric: 'td_volume', label: 'Volume TDs', reason: `${tds} TDs but ${ryoe.toFixed(2)} RYOE/att — scoring from opportunity, not efficiency`, severity: 'high' });
        }

        // Low efficiency but high usage
        const carries = stats.carries || 0;
        const efficiency = parseFloat(stats.rush_efficiency || '0');
        if (carries > 200 && efficiency > 0 && efficiency < 4.0) {
            flags.push({ metric: 'low_efficiency', label: 'Inefficient Volume', reason: `${carries} carries at ${efficiency.toFixed(1)} efficiency — workload could decrease`, severity: 'medium' });
        }
    }

    if (pos === 'QB') {
        // High TDs but negative CPOE = unsustainable TD rate
        const tds = stats.passing_tds || 0;
        const cpoe = parseFloat(stats.completion_pct_above_expected || '0');
        if (tds >= 30 && cpoe < -1) {
            flags.push({ metric: 'td_rate', label: 'Unsustainable TD Rate', reason: `${tds} TDs with ${cpoe.toFixed(1)} CPOE — TD rate likely regresses`, severity: 'medium' });
        }
    }

    return flags;
}

// --- Player Comparison ---

export interface ComparisonMetric {
    label: string;
    playerA: number | null;
    playerB: number | null;
    winner: 'a' | 'b' | 'tie';
    unit: string;
}

export function comparePlayerStats(a: PlayerAdvStats, b: PlayerAdvStats): ComparisonMetric[] {
    const metrics: ComparisonMetric[] = [];
    const pos = a.position; // assume same position

    const add = (label: string, aVal: string | number | null, bVal: string | number | null, unit: string, higherIsBetter = true) => {
        const aNum = aVal ? parseFloat(String(aVal)) : null;
        const bNum = bVal ? parseFloat(String(bVal)) : null;
        if (aNum === null && bNum === null) return;
        const winner = aNum === null ? 'b' : bNum === null ? 'a' : 
            Math.abs(aNum - bNum) < 0.01 ? 'tie' :
            (higherIsBetter ? (aNum > bNum ? 'a' : 'b') : (aNum < bNum ? 'a' : 'b'));
        metrics.push({ label, playerA: aNum, playerB: bNum, winner, unit });
    };

    // Common
    add('Fantasy PPR', a.fantasy_points_ppr, b.fantasy_points_ppr, 'pts');
    add('Snap %', a.offense_snap_pct, b.offense_snap_pct, '%');
    add('Games', a.games_played, b.games_played, '');

    if (pos === 'WR' || pos === 'TE') {
        add('Target Share', a.target_share, b.target_share, '%');
        add('Separation', a.avg_separation, b.avg_separation, 'yds');
        add('YAC vs Exp', a.avg_yac_above_expectation, b.avg_yac_above_expectation, '');
        add('WOPR', a.wopr, b.wopr, '');
        add('Rec Yards', a.receiving_yards, b.receiving_yards, '');
        add('Rec TDs', a.receiving_tds, b.receiving_tds, '');
    }

    if (pos === 'RB') {
        add('RYOE/Att', a.rush_yards_over_expected_per_att, b.rush_yards_over_expected_per_att, '');
        add('Efficiency', a.rush_efficiency, b.rush_efficiency, '');
        add('Rush Yards', a.rushing_yards, b.rushing_yards, '');
        add('Carries', a.carries, b.carries, '');
        add('Target Share', a.target_share, b.target_share, '%');
        add('Rec Yards', a.receiving_yards, b.receiving_yards, '');
    }

    if (pos === 'QB') {
        add('CPOE', a.completion_pct_above_expected, b.completion_pct_above_expected, '%');
        add('Time to Throw', a.avg_time_to_throw, b.avg_time_to_throw, 's', false);
        add('Pass Yards', a.passing_yards, b.passing_yards, '');
        add('Pass TDs', a.passing_tds, b.passing_tds, '');
        add('INTs', a.interceptions, b.interceptions, '', false);
        add('Rush Yards', a.rushing_yards, b.rushing_yards, '');
    }

    return metrics;
}

// --- Draft Scoring Boost from Advanced Stats ---

export function getAdvancedStatsBoost(stats: PlayerAdvStats): number {
    /**
     * Returns a multiplier (0.85 - 1.20) to apply to a player's draft score
     * based on their advanced metrics. Aligns with Late Round guide strategy:
     * - Target share and WOPR for WR/TE
     * - Rush efficiency and RYOE for RB  
     * - Mobility and CPOE for QB
     */
    const pos = stats.position;
    let boost = 1.0;

    if (pos === 'WR' || pos === 'TE') {
        const targetShare = parseFloat(stats.target_share || '0');
        const separation = parseFloat(stats.avg_separation || '0');
        const yacAbove = parseFloat(stats.avg_yac_above_expectation || '0');
        const snapPct = parseFloat(stats.offense_snap_pct || '0');

        // Elite target share (>25%) = locked-in role
        if (targetShare > 0.25) boost += 0.08;
        else if (targetShare > 0.20) boost += 0.04;
        else if (targetShare < 0.12 && targetShare > 0) boost -= 0.05;

        // Good separation = talent-based production
        if (separation > 3.2) boost += 0.05;
        else if (separation < 2.3 && separation > 0) boost -= 0.04;

        // YAC above expectation = playmaking ability
        if (yacAbove > 1.0) boost += 0.04;
        else if (yacAbove < -1.0) boost -= 0.03;

        // High snap % = role security
        if (snapPct > 0.85) boost += 0.03;
        else if (snapPct < 0.60 && snapPct > 0) boost -= 0.05;
    }

    if (pos === 'RB') {
        const ryoe = parseFloat(stats.rush_yards_over_expected_per_att || '0');
        const targetShare = parseFloat(stats.target_share || '0');
        const snapPct = parseFloat(stats.offense_snap_pct || '0');
        const efficiency = parseFloat(stats.rush_efficiency || '0');

        // RYOE = true rushing talent
        if (ryoe > 1.0) boost += 0.08;
        else if (ryoe > 0.3) boost += 0.04;
        else if (ryoe < -0.5) boost -= 0.05;

        // Receiving work = PPR upside (Late Round guide emphasis)
        if (targetShare > 0.08) boost += 0.06;
        else if (targetShare > 0.05) boost += 0.03;

        // Workhorse snap share
        if (snapPct > 0.70) boost += 0.05;
        else if (snapPct < 0.40 && snapPct > 0) boost -= 0.06;
    }

    if (pos === 'QB') {
        const cpoe = parseFloat(stats.completion_pct_above_expected || '0');
        const rushYards = stats.rushing_yards || 0;
        const aggressiveness = parseFloat(stats.aggressiveness || '0');

        // CPOE = accuracy above expectation
        if (cpoe > 3) boost += 0.06;
        else if (cpoe > 1) boost += 0.03;
        else if (cpoe < -3) boost -= 0.06;

        // Rushing ability = floor raiser (Late Round guide: mobility is king)
        if (rushYards > 500) boost += 0.08;
        else if (rushYards > 300) boost += 0.04;

        // Aggressiveness can be positive (big plays) if paired with CPOE
        if (aggressiveness > 20 && cpoe > 0) boost += 0.03;
    }

    // Clamp
    return Math.max(0.85, Math.min(1.20, boost));
}
