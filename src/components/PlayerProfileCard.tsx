'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info } from 'lucide-react';

// --- Types ---

interface PlayerProfileCardProps {
    playerName: string;
    position: string;
    team: string | null;
    sleeperId: string;
    onClose: () => void;
    dynastyValue?: number;
    auctionValue?: number | null;
    yearsExp?: number | null;
    zapScore?: number | null;
    zapCategory?: string | null;
    zapComps?: string | null;
    zapAnalysis?: string | null;
    writeups?: { source: string; analysis_text: string; ai_summary?: string; ai_confidence?: number; ai_bull_case?: string; ai_bear_case?: string; ai_comps?: string }[] | null;
}

interface StatsData {
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

interface BreakoutResult {
    score: number;
    signals: { metric: string; label: string; prevValue: number; currValue: number; changePct: number; significance: string }[];
    verdict: string;
}

interface RegressionFlag {
    metric: string;
    label: string;
    reason: string;
    severity: string;
}

interface ApiResponse {
    stats: StatsData[];
    breakout: BreakoutResult | null;
    regression: RegressionFlag[] | null;
    scoringBoost: number | null;
}

interface WeeklyStats {
    week: number;
    targets: number;
    receptions: number;
    receiving_yards: number;
    receiving_tds: number;
    carries: number;
    rushing_yards: number;
    rushing_tds: number;
    passing_yards: number;
    passing_tds: number;
    fantasy_points_ppr: number;
}

type Tab = 'profile' | 'trends' | 'scouting';
type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

// --- Constants ---

const POS_BADGE_COLORS: Record<string, string> = {
    QB: 'bg-red-500 text-white',
    RB: 'bg-blue-500 text-white',
    WR: 'bg-green-500 text-white',
    TE: 'bg-purple-500 text-white',
};

const GRADE_COLORS: Record<Grade, string> = {
    'A+': 'bg-green-500 text-white',
    'A': 'bg-green-600 text-white',
    'B+': 'bg-blue-500 text-white',
    'B': 'bg-blue-600 text-white',
    'C': 'bg-amber-500 text-white',
    'D': 'bg-red-500 text-white',
    'F': 'bg-red-700 text-white',
};

// Reference benchmarks for percentile calculation
const BENCHMARKS: Record<string, Record<string, [number, number]>> = {
    WR: {
        avg_separation: [2.0, 3.5],
        target_share: [0.05, 0.30],
        avg_yac_above_expectation: [-2.0, 2.0],
        fantasy_points_ppr: [50, 350],
    },
    RB: {
        rush_yards_over_expected_per_att: [-1.5, 1.5],
        target_share: [0.01, 0.12],
        offense_snap_pct: [0.30, 0.80],
        fantasy_points_ppr: [50, 350],
    },
    QB: {
        completion_pct_above_expected: [-5.0, 5.0],
        rushing_yards: [0, 800],
        avg_time_to_throw: [3.2, 2.2], // lower is better for time to throw
        fantasy_points_ppr: [50, 350],
    },
    TE: {
        target_share: [0.05, 0.25],
        offense_snap_pct: [0.40, 0.90],
        avg_separation: [2.0, 3.5],
        fantasy_points_ppr: [50, 350],
    },
};

const METRIC_LABELS: Record<string, string> = {
    avg_separation: 'Separation',
    target_share: 'Target Share',
    avg_yac_above_expectation: 'YAC above Expected',
    fantasy_points_ppr: 'Fantasy PPR',
    rush_yards_over_expected_per_att: 'RYOE/Att',
    offense_snap_pct: 'Snap %',
    completion_pct_above_expected: 'CPOE',
    rushing_yards: 'Rush Yards',
    avg_time_to_throw: 'Time to Throw',
};

const METRIC_DESCRIPTIONS: Record<string, string> = {
    avg_separation: 'Average yards of separation from defender at the catch point. Higher = gets open more easily.',
    target_share: 'Percentage of team pass attempts directed at this player. Higher = more involved in the offense.',
    avg_yac_above_expectation: 'Yards After Catch above what\'s expected based on the catch situation. Positive = makes plays after the catch.',
    fantasy_points_ppr: 'Total PPR fantasy points scored. The bottom line of fantasy production.',
    rush_yards_over_expected_per_att: 'Rush Yards Over Expected per attempt. Measures rushing efficiency vs what the blocking creates. Positive = creates extra yards.',
    offense_snap_pct: 'Percentage of offensive snaps played. Higher = more secure role, fewer timeshares.',
    completion_pct_above_expected: 'Completion Percentage Over Expected. Measures accuracy above what\'s expected given throw difficulty. Positive = more accurate than average.',
    rushing_yards: 'Total rushing yards. For QBs, indicates mobility and rushing floor.',
    avg_time_to_throw: 'Average seconds from snap to throw. Lower can mean quick processing; higher can mean extended plays.',
};

// --- Helper Functions ---

function calcPercentile(value: number, min: number, max: number): number {
    if (max === min) return 50;
    const pct = ((value - min) / (max - min)) * 100;
    return Math.max(0, Math.min(100, pct));
}

function getGrade(percentile: number): Grade {
    if (percentile >= 95) return 'A+';
    if (percentile >= 85) return 'A';
    if (percentile >= 70) return 'B+';
    if (percentile >= 50) return 'B';
    if (percentile >= 25) return 'C';
    if (percentile >= 10) return 'D';
    return 'F';
}

function getPercentileColor(pct: number): string {
    if (pct >= 75) return 'bg-green-500';
    if (pct >= 50) return 'bg-blue-500';
    if (pct >= 25) return 'bg-amber-500';
    return 'bg-red-500';
}

function getStatValue(stats: StatsData, key: string): number | null {
    const val = stats[key as keyof StatsData];
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}

function computeGrades(stats: StatsData, position: string): { metric: string; label: string; grade: Grade; percentile: number; value: number }[] {
    const benchmarks = BENCHMARKS[position];
    if (!benchmarks) return [];

    const grades: { metric: string; label: string; grade: Grade; percentile: number; value: number }[] = [];

    for (const [metric, [min, max]] of Object.entries(benchmarks)) {
        const value = getStatValue(stats, metric);
        if (value === null) continue;

        // For time to throw, lower is better (inverted benchmark)
        const isInverted = metric === 'avg_time_to_throw';
        const pct = isInverted
            ? calcPercentile(value, max, min) // swap min/max for inverted
            : calcPercentile(value, min, max);

        grades.push({
            metric,
            label: METRIC_LABELS[metric] || metric,
            grade: getGrade(pct),
            percentile: Math.round(pct),
            value,
        });
    }

    return grades;
}

function generateScoutingTake(
    grades: { metric: string; label: string; grade: Grade; percentile: number }[],
    position: string
): string {
    if (grades.length === 0) return 'No advanced stats available';

    const elite = grades.filter(g => g.grade === 'A+' || g.grade === 'A');
    const good = grades.filter(g => g.grade === 'B+' || g.grade === 'B');
    const weak = grades.filter(g => g.grade === 'D' || g.grade === 'F');
    const avg = grades.filter(g => g.grade === 'C');

    if (elite.length === grades.length) {
        return `Elite ${position} — top-tier production across the board`;
    }
    if (elite.length >= 3) {
        return `Dominant ${position} with elite ${elite[0].label.toLowerCase()} and ${elite[1].label.toLowerCase()}`;
    }
    if (elite.length >= 1 && weak.length >= 1) {
        return `High-ceiling ${elite[0].label.toLowerCase()} player with inconsistent ${weak[0].label.toLowerCase()}`;
    }
    if (weak.length >= 2) {
        return `Concerning profile — below average in ${weak.map(w => w.label.toLowerCase()).join(' and ')}`;
    }
    if (good.length >= 3) {
        return `Solid ${position} with well-rounded production`;
    }
    if (avg.length >= 2 && elite.length === 0) {
        return `Average ${position} — no standout metrics, limited upside`;
    }
    return `Mixed profile — monitor development`;
}

function formatStatValue(metric: string, value: number): string {
    if (metric === 'target_share' || metric === 'offense_snap_pct') {
        return `${(value * 100).toFixed(1)}%`;
    }
    if (metric === 'avg_time_to_throw') {
        return `${value.toFixed(2)}s`;
    }
    if (metric === 'fantasy_points_ppr' || metric === 'rushing_yards') {
        return Math.round(value).toString();
    }
    return value.toFixed(2);
}

// --- Main Component ---

export default function PlayerProfileCard({
    playerName,
    position,
    team,
    sleeperId,
    onClose,
    dynastyValue,
    auctionValue,
    yearsExp,
    zapScore,
    zapCategory,
    zapComps,
    zapAnalysis,
    writeups,
}: PlayerProfileCardProps) {
    const [activeTab, setActiveTab] = useState<Tab>('profile');
    const [apiData, setApiData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
    const [basicStats, setBasicStats] = useState<WeeklyStats[] | null>(null);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const [advRes, basicRes] = await Promise.all([
                fetch(`/api/player-advanced-stats?sleeper_id=${sleeperId}`),
                fetch(`/api/player-stats?sleeperId=${sleeperId}&season=${new Date().getFullYear() - 1}`),
            ]);
            if (advRes.ok) {
                const data: ApiResponse = await advRes.json();
                setApiData(data);
                if (data.stats.length > 0) {
                    setSelectedSeason(data.stats[0].season);
                }
            }
            if (basicRes.ok) {
                const basicData = await basicRes.json();
                setBasicStats(basicData.stats || []);
            }
        } catch {
            // silently fail - UI shows empty state
        } finally {
            setLoading(false);
        }
    }, [sleeperId]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const currentStats = apiData?.stats.find(s => s.season === selectedSeason) || apiData?.stats[0] || null;
    const grades = currentStats ? computeGrades(currentStats, position) : [];
    const scoutingTake = generateScoutingTake(grades, position);
    const availableSeasons = apiData?.stats.map(s => s.season) || [];

