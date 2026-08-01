'use client';

import React, { useState } from 'react';
import { PlayerComparison } from '@/components/PlayerComparison';
import type { PlayerAdvStats } from '@/lib/advanced-stats';

interface Player {
    id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    years_exp?: number | null;
    fc_value: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    fc_position_rank_sf?: number | null;
    fc_position_rank_1qb?: number | null;
    fc_trend_30_day?: number | null;
    rank_sf_overall?: number | null;
    rank_1qb_overall?: number | null;
    zap_score?: number | null;
    zap_category?: string | null;
    zap_comps?: string | null;
    zap_analysis?: string | null;
    zap_nfl_team?: string | null;
    zap_ai?: { confidence: number | null; summary: string | null; bull_case: string | null; bear_case: string | null; comps: string | null } | null;
    writeups?: { source: string; analysis_text: string; ai_confidence?: number | null; ai_summary?: string | null; ai_bull_case?: string | null; ai_bear_case?: string | null; ai_comps?: string | null }[] | null;
    redraft_auction_value?: number | null;
    [key: string]: any;
}

interface Team {
    id: number;
    name: string;
    owner: string;
    players: Player[];
    positionValues: { QB: number; RB: number; WR: number; TE: number };
    draftPicks: Array<any>;
}

interface DraftPick {
    round: number;
    pick: number;
    teamId: number;
    teamName: string;
    playerId?: string;
    playerName?: string;
}

export interface PlayerDetailModalProps {
    player: Player;
    advancedStats: any[] | null;
    breakout: any | null;
    regression: any[] | null;
    sf: boolean;
    isLive: boolean;
    isUserPick: boolean;
    userTeamId: number | null;
    activeTeams: Team[];
    picks: DraftPick[];
    freeAgents: Player[];
    availablePlayers: Player[];
    customRankingsMap: any;
    draftPlan: any | null;
    rosterFitSort: 'dynasty' | 'auction';
    rosterSlots?: { QB: number; RB: number; WR: number; TE: number; FLEX: number };
    onClose: () => void;
    onDraft: (playerId: string) => void;
    onRosterFitSortChange: (sort: 'dynasty' | 'auction') => void;
}

