'use client';

import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

// Separate component so each avatar manages its own error state cleanly
function PlayerAvatar({ sleeperId, name }: { sleeperId: string; name: string }) {
    const [imgError, setImgError] = useState(false);
    const showImg = sleeperId && !sleeperId.includes('pick') && !imgError;

    return (
        <div className="relative w-8 h-8 sm:w-10 sm:h-10 mr-3 flex-shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-200 dark:border-zinc-700">
            {showImg ? (
                <img
                    src={`https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setImgError(true)}
                />
            ) : (
                <span className="text-[10px] sm:text-xs font-medium text-zinc-400 dark:text-zinc-500">{name?.[0] || '?'}</span>
            )}
        </div>
    );
}

export interface FreeAgentData {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    years_exp: number | null;
    fc_value: number | null;
    fc_rank: number | null;
}

interface FreeAgentTableProps {
    players: FreeAgentData[];
}

type SortColumn = 'fc_value' | 'fc_rank' | 'full_name' | 'position';
type SortDirection = 'asc' | 'desc';

export function FreeAgentTable({ players }: FreeAgentTableProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('fc_value');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filterPosition, setFilterPosition] = useState<string>('ALL');

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortColumn(column);
            setSortDirection(column === 'fc_rank' || column === 'full_name' ? 'asc' : 'desc');
        }
    };

    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    const filteredPlayers = filterPosition === 'ALL'
        ? players
        : filterPosition === 'ROOKIES'
            ? players.filter(p => p.years_exp === 0)
            : players.filter(p => p.position === filterPosition);

    const sortedPlayers = [...filteredPlayers].sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        if (valA === null) valA = sortDirection === 'desc' ? -Infinity : Infinity;
        if (valB === null) valB = sortDirection === 'desc' ? -Infinity : Infinity;

        if (typeof valA === 'string' && typeof valB === 'string') {
            return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
        }

        return sortDirection === 'desc'
            ? (valB as number) - (valA as number)
            : (valA as number) - (valB as number);
    });

    const posBadgeClass = (pos: string | null) => {
        switch (pos) {
            case 'QB': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            case 'RB': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case 'WR': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            case 'TE': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
            default: return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400';
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
            {/* Position Filter Tabs */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-2 overflow-x-auto">
                {['ALL', 'QB', 'RB', 'WR', 'TE', 'ROOKIES'].map(pos => (
                    <button
                        key={pos}
                        onClick={() => setFilterPosition(pos)}
                        className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${filterPosition === pos
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                            }`}
                    >
                        {pos}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/50 select-none">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => handleSort('fc_rank')}>
                                Rank <SortIcon column="fc_rank" />
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => handleSort('full_name')}>
                                Player <SortIcon column="full_name" />
                            </th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => handleSort('position')}>
                                Pos <SortIcon column="position" />
                            </th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => handleSort('fc_value')}>
                                Value <SortIcon column="fc_value" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                        {sortedPlayers.map((player) => (
                            <tr key={player.sleeper_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                                    {player.fc_rank ? `#${player.fc_rank}` : '-'}
                                </td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <PlayerAvatar sleeperId={player.sleeper_id} name={player.full_name || ''} />
                                        <div>
                                            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                                {player.full_name}
                                            </div>
                                            {/* Mobile-only position + team */}
                                            <div className="text-xs text-zinc-500 flex items-center gap-1 sm:hidden">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${posBadgeClass(player.position)}`}>
                                                    {player.position}
                                                </span>
                                                <span>{player.team || 'FA'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${posBadgeClass(player.position)}`}>
                                            {player.position}
                                        </span>
                                        <span>{player.team || 'FA'}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-3 sm:py-4 whitespace-nowrap text-right text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                    {player.fc_value?.toLocaleString() || '0'}
                                </td>
                            </tr>
                        ))}
                        {sortedPlayers.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-500">
                                    No available players found for this criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