    // Estimate age from years of experience (draft age ~21)
    const estimatedAge = yearsExp != null ? 21 + yearsExp : null;

    const tabs: { id: Tab; label: string }[] = [
        { id: 'profile', label: 'Profile' },
        { id: 'trends', label: 'Trends' },
        { id: 'scouting', label: 'Scouting' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }}>
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                    aria-label="Close"
                >
                    <X className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                </button>

                {/* Player Header */}
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-center gap-3 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${POS_BADGE_COLORS[position] || 'bg-zinc-500 text-white'}`}>
                            {position}
                        </span>
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate">{playerName}</h2>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                        {team && <span>{team}</span>}
                        {estimatedAge && <span>Age {estimatedAge}</span>}
                        {yearsExp != null && <span>Yr {yearsExp}</span>}
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="px-5 pb-3">
                    <div className="flex gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition ${
                                    activeTab === tab.id
                                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto px-5 pb-5">
                    {activeTab === 'profile' && (
                        <ProfileTab
                            dynastyValue={dynastyValue}
                            auctionValue={auctionValue}
                            grades={grades}
                            scoutingTake={scoutingTake}
                            breakout={apiData?.breakout || null}
                            regression={apiData?.regression || null}
                            loading={loading}
                            basicStats={basicStats}
                            position={position}
                            stats={apiData?.stats || []}
                            selectedSeason={selectedSeason}
                            onSeasonChange={setSelectedSeason}
                            availableSeasons={availableSeasons}
                        />
                    )}
                    {activeTab === 'trends' && (
                        <TrendsTab sleeperId={sleeperId} />
                    )}
                    {activeTab === 'scouting' && (
                        <ScoutingTab
                            zapScore={zapScore}
                            zapCategory={zapCategory}
                            zapComps={zapComps}
                            zapAnalysis={zapAnalysis}
                            writeups={writeups}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Profile Tab (merged Overview + Stats) ---

function ProfileTab({
    dynastyValue,
    auctionValue,
    grades,
    scoutingTake,
    breakout,
    regression,
    loading,
    basicStats,
    position,
    stats,
    selectedSeason,
    onSeasonChange,
    availableSeasons,
}: {
    dynastyValue?: number;
    auctionValue?: number | null;
    grades: { metric: string; label: string; grade: Grade; percentile: number; value: number }[];
    scoutingTake: string;
    breakout: BreakoutResult | null;
    regression: RegressionFlag[] | null;
    loading: boolean;
    basicStats?: WeeklyStats[] | null;
    position: string;
    stats: StatsData[];
    selectedSeason: number | null;
    onSeasonChange: (s: number) => void;
    availableSeasons: number[];
}) {
    const benchmarks = BENCHMARKS[position];
    const seasonsToShow = availableSeasons.slice(0, 2);

    return (
        <div className="space-y-4">
            {/* Value Display */}
            <div className="flex gap-3">
                <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Dynasty Value</div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-white">
                        {dynastyValue?.toLocaleString() ?? '—'}
                    </div>
                </div>
                <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Auction Value</div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-white">
                        {auctionValue != null ? `$${auctionValue}` : '—'}
                    </div>
                </div>
            </div>

            {/* Breakout / Regression Badges */}
            {(breakout || (regression && regression.length > 0)) && (
                <div className="flex flex-wrap gap-2">
                    {breakout && (breakout.verdict === 'breakout' || breakout.verdict === 'trending_up') && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <TrendingUp className="w-3 h-3" />
                            {breakout.verdict === 'breakout' ? 'BREAKOUT' : 'TRENDING UP'}
                        </span>
                    )}
                    {breakout && breakout.verdict === 'declining' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            <TrendingDown className="w-3 h-3" />
                            DECLINING
                        </span>
                    )}
                    {regression && regression.map((flag, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                            ⚠ {flag.label}
                        </span>
                    ))}
                </div>
            )}

            {/* Scouting Take */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                <p className="text-sm text-zinc-700 dark:text-zinc-300 italic">&ldquo;{scoutingTake}&rdquo;</p>
            </div>

            {/* Grade Badges */}
            {loading ? (
                <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
            ) : grades.length > 0 ? (
                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">Key Metrics</div>
                    <div className="grid grid-cols-2 gap-2">
                        {grades.map(g => (
                            <div key={g.metric} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                                <div>
                                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">{g.label} <InfoTip metric={g.metric} /></div>
                                    <div className="text-[10px] text-zinc-500">{formatStatValue(g.metric, g.value)}</div>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${GRADE_COLORS[g.grade]}`}>
                                    {g.grade}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center text-xs text-zinc-500 py-4">No advanced stats available</div>
            )}

            {/* Percentile Bars Section */}
            {!loading && benchmarks && stats.length > 0 && (
                <div className="space-y-3">
                    {/* Season Toggle */}
                    {availableSeasons.length > 1 && (
                        <div className="flex gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                            {seasonsToShow.map(season => (
                                <button
                                    key={season}
                                    onClick={() => onSeasonChange(season)}
                                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition ${
                                        selectedSeason === season
                                            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                    }`}
                                >
                                    {season}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">Percentile Rankings</div>

                    {Object.entries(benchmarks).map(([metric, [min, max]]) => {
                        const seasonStats = stats.find(s => s.season === selectedSeason) || stats[0];
                        const value = getStatValue(seasonStats, metric);
                        if (value === null) return null;

                        const isInverted = metric === 'avg_time_to_throw';
                        const pct = isInverted
                            ? calcPercentile(value, max, min)
                            : calcPercentile(value, min, max);
                        const barColor = getPercentileColor(pct);

                        return (
                            <div key={metric} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                                        {METRIC_LABELS[metric] || metric}
                                        <InfoTip metric={metric} />
                                    </span>
                                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                                        {formatStatValue(metric, value)}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                        style={{ width: `${Math.round(pct)}%` }}
                                    />
                                </div>
                                <div className="text-[10px] text-zinc-400 text-right">{Math.round(pct)}th percentile</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Basic Season Stats */}
            {basicStats && basicStats.length > 0 && (() => {
                const totals = basicStats.reduce((acc, w) => ({
                    targets: acc.targets + (w.targets || 0),
                    receptions: acc.receptions + (w.receptions || 0),
                    receiving_yards: acc.receiving_yards + (w.receiving_yards || 0),
                    receiving_tds: acc.receiving_tds + (w.receiving_tds || 0),
                    carries: acc.carries + (w.carries || 0),
                    rushing_yards: acc.rushing_yards + (w.rushing_yards || 0),
                    rushing_tds: acc.rushing_tds + (w.rushing_tds || 0),
                    passing_yards: acc.passing_yards + (w.passing_yards || 0),
                    passing_tds: acc.passing_tds + (w.passing_tds || 0),
                }), { targets: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0, carries: 0, rushing_yards: 0, rushing_tds: 0, passing_yards: 0, passing_tds: 0 });
                const games = basicStats.length;

                return (
                    <div>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold mb-2">Season Totals ({games} games)</div>
                        <div className="grid grid-cols-3 gap-2">
                            {position === 'QB' && (
                                <>
                                    <StatBox label="Pass Yds" value={totals.passing_yards.toLocaleString()} perGame={`${Math.round(totals.passing_yards / games)}/g`} />
                                    <StatBox label="Pass TD" value={String(totals.passing_tds)} perGame={`${(totals.passing_tds / games).toFixed(1)}/g`} />
                                    <StatBox label="Rush Yds" value={totals.rushing_yards.toLocaleString()} perGame={`${Math.round(totals.rushing_yards / games)}/g`} />
                                </>
                            )}
                            {(position === 'WR' || position === 'TE') && (
                                <>
                                    <StatBox label="Targets" value={String(totals.targets)} perGame={`${(totals.targets / games).toFixed(1)}/g`} />
                                    <StatBox label="Rec Yds" value={totals.receiving_yards.toLocaleString()} perGame={`${Math.round(totals.receiving_yards / games)}/g`} />
                                    <StatBox label="Rec TD" value={String(totals.receiving_tds)} perGame={`${(totals.receiving_tds / games).toFixed(1)}/g`} />
                                </>
                            )}
                            {position === 'RB' && (
                                <>
                                    <StatBox label="Rush Yds" value={totals.rushing_yards.toLocaleString()} perGame={`${Math.round(totals.rushing_yards / games)}/g`} />
                                    <StatBox label="Rush TD" value={String(totals.rushing_tds)} perGame={`${(totals.rushing_tds / games).toFixed(1)}/g`} />
                                    <StatBox label="Targets" value={String(totals.targets)} perGame={`${(totals.targets / games).toFixed(1)}/g`} />
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

// --- Trends Tab (NEW) ---

function TrendsTab({ sleeperId }: { sleeperId: string }) {
    const currentYear = new Date().getFullYear();
    const [selectedTrendSeason, setSelectedTrendSeason] = useState(currentYear - 1);
    const [weeklyStats, setWeeklyStats] = useState<WeeklyStats[] | null>(null);
    const [trendLoading, setTrendLoading] = useState(true);
    const availableTrendSeasons = [currentYear, currentYear - 1, currentYear - 2];

    useEffect(() => {
        let cancelled = false;
        async function fetchWeekly() {
            setTrendLoading(true);
            try {
                const res = await fetch(`/api/player-stats?sleeperId=${sleeperId}&season=${selectedTrendSeason}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setWeeklyStats(data.stats || []);
                }
            } catch {
                // silently fail
            } finally {
                if (!cancelled) setTrendLoading(false);
            }
        }
        fetchWeekly();
        return () => { cancelled = true; };
    }, [sleeperId, selectedTrendSeason]);

    if (trendLoading) {
        return (
            <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!weeklyStats || weeklyStats.length === 0) {
        return (
            <div className="space-y-4">
                <TrendSeasonSelector
                    seasons={availableTrendSeasons}
                    selected={selectedTrendSeason}
                    onChange={setSelectedTrendSeason}
                />
                <div className="text-center text-xs text-zinc-500 py-8">No weekly data available for {selectedTrendSeason}</div>
            </div>
        );
    }

    const points = weeklyStats.map(w => w.fantasy_points_ppr || 0);
    const seasonAvg = points.reduce((a, b) => a + b, 0) / points.length;
    const maxPoints = Math.max(...points, 1);

    // Boom/Bust
    const booms = points.filter(p => p >= 15).length;
    const busts = points.filter(p => p <= 6).length;
    const average = points.length - booms - busts;

    // Recent Form (last 3 games)
    const last3 = points.slice(-3);
    const last3Avg = last3.length > 0 ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
    const formDiff = seasonAvg > 0 ? ((last3Avg - seasonAvg) / seasonAvg) * 100 : 0;
    const formUp = last3Avg >= seasonAvg;

    // Consistency (standard deviation)
    const variance = points.reduce((sum, p) => sum + Math.pow(p - seasonAvg, 2), 0) / points.length;
    const stdev = Math.sqrt(variance);
    const consistencyLabel = stdev <= 4 ? 'High consistency' : stdev <= 7 ? 'Moderate consistency' : 'Boom/bust profile';

    return (
        <div className="space-y-4">
            {/* Season Selector */}
            <TrendSeasonSelector
                seasons={availableTrendSeasons}
                selected={selectedTrendSeason}
                onChange={setSelectedTrendSeason}
            />

            {/* Weekly Fantasy Points Bar Chart */}
            <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">Weekly Fantasy Points (PPR)</div>
                <div className="relative">
                    {/* Season average reference line */}
                    <div
                        className="absolute left-0 right-0 border-t border-dashed border-zinc-400 dark:border-zinc-500 z-10"
                        style={{ bottom: `${(seasonAvg / maxPoints) * 100}%` }}
                    >
                        <span className="absolute -top-3 right-0 text-[9px] text-zinc-500 dark:text-zinc-400">
                            avg {seasonAvg.toFixed(1)}
                        </span>
                    </div>
                    <div className="flex items-end gap-0.5 h-28">
                        {points.map((pts, i) => {
                            const heightPct = maxPoints > 0 ? (pts / maxPoints) * 100 : 0;
                            const aboveAvg = pts >= seasonAvg;
                            return (
                                <div
                                    key={i}
                                    className="flex-1 relative group"
                                    style={{ height: '100%' }}
                                >
                                    <div
                                        className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-all ${
                                            aboveAvg ? 'bg-green-500 dark:bg-green-600' : 'bg-amber-500 dark:bg-amber-600'
                                        }`}
                                        style={{ height: `${heightPct}%`, minHeight: pts > 0 ? '2px' : '0px' }}
                                    />
                                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block text-[9px] bg-zinc-800 text-white px-1 py-0.5 rounded whitespace-nowrap z-20">
                                        W{weeklyStats[i].week}: {pts.toFixed(1)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="flex justify-between text-[9px] text-zinc-400">
                    <span>W{weeklyStats[0]?.week || 1}</span>
                    <span>W{weeklyStats[weeklyStats.length - 1]?.week || 18}</span>
                </div>
            </div>

            {/* Boom/Bust Ratio */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold mb-1">Boom / Bust</div>
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    🔥 {booms} boom{booms !== 1 ? 's' : ''} · 💀 {busts} bust{busts !== 1 ? 's' : ''} · {average} average
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">Boom = 15+ PPR · Bust = 6 or fewer PPR</div>
            </div>

            {/* Recent Form */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold mb-1">Recent Form</div>
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {formUp ? '↗' : '↘'} {last3Avg.toFixed(1)} last 3 vs {seasonAvg.toFixed(1)} season ({formUp ? '+' : ''}{formDiff.toFixed(0)}%)
                </div>
            </div>

            {/* Consistency Score */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold mb-1">Consistency</div>
                <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {consistencyLabel}
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">σ = {stdev.toFixed(1)} pts/week</div>
            </div>
        </div>
    );
}

function TrendSeasonSelector({ seasons, selected, onChange }: { seasons: number[]; selected: number; onChange: (s: number) => void }) {
    return (
        <div className="flex gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
            {seasons.map(season => (
                <button
                    key={season}
                    onClick={() => onChange(season)}
                    className={`flex-1 text-xs font-semibold py-1.5 rounded-md transition ${
                        selected === season
                            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                >
                    {season}
                </button>
            ))}
        </div>
    );
}

// --- Shared Components ---

function InfoTip({ metric }: { metric: string }) {
    const [show, setShow] = useState(false);
    const desc = METRIC_DESCRIPTIONS[metric];
    if (!desc) return null;
    return (
        <span className="relative inline-block">
            <button onClick={(e) => { e.stopPropagation(); setShow(!show); }} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5">
                <Info className="w-3 h-3" />
            </button>
            {show && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-52 p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] rounded-lg shadow-lg leading-relaxed">
                    {desc}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 dark:bg-zinc-100 rotate-45 -mt-1" />
                </div>
            )}
        </span>
    );
}