export function PlayerDetailModal({
    player,
    advancedStats,
    breakout,
    regression,
    sf,
    isLive,
    isUserPick,
    userTeamId,
    activeTeams,
    picks,
    freeAgents,
    availablePlayers,
    customRankingsMap,
    draftPlan,
    rosterFitSort,
    rosterSlots,
    onClose,
    onDraft,
    onRosterFitSortChange,
}: PlayerDetailModalProps) {
    const [showComparison, setShowComparison] = useState(false);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 z-10">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{player.full_name}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${player.position === 'QB' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : player.position === 'RB' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : player.position === 'WR' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}`}>{player.position}</span>
                                <span className="text-sm text-zinc-500">{player.team || 'FA'}</span>
                                {player.zap_nfl_team && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">→ {player.zap_nfl_team}</span>}
                                <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{player.fc_value?.toLocaleString() || '0'}</span>
                            </div>
                        </div>
                        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {/* Quick stats row */}
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-500">
                        {(sf ? player.fc_rank_sf : player.fc_rank_1qb) && <span>FC #{sf ? player.fc_rank_sf : player.fc_rank_1qb}</span>}
                        {(sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb) && <span>{player.position}{sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb}</span>}
                        {player.fc_trend_30_day && <span className={player.fc_trend_30_day > 0 ? 'text-green-600' : 'text-red-600'}>30d: {player.fc_trend_30_day > 0 ? '+' : ''}{player.fc_trend_30_day}</span>}
                        {(sf ? player.rank_sf_overall : player.rank_1qb_overall) && <span>VFF #{sf ? player.rank_sf_overall : player.rank_1qb_overall}</span>}
                        {player.years_exp != null && <span>Yr {player.years_exp}</span>}
                    </div>
                    <button onClick={() => onDraft(player.id)} className="w-full mt-3 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all">
                        {isLive && !isUserPick ? '✓ Select Pick' : '✓ Draft Player'}
                    </button>
                    {/* Roster Fit */}
                    {userTeamId && (() => {
                        const myTeam = activeTeams.find(t => t.id === userTeamId);
                        if (!myTeam) return null;
                        const pos = player.position || '';
                        // Find drafted players from original freeAgents list
                        const draftedPlayers = picks
                            .filter(p => p.teamId === userTeamId && p.playerId)
                            .map(p => freeAgents.find(fa => fa.id === p.playerId) || myTeam.players.find(tp => tp.id === p.playerId))
                            .filter(Boolean) as Player[];
                        const myRoster = [...myTeam.players, ...draftedPlayers];
                        const posPlayers = myRoster.filter(p => p.position === pos).sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
                        const draftedIds = new Set(draftedPlayers.map(p => p.id));
                        const dynastyRank = posPlayers.filter(p => (p.fc_value || 0) > (player.fc_value || 0)).length + 1;
                        const auctionVal = player.redraft_auction_value || 0;
                        const auctionRank = posPlayers.filter(p => (p.redraft_auction_value || 0) > auctionVal).length + 1;
                        const overallRank = myRoster.filter(p => (p.fc_value || 0) > (player.fc_value || 0)).length + 1;

                        // Starter slots for this position
                        const slots = rosterSlots || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 };
                        const starterSlots = (slots[pos as keyof typeof slots] || 1) + (pos !== 'QB' ? (slots.FLEX || 0) * 0.5 : 0);
                        const effectiveStarters = Math.ceil(starterSlots);

                        // Total position value before/after
                        const valueBefore = posPlayers.reduce((s, p) => s + (p.fc_value || 0), 0);
                        const valueAfter = valueBefore + (player.fc_value || 0);
                        const valuePctChange = valueBefore > 0 ? Math.round(((valueAfter - valueBefore) / valueBefore) * 100) : 100;

                        // Sort mode state is at component level (rosterFitSort)
                        const sortedPosPlayers = rosterFitSort === 'auction'
                            ? [...posPlayers].sort((a, b) => (b.redraft_auction_value || 0) - (a.redraft_auction_value || 0))
                            : posPlayers;
                        const insertRank = rosterFitSort === 'auction'
                            ? sortedPosPlayers.filter(p => (p.redraft_auction_value || 0) > auctionVal).length + 1
                            : dynastyRank;

                        return (
                            <div className="mt-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                {/* Summary bar */}
                                <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1 text-xs border-b border-zinc-200 dark:border-zinc-700">
                                    <span className="text-zinc-500">Roster Fit:</span>
                                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">Dynasty {pos}{dynastyRank} <span className="text-zinc-400">of {posPlayers.length + 1}</span></span>
                                    {auctionVal > 0 && <span className="text-zinc-700 dark:text-zinc-300 font-medium">Auction {pos}{auctionRank} <span className="text-zinc-400">(${auctionVal})</span></span>}
                                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">Team #{overallRank} <span className="text-zinc-400">of {myRoster.length + 1}</span></span>
                                    <span className={`font-medium ${valuePctChange > 20 ? 'text-green-600' : valuePctChange > 5 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                                        {pos} room: {valueBefore.toLocaleString()} → {valueAfter.toLocaleString()} (+{valuePctChange}%)
                                    </span>
                                </div>

                                {/* Position depth chart */}
                                {posPlayers.length > 0 && (
                                    <div className="px-3 py-2">
                                        {/* Header with sort toggle */}
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="text-[10px] font-semibold text-zinc-500 uppercase">Your {pos}s</div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => onRosterFitSortChange('dynasty')}
                                                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${rosterFitSort === 'dynasty' ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                >Dynasty</button>
                                                <button
                                                    onClick={() => onRosterFitSortChange('auction')}
                                                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${rosterFitSort === 'auction' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'text-zinc-400 hover:text-zinc-600'}`}
                                                >Auction</button>
                                            </div>
                                        </div>

                                        {/* Column headers */}
                                        <div className="flex items-center gap-2 text-[9px] text-zinc-400 uppercase mb-1 px-1">
                                            <span className="w-4">#</span>
                                            <span className="flex-1">Player</span>
                                            <span className="w-8 text-right">Age</span>
                                            <span className="w-14 text-right">Dynasty</span>
                                            <span className="w-10 text-right">Auction</span>
                                        </div>

                                        {/* Player rows */}
                                        <div className="space-y-0.5">
                                            {(() => {
                                                const combined: { player: Player; isNew: boolean }[] =
                                                    sortedPosPlayers.map(p => ({ player: p, isNew: false }));
                                                combined.splice(insertRank - 1, 0, { player: player as Player, isNew: true });

                                                return combined.map((item, i) => {
                                                    const isStarter = i < effectiveStarters;
                                                    const isBenchLine = i === effectiveStarters && effectiveStarters < combined.length;

                                                    return (
                                                        <div key={item.isNew ? 'new' : item.player.id}>
                                                            {isBenchLine && (
                                                                <div className="flex items-center gap-2 py-0.5 my-0.5">
                                                                    <div className="flex-1 border-t border-dashed border-zinc-300 dark:border-zinc-600" />
                                                                    <span className="text-[8px] text-zinc-400 uppercase">Bench</span>
                                                                    <div className="flex-1 border-t border-dashed border-zinc-300 dark:border-zinc-600" />
                                                                </div>
                                                            )}
                                                            <div className={`flex items-center gap-2 text-xs py-0.5 px-1 rounded ${
                                                                item.isNew ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800' : ''
                                                            }`}>
                                                                <span className={`font-mono w-4 ${isStarter ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400'}`}>{i + 1}</span>
                                                                <span className={`flex-1 truncate ${item.isNew ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                                    {item.player.full_name}
                                                                    {item.isNew && <span className="text-[9px] ml-1 text-indigo-500">NEW</span>}
                                                                    {!item.isNew && draftedIds.has(item.player.id) && <span className="text-[9px] ml-1 text-emerald-500">DRAFTED</span>}
                                                                </span>
                                                                <span className="text-zinc-400 font-mono w-8 text-right text-[10px]">
                                                                    {item.player.years_exp != null ? `Yr${item.player.years_exp}` : '—'}
                                                                </span>
                                                                <span className={`font-mono w-14 text-right ${rosterFitSort === 'dynasty' && item.isNew ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                                                    {(item.player.fc_value || 0).toLocaleString()}
                                                                </span>
                                                                <span className={`font-mono w-10 text-right ${rosterFitSort === 'auction' && item.isNew ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : 'text-amber-600 dark:text-amber-400'}`}>
                                                                    {item.player.redraft_auction_value ? `$${item.player.redraft_auction_value}` : '—'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                    {/* Advanced Stats */}
                    {advancedStats && advancedStats.length > 0 && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs font-semibold text-zinc-500 uppercase">Advanced Stats</div>
                                <div className="flex gap-1.5">
                                    {breakout && breakout.verdict === 'breakout' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">📈 BREAKOUT</span>
                                    )}
                                    {breakout && breakout.verdict === 'trending_up' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">↗ TRENDING UP</span>
                                    )}
                                    {breakout && breakout.verdict === 'declining' && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">↘ DECLINING</span>
                                    )}
                                    {regression && regression.length > 0 && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">⚠️ REGRESSION RISK</span>
                                    )}
                                </div>
                            </div>
                            {/* Breakout signals */}
                            {breakout && breakout.signals && breakout.signals.length > 0 && (
                                <div className="mb-3 flex flex-wrap gap-1.5">
                                    {breakout.signals.slice(0, 4).map((s: any, i: number) => (
                                        <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${s.changePct > 0 ? 'bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300'}`}>
                                            {s.label}: {s.changePct > 0 ? '+' : ''}{s.changePct}%
                                        </span>
                                    ))}
                                </div>
                            )}
                            {/* Regression flags */}
                            {regression && regression.length > 0 && (
                                <div className="mb-3 space-y-1">
                                    {regression.map((f: any, i: number) => (
                                        <div key={i} className="text-[10px] text-amber-700 dark:text-amber-300">⚠️ {f.reason}</div>
                                    ))}
                                </div>
                            )}
                            {advancedStats.map((s: any) => (
                                <div key={s.season} className="mb-3 last:mb-0">
                                    <div className="text-[10px] font-bold text-zinc-400 mb-1.5">{s.season}-{String(s.season + 1).slice(2)} · {s.games_played || '—'} games · {s.team}</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                        {/* Position-specific key metrics first */}
                                        {player.position === 'QB' && (
                                            <>
                                                {s.completion_pct_above_expected && <div><span className="text-zinc-500">CPOE:</span> <span className={`font-mono font-medium ${parseFloat(s.completion_pct_above_expected) > 0 ? 'text-green-600' : 'text-red-500'}`}>{parseFloat(s.completion_pct_above_expected) > 0 ? '+' : ''}{parseFloat(s.completion_pct_above_expected).toFixed(1)}%</span></div>}
                                                {s.avg_time_to_throw && <div><span className="text-zinc-500">Time to Throw:</span> <span className="font-mono">{parseFloat(s.avg_time_to_throw).toFixed(2)}s</span></div>}
                                                {s.aggressiveness && <div><span className="text-zinc-500">Aggressiveness:</span> <span className="font-mono">{parseFloat(s.aggressiveness).toFixed(1)}%</span></div>}
                                                {s.passing_yards && <div><span className="text-zinc-500">Pass Yds:</span> <span className="font-mono">{parseInt(s.passing_yards).toLocaleString()}</span></div>}
                                                {s.passing_tds && <div><span className="text-zinc-500">Pass TD:</span> <span className="font-mono">{s.passing_tds}</span></div>}
                                                {s.rushing_yards && parseInt(s.rushing_yards) > 100 && <div><span className="text-zinc-500">Rush Yds:</span> <span className="font-mono">{parseInt(s.rushing_yards).toLocaleString()}</span></div>}
                                            </>
                                        )}
                                        {player.position === 'WR' && (
                                            <>
                                                {s.avg_separation && <div><span className="text-zinc-500">Separation:</span> <span className="font-mono font-medium">{parseFloat(s.avg_separation).toFixed(2)} yds</span></div>}
                                                {s.avg_yac_above_expectation && <div><span className="text-zinc-500">YAC vs Exp:</span> <span className={`font-mono font-medium ${parseFloat(s.avg_yac_above_expectation) > 0 ? 'text-green-600' : 'text-red-500'}`}>{parseFloat(s.avg_yac_above_expectation) > 0 ? '+' : ''}{parseFloat(s.avg_yac_above_expectation).toFixed(1)}</span></div>}
                                                {s.target_share && <div><span className="text-zinc-500">Target Share:</span> <span className="font-mono">{(parseFloat(s.target_share) * 100).toFixed(1)}%</span></div>}
                                                {s.wopr && <div><span className="text-zinc-500">WOPR:</span> <span className="font-mono">{parseFloat(s.wopr).toFixed(3)}</span></div>}
                                                {s.receiving_yards && <div><span className="text-zinc-500">Rec Yds:</span> <span className="font-mono">{parseInt(s.receiving_yards).toLocaleString()}</span></div>}
                                                {s.receptions && <div><span className="text-zinc-500">Rec:</span> <span className="font-mono">{s.receptions}/{s.targets} tgt</span></div>}
                                            </>
                                        )}
                                        {player.position === 'RB' && (
                                            <>
                                                {s.rush_yards_over_expected_per_att && <div><span className="text-zinc-500">RYOE/Att:</span> <span className={`font-mono font-medium ${parseFloat(s.rush_yards_over_expected_per_att) > 0 ? 'text-green-600' : 'text-red-500'}`}>{parseFloat(s.rush_yards_over_expected_per_att) > 0 ? '+' : ''}{parseFloat(s.rush_yards_over_expected_per_att).toFixed(2)}</span></div>}
                                                {s.rush_efficiency && <div><span className="text-zinc-500">Efficiency:</span> <span className="font-mono">{parseFloat(s.rush_efficiency).toFixed(2)}</span></div>}
                                                {s.rushing_yards && <div><span className="text-zinc-500">Rush Yds:</span> <span className="font-mono">{parseInt(s.rushing_yards).toLocaleString()}</span></div>}
                                                {s.carries && <div><span className="text-zinc-500">Carries:</span> <span className="font-mono">{s.carries}</span></div>}
                                                {s.target_share && <div><span className="text-zinc-500">Target Share:</span> <span className="font-mono">{(parseFloat(s.target_share) * 100).toFixed(1)}%</span></div>}
                                                {s.receptions && <div><span className="text-zinc-500">Rec:</span> <span className="font-mono">{s.receptions}/{s.targets} tgt</span></div>}
                                            </>
                                        )}
                                        {player.position === 'TE' && (
                                            <>
                                                {s.avg_separation && <div><span className="text-zinc-500">Separation:</span> <span className="font-mono font-medium">{parseFloat(s.avg_separation).toFixed(2)} yds</span></div>}
                                                {s.target_share && <div><span className="text-zinc-500">Target Share:</span> <span className="font-mono">{(parseFloat(s.target_share) * 100).toFixed(1)}%</span></div>}
                                                {s.receiving_yards && <div><span className="text-zinc-500">Rec Yds:</span> <span className="font-mono">{parseInt(s.receiving_yards).toLocaleString()}</span></div>}
                                                {s.receptions && <div><span className="text-zinc-500">Rec:</span> <span className="font-mono">{s.receptions}/{s.targets} tgt</span></div>}
                                                {s.avg_yac_above_expectation && <div><span className="text-zinc-500">YAC vs Exp:</span> <span className={`font-mono font-medium ${parseFloat(s.avg_yac_above_expectation) > 0 ? 'text-green-600' : 'text-red-500'}`}>{parseFloat(s.avg_yac_above_expectation) > 0 ? '+' : ''}{parseFloat(s.avg_yac_above_expectation).toFixed(1)}</span></div>}
                                            </>
                                        )}
                                        {/* Common metrics */}
                                        {s.offense_snap_pct && <div><span className="text-zinc-500">Snap %:</span> <span className="font-mono">{(parseFloat(s.offense_snap_pct) * 100).toFixed(0)}%</span></div>}
                                        {s.fantasy_points_ppr && <div><span className="text-zinc-500">PPR Pts:</span> <span className="font-mono font-medium">{parseFloat(s.fantasy_points_ppr).toFixed(1)}</span></div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ZAP / Late Round */}
                    {player.zap_analysis && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Late Round</div>
                            {player.zap_ai?.summary && (
                                <div className="mb-3 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        {player.zap_ai.confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${player.zap_ai.confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : player.zap_ai.confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{player.zap_ai.confidence}/10</span>}
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{player.zap_ai.summary}</span>
                                    </div>
                                    {player.zap_ai.comps && <div className="text-[11px] text-zinc-500">🔄 {player.zap_ai.comps}</div>}
                                    <div className="flex gap-3 text-[11px]">
                                        {player.zap_ai.bull_case && <div className="text-green-700 dark:text-green-400">📈 {player.zap_ai.bull_case}</div>}
                                        {player.zap_ai.bear_case && <div className="text-red-700 dark:text-red-400">📉 {player.zap_ai.bear_case}</div>}
                                    </div>
                                </div>
                            )}
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-xs font-medium text-zinc-500">{player.zap_category}{player.zap_score ? ` · ZAP: ${player.zap_score.toFixed(1)}` : ''}</span>
                                {player.zap_comps && <span className="text-xs text-zinc-400">Comps: {player.zap_comps}</span>}
                            </div>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{player.zap_analysis}</p>
                        </div>
                    )}
                    {/* Writeups */}
                    {player.writeups?.map(w => (
                        <div key={w.source} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                            <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">{w.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                            {w.ai_summary && (
                                <div className="mb-3 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        {w.ai_confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.ai_confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : w.ai_confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{w.ai_confidence}/10</span>}
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{w.ai_summary}</span>
                                    </div>
                                    {w.ai_comps && <div className="text-[11px] text-zinc-500">🔄 {w.ai_comps}</div>}
                                    <div className="flex gap-3 text-[11px]">
                                        {w.ai_bull_case && <div className="text-green-700 dark:text-green-400">📈 {w.ai_bull_case}</div>}
                                        {w.ai_bear_case && <div className="text-red-700 dark:text-red-400">📉 {w.ai_bear_case}</div>}
                                    </div>
                                </div>
                            )}
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{w.analysis_text}</p>
                        </div>
                    ))}
                    {/* Player Comparison */}
                    {showComparison && advancedStats && advancedStats.length > 0 && player && (
                        <PlayerComparison
                            playerA={{ id: player.id, full_name: player.full_name, position: player.position }}
                            playerAStats={advancedStats[0] as unknown as PlayerAdvStats}
                            allPlayers={freeAgents.map(p => ({ id: p.id, full_name: p.full_name, position: p.position }))}
                            onClose={() => setShowComparison(false)}
                        />
                    )}
                    {/* Draft action */}
                    <div className="flex justify-end gap-3 pt-2">
                        {advancedStats && advancedStats.length > 0 && !showComparison && (
                            <button onClick={() => setShowComparison(true)} className="px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors">Compare</button>
                        )}
                        <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
