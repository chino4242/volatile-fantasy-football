'use client';

import Link from "next/link";
import { ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";

export interface LeagueTeamStat {
    id: string | number;
    name?: string;
    ownerName: string;
    ownerAvatar?: string | null;
    totalValue: number;
    qbValue: number;
    rbValue: number;
    wrValue: number;
    teValue: number;
    pickValue: number;
    pickCount: number;
    valueDropped?: number;
    valueKept?: number;
}

interface LeagueTableProps {
    teams: LeagueTeamStat[];
    platform: 'sleeper' | 'fleaflicker';
    leagueId: string;
    format?: '1qb' | 'sf';
    keeperCount?: number;
}

type SortColumn = 'totalValue' | 'qbValue' | 'rbValue' | 'wrValue' | 'teValue' | 'pickValue' | 'valueDropped' | 'valueKept';
type SortDirection = 'asc' | 'desc';

export function LeagueTable({ teams, platform, leagueId, format, keeperCount }: LeagueTableProps) {
    const [sortColumn, setSortColumn] = useState<SortColumn>('totalValue');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const sortedTeams = [...teams].sort((a, b) => {
        const valA = a[sortColumn] ?? 0;
        const valB = b[sortColumn] ?? 0;

        if (sortDirection === 'desc') {
            return valB - valA;
        } else {
            return valA - valB;
        }
    });

    const SortIcon = ({ column }: { column: SortColumn }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    const getTeamLink = (teamId: string | number) => {
        const params = new URLSearchParams();
        if (format) params.set('format', format);
        if (keeperCount) params.set('keepers', keeperCount.toString());
        const queryString = params.toString() ? `?${params.toString()}` : '';
        if (platform === 'sleeper') return `/league/${leagueId}/team/${teamId}${queryString}`;
        return `/fleaflicker/${leagueId}/team/${teamId}${queryString}`;
    };

    return (
        <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
            {/* Mobile Card Layout */}
            <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {sortedTeams.map((team, idx) => {
                    const total = team.qbValue + team.rbValue + team.wrValue + team.teValue + team.pickValue;
                    const pctQB = total > 0 ? (team.qbValue / total) * 100 : 0;
                    const pctRB = total > 0 ? (team.rbValue / total) * 100 : 0;
                    const pctWR = total > 0 ? (team.wrValue / total) * 100 : 0;
                    const pctTE = total > 0 ? (team.teValue / total) * 100 : 0;
                    const pctPick = total > 0 ? (team.pickValue / total) * 100 : 0;
                    return (
                        <Link
                            key={team.id}
                            href={getTeamLink(team.id)}
                            className="flex items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800/50 transition-colors"
                        >
                            {/* Rank */}
                            <div className="text-xs font-mono text-zinc-400 w-6 text-center flex-shrink-0">
                                {idx + 1}
                            </div>
                            {/* Avatar */}
                            <div className="flex-shrink-0">
                                {platform === 'sleeper' ? (
                                    team.ownerAvatar ? (
                                        <img className="h-9 w-9 rounded-full bg-zinc-100" src={`https://sleepercdn.com/avatars/${team.ownerAvatar}`} alt="" />
                                    ) : (
                                        <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-bold">
                                            {team.ownerName.charAt(0).toUpperCase()}
                                        </div>
                                    )
                                ) : (
                                    <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs font-bold">
                                        {team.ownerName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                        {platform === 'fleaflicker' ? team.name : team.ownerName}
                                    </span>
                                    <span className="text-sm font-mono font-bold text-green-600 dark:text-green-400 flex-shrink-0 ml-2">
                                        {team.totalValue.toLocaleString()}
                                    </span>
                                </div>
                                {/* Position mini-bar */}
                                <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-zinc-100 dark:bg-zinc-800">
                                    <div className="bg-green-400 dark:bg-green-500" style={{ width: `${pctQB}%` }} title={`QB: ${team.qbValue.toLocaleString()}`} />
                                    <div className="bg-blue-400 dark:bg-blue-500" style={{ width: `${pctRB}%` }} title={`RB: ${team.rbValue.toLocaleString()}`} />
                                    <div className="bg-red-400 dark:bg-red-500" style={{ width: `${pctWR}%` }} title={`WR: ${team.wrValue.toLocaleString()}`} />
                                    <div className="bg-orange-400 dark:bg-orange-500" style={{ width: `${pctTE}%` }} title={`TE: ${team.teValue.toLocaleString()}`} />
                                    <div className="bg-zinc-300 dark:bg-zinc-600" style={{ width: `${pctPick}%` }} title={`Picks: ${team.pickValue.toLocaleString()}`} />
                                </div>
                                {/* Position legend */}
                                <div className="flex gap-2 mt-1 text-[9px] text-zinc-400">
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />QB</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" />RB</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />WR</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />TE</span>
                                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />Picks</span>
                                </div>
                            </div>
                            {/* Chevron */}
                            <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                        </Link>
                    );
                })}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden sm:block overflow-x-auto">
                <div className="inline-block min-w-full align-middle">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                        <thead className="bg-zinc-50 dark:bg-zinc-950/50 select-none">
                            <tr>
                                <th scope="col" className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Rank</th>
                                <th scope="col" className="sticky left-[3rem] sm:left-[4rem] z-10 bg-zinc-50 dark:bg-zinc-950 px-2 sm:px-3 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">Manager</th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('totalValue')}>
                                    Total Value <SortIcon column="totalValue" />
                                </th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('qbValue')}>
                                    QB <SortIcon column="qbValue" />
                                </th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('rbValue')}>
                                    RB <SortIcon column="rbValue" />
                                </th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('wrValue')}>
                                    WR <SortIcon column="wrValue" />
                                </th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('teValue')}>
                                    TE <SortIcon column="teValue" />
                                </th>
                                <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider hidden md:table-cell cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('pickValue')}>
                                    Picks <SortIcon column="pickValue" />
                                </th>
                                {keeperCount && keeperCount > 0 && (
                                    <>
                                        <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('valueKept')}>
                                            Value Kept <SortIcon column="valueKept" />
                                        </th>
                                        <th scope="col" className="px-2 sm:px-3 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('valueDropped')}>
                                            Value Dropped <SortIcon column="valueDropped" />
                                        </th>
                                    </>
                                )}
                                <th scope="col" className="relative px-2 sm:px-3 py-3">
                                    <span className="sr-only">View</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                            {sortedTeams.map((team, idx) => (
                                <tr key={team.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group relative cursor-pointer">
                                    <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                        #{idx + 1}
                                    </td>
                                    <td className="sticky left-[3rem] sm:left-[4rem] z-10 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800/50 px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                                        <Link
                                            href={getTeamLink(team.id)}
                                            className="flex items-center after:absolute after:inset-0 after:content-[''] z-20"
                                        >
                                            <div className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                                                {platform === 'sleeper' ? (
                                                    team.ownerAvatar ? (
                                                        <img className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-zinc-100" src={`https://sleepercdn.com/avatars/${team.ownerAvatar}`} alt="" />
                                                    ) : (
                                                        <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px] sm:text-xs">?</div>
                                                    )
                                                ) : (
                                                    <div className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-[10px] sm:text-xs">
                                                        {team.ownerName.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-2 sm:ml-3">
                                                <div className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 max-w-[80px] sm:max-w-[120px] truncate">
                                                    {platform === 'fleaflicker' ? team.name : team.ownerName}
                                                </div>
                                                {platform === 'fleaflicker' && (
                                                    <div className="text-[10px] sm:text-xs text-zinc-500 truncate">{team.ownerName}</div>
                                                )}
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-mono font-medium text-green-600 dark:text-green-400">
                                        {team.totalValue.toLocaleString()}
                                        <div className="sm:hidden text-[10px] text-zinc-400 font-sans mt-0.5 font-normal">
                                            QB: {team.qbValue.toLocaleString()} | RB: {team.rbValue.toLocaleString()}
                                            <br />
                                            WR: {team.wrValue.toLocaleString()} | TE: {team.teValue.toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                        {team.qbValue.toLocaleString()}
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                        {team.rbValue.toLocaleString()}
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                        {team.wrValue.toLocaleString()}
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden sm:table-cell">
                                        {team.teValue.toLocaleString()}
                                    </td>
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 hidden md:table-cell">
                                        {team.pickValue.toLocaleString()}
                                    </td>
                                    {keeperCount && keeperCount > 0 && (
                                        <>
                                            <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-mono text-emerald-600 dark:text-emerald-400">
                                                {team.valueKept?.toLocaleString() || '0'}
                                            </td>
                                            <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-mono text-red-600 dark:text-red-400">
                                                {team.valueDropped?.toLocaleString() || '0'}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-right text-xs sm:text-sm font-medium">
                                        <ChevronRight className="h-5 w-5 text-zinc-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
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
