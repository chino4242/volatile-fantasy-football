'use client';

import React, { useState } from 'react';

interface FreeAgent {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value_1qb: number | null;
    fc_rank_1qb: number | null;
    rank_1qb_overall: number | null;
    rank_1qb_tier: number | null;
    redraft_auction_value: number | null;
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;
type PositionFilter = typeof POSITIONS[number];

function getPositionBadgeColor(position: string | null): string {
    switch (position) {
        case 'QB': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
        case 'RB': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
        case 'WR': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
        case 'TE': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
        default: return 'bg-zinc-100 text-zinc-600';
    }
}

function getPositionBorderColor(position: string | null): string {
    switch (position) {
        case 'QB': return 'border-l-green-600';
        case 'RB': return 'border-l-blue-600';
        case 'WR': return 'border-l-red-600';
        case 'TE': return 'border-l-orange-600';
        default: return 'border-l-zinc-300';
    }
}

export function MyFFPCFreeAgentTable({ players }: { players: FreeAgent[] }) {
    const [filter, setFilter] = useState<PositionFilter>('ALL');

    const filtered = filter === 'ALL'
        ? players
        : players.filter(p => p.position === filter);

    return (
        <div>
            {/* Position Filters */}
            <div className="flex gap-2 mb-4">
                {POSITIONS.map(pos => (
                    <button
                        key={pos}
                        onClick={() => setFilter(pos)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                            filter === pos
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 ring-1 ring-zinc-200 dark:ring-zinc-700'
                        }`}
                    >
                        {pos}
                    </button>
                ))}
                <span className="ml-auto text-sm text-zinc-500 self-center">
                    {filtered.length} players
                </span>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
                {/* Mobile Layout */}
                <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filtered.slice(0, 100).map((player, idx) => (
                        <div
                            key={player.sleeper_id}
                            className={`flex items-center justify-between px-4 py-3 border-l-4 ${getPositionBorderColor(player.position)}`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xs font-mono text-zinc-400 w-6">{idx + 1}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
                                    {player.position}
                                </span>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {player.full_name}
                                    </div>
                                    <div className="text-xs text-zinc-500">{player.team || 'FA'}</div>
                                </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-sm font-mono font-bold text-green-600 dark:text-green-400">
                                    {player.fc_value_1qb?.toLocaleString() || '—'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400 w-8">#</th>
                                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Player</th>
                                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Pos</th>
                                <th className="text-left px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Team</th>
                                <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Dynasty Value</th>
                                <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Auction $</th>
                                <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">FC Rank</th>
                                <th className="text-right px-4 py-3 font-medium text-zinc-500 dark:text-zinc-400">Tier</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filtered.slice(0, 100).map((player, idx) => (
                                <tr
                                    key={player.sleeper_id}
                                    className={`border-l-4 ${getPositionBorderColor(player.position)} hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors`}
                                >
                                    <td className="px-4 py-3 text-xs font-mono text-zinc-400">{idx + 1}</td>
                                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                                        {player.full_name}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${getPositionBadgeColor(player.position)}`}>
                                            {player.position}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                                        {player.team || 'FA'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-green-600 dark:text-green-400">
                                        {player.fc_value_1qb?.toLocaleString() || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                                        {player.redraft_auction_value != null ? `$${player.redraft_auction_value}` : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                                        {player.fc_rank_1qb || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-400">
                                        {player.rank_1qb_tier || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
