'use client';

import { useState } from 'react';

interface PlayerData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    rank_1qb_overall: number | null;
    rank_1qb_pos: number | null;
    rank_1qb_tier: number | null;
    rank_sf_overall: number | null;
    rank_sf_pos: number | null;
    rank_sf_tier: number | null;
}

interface TeamRosterTableProps {
    players: PlayerData[];
}

export function TeamRosterTable({ players }: TeamRosterTableProps) {
    const [show1Qb, setShow1Qb] = useState(false);
    const [showSf, setShowSf] = useState(false);

    const getValueColorClass = (value: number | null) => {
        if (!value) return "text-zinc-900 dark:text-zinc-100";
        if (value >= 7500) return "bg-fuchsia-100/80 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-600/20";
        if (value >= 5000) return "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20";
        if (value >= 2500) return "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-1 ring-inset ring-emerald-600/20";
        if (value >= 1000) return "bg-sky-100/80 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300 ring-1 ring-inset ring-sky-600/20";
        return "text-zinc-500 dark:text-zinc-400";
    };

    const getTierColorClass = (tier: number | null) => {
        if (!tier) return "text-zinc-500 dark:text-zinc-400";
        if (tier === 1) return "text-yellow-600 dark:text-yellow-400 font-bold";
        if (tier === 2) return "text-slate-500 dark:text-slate-300 font-semibold";
        if (tier === 3) return "text-amber-700/80 dark:text-amber-600/80 font-medium";
        return "text-zinc-500 dark:text-zinc-400";
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center px-2 sm:px-0">
                <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Columns:</span>
                <button
                    onClick={() => setShow1Qb(!show1Qb)}
                    className={`px-4 py-3 min-h-[44px] min-w-[44px] rounded-full text-xs font-medium transition-colors border ${show1Qb
                        ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-700'
                        }`}
                >
                    1QB Rankings
                </button>
                <button
                    onClick={() => setShowSf(!showSf)}
                    className={`px-4 py-3 min-h-[44px] min-w-[44px] rounded-full text-xs font-medium transition-colors border ${showSf
                        ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
                        : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700 dark:hover:bg-zinc-700'
                        }`}
                >
                    Superflex Rankings
                </button>
            </div>

            <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-x-auto -mx-4 sm:mx-0">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                        <tr>
                            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Player</th>
                            <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Position</th>
                            <th className="px-2 sm:px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Team</th>
                            <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">Market Value</th>

                            {show1Qb && (
                                <>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20">1QB Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20 hidden md:table-cell">1QB Pos Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-blue-50/50 dark:bg-blue-950/20 hidden lg:table-cell">1QB Tier</th>
                                </>
                            )}

                            {showSf && (
                                <>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20">SF Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20 hidden md:table-cell">SF Pos Rank</th>
                                    <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider bg-purple-50/50 dark:bg-purple-950/20 hidden lg:table-cell">SF Tier</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {players.map((player) => (
                            <tr key={player.sleeper_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                                    <div className="text-sm sm:text-base font-medium text-zinc-900 dark:text-zinc-100">
                                        {player.full_name}
                                    </div>
                                    <div className="sm:hidden text-[11px] text-zinc-400 mt-0.5">
                                        {player.position} · {player.team || 'FA'}
                                    </div>
                                </td>
                                <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    {player.position}
                                </td>
                                <td className="px-2 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    {player.team || 'FA'}
                                </td>
                                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right">
                                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-sm sm:text-base font-mono font-medium ${getValueColorClass(player.fc_value)}`}>
                                        {player.fc_value?.toLocaleString() || '-'}
                                    </span>
                                </td>

                                {/* 1QB Columns */}
                                {show1Qb && (
                                    <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right bg-blue-50/20 dark:bg-blue-950/10">
                                            <div className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                                {player.rank_1qb_overall || '-'}
                                            </div>
                                            <div className="md:hidden text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                                                {player.rank_1qb_pos ? `${player.position}${player.rank_1qb_pos}` : '-'}
                                                <span className="mx-1">•</span>
                                                <span className={player.rank_1qb_tier ? getTierColorClass(player.rank_1qb_tier) : ""}>
                                                    {player.rank_1qb_tier ? `T${player.rank_1qb_tier}` : '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base text-zinc-500 dark:text-zinc-400 bg-blue-50/20 dark:bg-blue-950/10 hidden md:table-cell">
                                            {player.rank_1qb_pos ? `${player.position}${player.rank_1qb_pos}` : '-'}
                                        </td>
                                        <td className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base bg-blue-50/20 dark:bg-blue-950/10 hidden lg:table-cell ${getTierColorClass(player.rank_1qb_tier)}`}>
                                            {player.rank_1qb_tier || '-'}
                                        </td>
                                    </>
                                )}

                                {/* SF Columns */}
                                {showSf && (
                                    <>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right bg-purple-50/20 dark:bg-purple-950/10">
                                            <div className="font-mono text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                                                {player.rank_sf_overall || '-'}
                                            </div>
                                            <div className="md:hidden text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                                                {player.rank_sf_pos ? `${player.position}${player.rank_sf_pos}` : '-'}
                                                <span className="mx-1">•</span>
                                                <span className={player.rank_sf_tier ? getTierColorClass(player.rank_sf_tier) : ""}>
                                                    {player.rank_sf_tier ? `T${player.rank_sf_tier}` : '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base text-zinc-500 dark:text-zinc-400 bg-purple-50/20 dark:bg-purple-950/10 hidden md:table-cell">
                                            {player.rank_sf_pos ? `${player.position}${player.rank_sf_pos}` : '-'}
                                        </td>
                                        <td className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right font-mono text-sm sm:text-base bg-purple-50/20 dark:bg-purple-950/10 hidden lg:table-cell ${getTierColorClass(player.rank_sf_tier)}`}>
                                            {player.rank_sf_tier || '-'}
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