function StatBox({ label, value, perGame }: { label: string; value: string; perGame: string }) {
    return (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 text-center">
            <div className="text-[9px] uppercase text-zinc-500 dark:text-zinc-400">{label}</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-white">{value}</div>
            <div className="text-[10px] text-zinc-500">{perGame}</div>
        </div>
    );
}

// --- Scouting Tab ---

function ScoutingTab({
    zapScore,
    zapCategory,
    zapComps,
    zapAnalysis,
    writeups,
}: {
    zapScore?: number | null;
    zapCategory?: string | null;
    zapComps?: string | null;
    zapAnalysis?: string | null;
    writeups?: PlayerProfileCardProps['writeups'];
}) {
    const [expandedWriteup, setExpandedWriteup] = useState<number | null>(null);
    const [activeSource, setActiveSource] = useState(0);

    const hasZap = zapScore != null || zapCategory;
    const hasWriteups = writeups && writeups.length > 0;
    const sources = writeups?.map(w => w.source) || [];

    const zapCategoryColor = (cat: string | null | undefined): string => {
        if (!cat) return 'bg-zinc-500 text-white';
        const c = cat.toLowerCase();
        if (c.includes('elite')) return 'bg-green-500 text-white';
        if (c.includes('good') || c.includes('solid')) return 'bg-blue-500 text-white';
        if (c.includes('average')) return 'bg-amber-500 text-white';
        return 'bg-zinc-500 text-white';
    };

    if (!hasZap && !hasWriteups && !zapAnalysis) {
        return <div className="text-center text-xs text-zinc-500 py-8">No scouting data available</div>;
    }

    const currentWriteup = writeups?.[activeSource];

    return (
        <div className="space-y-4">
            {/* ZAP Badge */}
            {hasZap && (
                <div className="flex items-center gap-2 flex-wrap">
                    {zapCategory && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${zapCategoryColor(zapCategory)}`}>
                            {zapCategory}
                        </span>
                    )}
                    {zapScore != null && (
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            ZAP: {zapScore}
                        </span>
                    )}
                </div>
            )}

            {/* AI Summary from writeups or zapAnalysis */}
            {(currentWriteup?.ai_summary || zapAnalysis) && (
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">AI Analysis</div>
                    {currentWriteup?.ai_confidence != null && (
                        <div className="text-[10px] text-zinc-500">
                            Confidence: {currentWriteup.ai_confidence}/10
                        </div>
                    )}
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {currentWriteup?.ai_summary || zapAnalysis}
                    </p>
                </div>
            )}

            {/* Bull/Bear Case */}
            {(currentWriteup?.ai_bull_case || currentWriteup?.ai_bear_case) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {currentWriteup.ai_bull_case && (
                        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-lg p-3">
                            <div className="text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400 font-semibold mb-1">Bull Case</div>
                            <p className="text-xs text-green-800 dark:text-green-300">{currentWriteup.ai_bull_case}</p>
                        </div>
                    )}
                    {currentWriteup.ai_bear_case && (
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg p-3">
                            <div className="text-[10px] uppercase tracking-wide text-red-600 dark:text-red-400 font-semibold mb-1">Bear Case</div>
                            <p className="text-xs text-red-800 dark:text-red-300">{currentWriteup.ai_bear_case}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Comps */}
            {(currentWriteup?.ai_comps || zapComps) && (
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold mb-1">Player Comparisons</div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">{currentWriteup?.ai_comps || zapComps}</p>
                </div>
            )}

            {/* Writeups - Tabbed by Source */}
            {hasWriteups && (
                <div className="space-y-2">
                    {sources.length > 1 && (
                        <div className="flex gap-1 p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                            {sources.map((source, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveSource(i)}
                                    className={`flex-1 text-[10px] font-semibold py-1.5 rounded-md transition ${
                                        activeSource === i
                                            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                                            : 'text-zinc-500 dark:text-zinc-400'
                                    }`}
                                >
                                    {source}
                                </button>
                            ))}
                        </div>
                    )}

                    {currentWriteup && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                            <button
                                onClick={() => setExpandedWriteup(expandedWriteup === activeSource ? null : activeSource)}
                                className="flex items-center justify-between w-full text-left"
                            >
                                <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400 font-semibold">
                                    Full Writeup — {currentWriteup.source}
                                </span>
                                {expandedWriteup === activeSource ? (
                                    <ChevronUp className="w-3 h-3 text-zinc-400" />
                                ) : (
                                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                                )}
                            </button>
                            {expandedWriteup === activeSource && (
                                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                    {currentWriteup.analysis_text}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
