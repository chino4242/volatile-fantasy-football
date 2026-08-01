'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { BasePlayer as Player } from '@/types/player';

interface TeamData {
    rosterId: number;
    ownerName: string;
    players: Player[];
}

interface Props {
    myTeam: TeamData;
    allTeams: TeamData[];
    format: '1qb' | 'sf';
}

const WINDOW_CONFIG = {
    competing: { label: 'Competing', emoji: '🏆', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
    rebuilding: { label: 'Rebuilding', emoji: '🔨', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
    balanced: { label: 'Balanced', emoji: '⚖️', color: 'text-zinc-400', bg: 'bg-zinc-500/10 border-zinc-500/30' },
};

function getGrade(value: number, leagueValues: number[]): { grade: string; color: string } {
    const sorted = [...leagueValues].sort((a, b) => b - a);
    const rank = sorted.indexOf(value) + 1 || sorted.length;
    const pct = rank / sorted.length;
    if (pct <= 0.1) return { grade: 'A+', color: 'text-emerald-400' };
    if (pct <= 0.25) return { grade: 'A', color: 'text-emerald-400' };
    if (pct <= 0.4) return { grade: 'B', color: 'text-sky-400' };
    if (pct <= 0.6) return { grade: 'C', color: 'text-amber-400' };
    if (pct <= 0.8) return { grade: 'D', color: 'text-orange-400' };
    return { grade: 'F', color: 'text-red-400' };
}

export default function TeamHealthDashboard({ myTeam, allTeams, format }: Props) {
    const [expanded, setExpanded] = useState(true);
    const sf = format === 'sf';

    const analysis = useMemo(() => {
        const myPlayers = myTeam.players.filter(p => p.position !== 'PICK');

        // Dynasty power rank
        const teamDynValues = allTeams.map(t => t.players.filter(p => p.position !== 'PICK').reduce((s, p) => s + (p.fc_value || 0), 0));
        const myDynValue = myPlayers.reduce((s, p) => s + (p.fc_value || 0), 0);
        const dynRank = teamDynValues.filter(v => v > myDynValue).length + 1;

        // Redraft power rank (sum of inverse redraft ranks for top players)
        const rdScore = (players: Player[]) => players.filter(p => p.redraft_rank_overall).reduce((s, p) => s + Math.max(0, 5000 - (p.redraft_rank_overall! - 1) * 16), 0);
        const teamRdScores = allTeams.map(t => rdScore(t.players.filter(p => p.position !== 'PICK')));
        const myRdScore = rdScore(myPlayers);
        const rdRank = teamRdScores.filter(v => v > myRdScore).length + 1;

        // Championship window
        let rdBetter = 0, dynBetter = 0;
        myPlayers.forEach(p => {
            const fcRank = sf ? p.fc_rank_sf : p.fc_rank_1qb;
            const rdRank = p.redraft_rank_overall;
            if (fcRank && rdRank) {
                if (rdRank < fcRank - 10) rdBetter++;
                if (fcRank < rdRank - 10) dynBetter++;
            }
        });
        const window = rdBetter > dynBetter + 2 ? 'competing' : dynBetter > rdBetter + 2 ? 'rebuilding' : 'balanced';

        // Positional grades
        const positions = ['QB', 'RB', 'WR', 'TE'] as const;
        const posGrades: Record<string, { grade: string; color: string; value: number; leagueAvg: number }> = {};
        positions.forEach(pos => {
            const myPosVal = myPlayers.filter(p => p.position === pos).reduce((s, p) => s + (p.fc_value || 0), 0);
            const leaguePosVals = allTeams.map(t => t.players.filter(p => p.position === pos).reduce((s, p) => s + (p.fc_value || 0), 0));
            const leagueAvg = leaguePosVals.reduce((s, v) => s + v, 0) / leaguePosVals.length;
            posGrades[pos] = { ...getGrade(myPosVal, leaguePosVals), value: myPosVal, leagueAvg: Math.round(leagueAvg) };
        });

        // Age distribution
        const ageBuckets = { '21-24': 0, '25-27': 0, '28-30': 0, '31+': 0 };
        let totalAge = 0, ageCount = 0;
        myPlayers.forEach(p => {
            const age = p.age;
            if (!age) return;
            totalAge += age; ageCount++;
            if (age <= 24) ageBuckets['21-24']++;
            else if (age <= 27) ageBuckets['25-27']++;
            else if (age <= 30) ageBuckets['28-30']++;
            else ageBuckets['31+']++;
        });
        const avgAge = ageCount > 0 ? (totalAge / ageCount).toFixed(1) : '—';

        // Starter vs bench quality
        const sorted = [...myPlayers].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
        const starterCount = 9; // approximate
        const starterValue = sorted.slice(0, starterCount).reduce((s, p) => s + (p.fc_value || 0), 0);
        const benchValue = sorted.slice(starterCount).reduce((s, p) => s + (p.fc_value || 0), 0);

        return { dynRank, rdRank, window, posGrades, ageBuckets, avgAge, starterValue, benchValue, myDynValue, teamCount: allTeams.length };
    }, [myTeam, allTeams, format]);

    const w = WINDOW_CONFIG[analysis.window as keyof typeof WINDOW_CONFIG];

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden mb-4">
            <button onClick={() => setExpanded(!expanded)} className="w-full p-4 flex items-center justify-between text-left">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Team Health</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${w.bg} ${w.color}`}>{w.emoji} {w.label}</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-4">
                    {/* Power Rankings */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-purple-50/50 dark:bg-purple-950/20 rounded-lg p-3 text-center">
                            <div className="text-[10px] font-bold text-purple-500 uppercase">Dynasty Rank</div>
                            <div className="text-2xl font-black text-purple-600 dark:text-purple-400">#{analysis.dynRank}</div>
                            <div className="text-[10px] text-zinc-500">of {analysis.teamCount} teams</div>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-3 text-center">
                            <div className="text-[10px] font-bold text-amber-500 uppercase">Redraft Rank</div>
                            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">#{analysis.rdRank}</div>
                            <div className="text-[10px] text-zinc-500">of {analysis.teamCount} teams</div>
                        </div>
                    </div>

                    {/* Positional Grades */}
                    <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Position Grades</div>
                        <div className="grid grid-cols-4 gap-2">
                            {Object.entries(analysis.posGrades).map(([pos, data]) => (
                                <div key={pos} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                                    <div className="text-[10px] font-bold text-zinc-400">{pos}</div>
                                    <div className={`text-xl font-black ${data.color}`}>{data.grade}</div>
                                    <div className="text-[9px] text-zinc-500 font-mono">{data.value.toLocaleString()}</div>
                                    <div className="text-[8px] text-zinc-600">avg: {data.leagueAvg.toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Age Distribution */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Age Distribution</span>
                            <span className="text-[10px] text-zinc-500">Avg: {analysis.avgAge}</span>
                        </div>
                        <div className="flex gap-1.5">
                            {Object.entries(analysis.ageBuckets).map(([range, count]) => {
                                const maxCount = Math.max(...Object.values(analysis.ageBuckets), 1);
                                const height = Math.max(8, (count / maxCount) * 48);
                                return (
                                    <div key={range} className="flex-1 flex flex-col items-center gap-1">
                                        <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
                                            <div className={`w-full rounded-t ${range === '21-24' ? 'bg-emerald-500' : range === '25-27' ? 'bg-sky-500' : range === '28-30' ? 'bg-amber-500' : 'bg-red-500'}`}
                                                style={{ height }} />
                                        </div>
                                        <div className="text-[9px] font-bold text-zinc-500">{count}</div>
                                        <div className="text-[8px] text-zinc-600">{range}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Starter vs Bench */}
                    <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Roster Depth</div>
                        <div className="flex gap-2">
                            <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
                                <div className="text-[9px] text-zinc-500">Starters</div>
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">{analysis.starterValue.toLocaleString()}</div>
                            </div>
                            <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
                                <div className="text-[9px] text-zinc-500">Bench</div>
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">{analysis.benchValue.toLocaleString()}</div>
                            </div>
                            <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5">
                                <div className="text-[9px] text-zinc-500">Total</div>
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono">{analysis.myDynValue.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
