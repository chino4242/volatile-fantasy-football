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
}

interface LeagueTableProps {
    teams: LeagueTeamStat[];
    platform: 'sleeper' | 'fleaflicker';
    leagueId: string;
    format?: '1qb' | 'sf';
}

type SortColumn = 'totalValue' | 'qbValue' | 'rbValue' | 'wrValue' | 'teValue' | 'pickValue';
type SortDirection = 'asc' | 'desc';

export function LeagueTable({ teams, platform, leagueId, format }: LeagueTableProps) {
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
        const valA = a[sortColumn];
        const valB = b[sortColumn];

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
        const formatParam = format ? `?format=${format}` : '';
        if (platform === 'sleeper') return `/league/${leagueId}/team/${teamId}${formatParam}`;
        return `/fleaflicker/${leagueId}/team/${teamId}${formatParam}`;
    };

    return (
        <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
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
