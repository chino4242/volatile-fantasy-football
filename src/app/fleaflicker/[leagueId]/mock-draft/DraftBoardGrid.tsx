'use client';

import React from 'react';

interface DraftBoardGridProps {
    picks: any[];
    teams: any[];
    activeTeams: any[];
    draftBottomTab: 'board' | 'roster' | 'needs' | 'scarcity';
    setDraftBottomTab: (tab: 'board' | 'roster' | 'needs' | 'scarcity') => void;
    currentPickIndex: number;
    userTeamId: number | null;
    draftStarted: boolean;
    isDraftComplete: boolean;
    ROUNDS: number;
    calculatePositionalNeed: (teamId: number) => Record<string, number>;
}

export default function DraftBoardGrid({
    picks,
    teams,
    activeTeams,
    draftBottomTab,
    setDraftBottomTab,
    currentPickIndex,
    userTeamId,
    draftStarted,
    isDraftComplete,
    ROUNDS,
    calculatePositionalNeed,
}: DraftBoardGridProps) {
    if (!draftStarted || isDraftComplete) return null;

    return (
        <div className="mb-6">
            <div className="flex items-center gap-1 mb-3">
                <button
                    onClick={() => setDraftBottomTab('board')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${draftBottomTab === 'board' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    Draft Board
                </button>
                <button
                    onClick={() => setDraftBottomTab('roster')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${draftBottomTab === 'roster' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    Your Roster
                </button>
                <button
                    onClick={() => setDraftBottomTab('needs')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${draftBottomTab === 'needs' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                >
                    League Needs
                </button>
            </div>

            {draftBottomTab === 'board' && (
            <div className="grid grid-cols-1 gap-4 sm:gap-6">
                {/* Draft Board */}
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        {(() => {
                            const numTeams = teams.length;
                            // Get unique team IDs from round 1 pick order (slot-based)
                            const round1 = picks.filter(p => p.round === 1).sort((a, b) => a.pick - b.pick);
                            const posBg = (pos?: string) => pos === 'QB' ? 'bg-red-100 dark:bg-red-900/30' : pos === 'RB' ? 'bg-blue-100 dark:bg-blue-900/30' : pos === 'WR' ? 'bg-green-100 dark:bg-green-900/30' : pos === 'TE' ? 'bg-orange-100 dark:bg-orange-900/30' : '';
                            const teamNames = new Map(teams.map((t: any) => [t.id, t.name]));

                            return (
                                <table className="w-full text-[10px] sm:text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                                            <th className="px-1 py-2 text-zinc-500 font-medium sticky left-0 bg-zinc-50 dark:bg-zinc-950/50 z-10 w-8"></th>
                                            {round1.map((p, i) => (
                                                <th key={i} className={`px-1 py-2 text-center font-medium truncate max-w-[80px] ${p.teamId === userTeamId ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`}>
                                                    {(p.teamName || '').split(' ').pop()?.slice(0, 8)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: ROUNDS }, (_, r) => r + 1).map(round => {
                                            const roundPicks = picks.filter(p => p.round === round).sort((a, b) => a.pick - b.pick);
                                            return (
                                                <tr key={round} className="border-t border-zinc-100 dark:border-zinc-800">
                                                    <td className="px-1 py-1 text-zinc-400 font-medium text-center sticky left-0 bg-white dark:bg-zinc-900 z-10">R{round}</td>
                                                    {roundPicks.map((pick, slotIdx) => {
                                                        const pickIdx = picks.indexOf(pick);
                                                        const isCurrent = pickIdx === currentPickIndex;
                                                        const isUser = pick.teamId === userTeamId;
                                                        const ownerChanged = round1[slotIdx] && pick.teamId !== round1[slotIdx].teamId;
                                                        return (
                                                            <td key={`${round}-${slotIdx}`} className="px-0.5 py-0.5">
                                                                <div className={`rounded px-1 py-1 text-center min-h-[36px] flex flex-col justify-center ${
                                                                    isCurrent ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' :
                                                                    pick.playerId ? posBg(pick.playerPosition) :
                                                                    isUser ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                                                                }`}>
                                                                    {pick.playerName ? (
                                                                        <>
                                                                            <div className={`font-medium truncate ${isUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-900 dark:text-zinc-100'}`}>{pick.playerName.split(' ').pop()}</div>
                                                                            <div className="text-zinc-400">{pick.playerPosition}</div>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            {ownerChanged && <div className="text-[9px] text-amber-600 dark:text-amber-400 truncate">{(teamNames.get(pick.teamId) || '').split(' ').pop()?.slice(0, 6)}</div>}
                                                                            <div className="text-zinc-300 dark:text-zinc-700">{round}.{String(pick.pick).padStart(2, '0')}</div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                </div>

            </div>
            )}

            {draftBottomTab === 'roster' && userTeamId !== null && draftStarted && (
                <div>
                {/* Your Roster Sidebar */}
                {userTeamId !== null && draftStarted && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                            Your Roster
                        </h3>
                        <div className="space-y-4">
                            {/* Position Groups */}
                            {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                                const userTeam = activeTeams.find((t: any) => t.id === userTeamId);
                                const existingPlayers = userTeam?.players.filter((p: any) => p.position === pos) || [];
                                const draftedPlayers = picks
                                    .filter(p => p.teamId === userTeamId && p.playerId && p.playerPosition === pos)
                                    .map(p => ({
                                        full_name: p.playerName!,
                                        fc_value: p.playerValue || 0,
                                    }));
                                const allPlayers = [...existingPlayers, ...draftedPlayers];
                                const totalValue = allPlayers.reduce((sum: number, p: any) => sum + (p.fc_value || 0), 0);

                                return (
                                    <div key={pos}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-xs font-semibold text-zinc-500 uppercase">
                                                {pos} ({allPlayers.length})
                                            </div>
                                            <div className="text-xs font-mono font-semibold text-green-600 dark:text-green-400">
                                                {totalValue.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            {allPlayers.length === 0 ? (
                                                <div className="text-xs text-zinc-400 italic">None</div>
                                            ) : (
                                                allPlayers
                                                    .sort((a: any, b: any) => (b.fc_value || 0) - (a.fc_value || 0))
                                                    .map((player: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className="flex justify-between text-xs text-zinc-700 dark:text-zinc-300"
                                                        >
                                                            <span className="truncate">{player.full_name}</span>
                                                            <span className="ml-2 text-zinc-500">
                                                                {(player.fc_value || 0).toFixed(0)}
                                                            </span>
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                </div>
            )}

            {draftBottomTab === 'needs' && draftStarted && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 overflow-x-auto">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">League Positional Needs</h3>
                    <p className="text-[10px] text-zinc-500 mb-3">Higher intensity = team is more likely to draft that position. Use this to predict who&apos;ll be available at your next pick.</p>
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-200 dark:border-zinc-700">
                                <th className="text-left py-2 pr-3 text-zinc-500 font-medium">Team</th>
                                <th className="text-center py-2 px-2 text-zinc-500 font-medium w-16">QB</th>
                                <th className="text-center py-2 px-2 text-zinc-500 font-medium w-16">RB</th>
                                <th className="text-center py-2 px-2 text-zinc-500 font-medium w-16">WR</th>
                                <th className="text-center py-2 px-2 text-zinc-500 font-medium w-16">TE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                // Sort teams by next pick order (who picks soonest)
                                const teamsWithNeeds = activeTeams.map((team: any) => {
                                    const needs = calculatePositionalNeed(team.id);
                                    const nextPickIdx = picks.findIndex((p, i) => i >= currentPickIndex && p.teamId === team.id && !p.playerId);
                                    return { team, needs, nextPickIdx };
                                }).sort((a, b) => {
                                    if (a.nextPickIdx === -1) return 1;
                                    if (b.nextPickIdx === -1) return -1;
                                    return a.nextPickIdx - b.nextPickIdx;
                                });

                                const getNeedColor = (need: number) => {
                                    if (need >= 0.7) return 'bg-red-500 text-white';
                                    if (need >= 0.5) return 'bg-orange-400 text-white';
                                    if (need >= 0.3) return 'bg-yellow-300 text-yellow-900';
                                    if (need >= 0.15) return 'bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300';
                                    return 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500';
                                };

                                return teamsWithNeeds.map(({ team, needs, nextPickIdx }) => {
                                    const isUser = team.id === userTeamId;
                                    const picksAway = nextPickIdx >= 0 ? nextPickIdx - currentPickIndex : null;
                                    return (
                                        <tr key={team.id} className={`border-b border-zinc-100 dark:border-zinc-800 ${isUser ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}>
                                            <td className="py-2 pr-3">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`font-medium truncate max-w-[100px] sm:max-w-[140px] ${isUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                                        {team.name.split(' ').pop() || team.name}
                                                    </span>
                                                    {picksAway !== null && picksAway >= 0 && (
                                                        <span className="text-[9px] text-zinc-400 flex-shrink-0">
                                                            {picksAway === 0 ? 'OTC' : `${picksAway}`}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => (
                                                <td key={pos} className="py-2 px-1 text-center">
                                                    <div className={`inline-flex items-center justify-center w-10 h-6 rounded text-[10px] font-bold ${getNeedColor(needs[pos] || 0)}`}>
                                                        {Math.round((needs[pos] || 0) * 100)}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                    </table>
                    <div className="flex items-center gap-3 mt-3 text-[9px] text-zinc-400">
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-500" />High need</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-400" />Medium</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-300" />Moderate</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-200 dark:bg-green-900/40" />Low</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-zinc-100 dark:bg-zinc-800" />Filled</span>
                    </div>
                </div>
            )}

        </div>
    );
}

interface PickHistoryLogProps {
    picks: any[];
    currentPickIndex: number;
    userTeamId: number | null;
    draftStarted: boolean;
}

export function PickHistoryLog({
    picks,
    currentPickIndex,
    userTeamId,
    draftStarted,
}: PickHistoryLogProps) {
    if (!draftStarted || currentPickIndex <= 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 mb-4 sm:mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Recent Picks</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
                {picks.slice(0, currentPickIndex).reverse().slice(0, 12).reverse().map((p, i) => {
                    const isUser = p.teamId === userTeamId;
                    const hasCpuReason = !isUser && p.pickReason;
                    // Parse reason into structured parts for display
                    const reasonParts = p.pickReason?.split(' | ') || [];
                    const shortReason = reasonParts.length >= 2 ? reasonParts[1] : null;
                    const needPart = reasonParts.find((r: string) => r.includes('need:'));
                    const scorePart = reasonParts.find((r: string) => r.startsWith('Score:'));
                    return (
                        <div
                            key={i}
                            className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs transition-all cursor-pointer group ${isUser ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
                            title={p.pickReason || undefined}
                        >
                            <div className="text-zinc-400">{p.round}.{String(p.pick).padStart(2, '0')}</div>
                            <div className="font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{p.playerName}</div>
                            <div className="text-zinc-500">{p.teamName} · <span className={`font-medium ${p.playerPosition === 'QB' ? 'text-red-600' : p.playerPosition === 'RB' ? 'text-blue-600' : p.playerPosition === 'WR' ? 'text-green-600' : 'text-orange-600'}`}>{p.playerPosition}</span></div>
                            {hasCpuReason && (
                                <div className="mt-1 pt-1 border-t border-zinc-200 dark:border-zinc-700">
                                    <div className="text-[9px] text-zinc-400 flex items-center gap-1">
                                        {shortReason && <span className="bg-zinc-200 dark:bg-zinc-600 px-1 rounded text-zinc-600 dark:text-zinc-300">{shortReason}</span>}
                                        {needPart && <span>{needPart.replace(' need:', '').trim()}</span>}
                                    </div>
                                    {scorePart && (
                                        <div className="text-[9px] text-indigo-500 dark:text-indigo-400 font-mono mt-0.5">{scorePart}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
