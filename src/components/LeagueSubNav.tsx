'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface TeamInfo {
    id: string | number;
    name: string;
}

interface LeagueSubNavProps {
    leagueId: string;
    leagueName: string;
    platform: 'sleeper' | 'fleaflicker';
    teams?: TeamInfo[];
}

export function LeagueSubNav({ leagueId, leagueName, platform, teams }: LeagueSubNavProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setTeamDropdownOpen(false);
            }
        }
        if (teamDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [teamDropdownOpen]);

    // Build the base path for this league
    const basePath = platform === 'sleeper'
        ? `/league/${leagueId}`
        : `/fleaflicker/${leagueId}`;

    // Preserve query params (format, keepers)
    const queryString = searchParams.toString();
    const qs = queryString ? `?${queryString}` : '';

    // Determine active tab
    const getActiveTab = (): string => {
        const relative = pathname.replace(basePath, '');
        if (relative === '' || relative === '/') return 'dashboard';
        if (relative.startsWith('/free-agents')) return 'free-agents';
        if (relative.startsWith('/draft-plan')) return 'draft-plan';
        if (relative.startsWith('/trades')) return 'trades';
        if (relative.startsWith('/mock-draft')) return 'mock-draft';
        if (relative.startsWith('/live-draft')) return 'live-draft';
        if (relative.startsWith('/team')) return 'team';
        return 'dashboard';
    };

    const activeTab = getActiveTab();

    // Detect if we're on a team page and extract team ID
    const teamMatch = pathname.match(/\/team\/([^/]+)/);
    const currentTeamId = teamMatch ? teamMatch[1] : null;
    const currentTeam = currentTeamId && teams
        ? teams.find(t => String(t.id) === currentTeamId)
        : null;

    // Build free-agents link with team context if on a team page
    const freeAgentsQs = (() => {
        const params = new URLSearchParams(queryString);
        if (currentTeamId) params.set('team', currentTeamId);
        const str = params.toString();
        return str ? `?${str}` : '';
    })();

    const tabs = [
        { key: 'dashboard', label: 'Dashboard', href: `${basePath}${qs}` },
        { key: 'free-agents', label: 'Free Agents', href: `${basePath}/free-agents${freeAgentsQs}` },
        { key: 'draft-plan', label: 'Draft Plan', href: `${basePath}/draft-plan${qs}` },
        { key: 'trades', label: 'Trades', href: `${basePath}/trades${qs}` },
        { key: 'mock-draft', label: 'Mock Draft', href: `${basePath}/mock-draft${qs}` },
        { key: 'live-draft', label: 'Live Draft', href: `${basePath}/live-draft${qs}`, muted: true },
    ];

    return (
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 pt-3 pb-2 text-sm">
                    <Link
                        href="/"
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                    >
                        Home
                    </Link>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                    <Link
                        href={`${basePath}${qs}`}
                        className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[200px] sm:max-w-none"
                    >
                        {leagueName}
                    </Link>
                    {currentTeam && (
                        <>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
                            <span className="text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[150px] sm:max-w-none">
                                {currentTeam.name}
                            </span>
                        </>
                    )}
                </div>

                {/* Tab bar */}
                <div className="flex items-center gap-0 -mb-px overflow-x-auto">
                    {tabs.map(tab => {
                        const isActive = tab.key === activeTab || (tab.key === 'dashboard' && activeTab === 'team');
                        return (
                            <Link
                                key={tab.key}
                                href={tab.href}
                                className={`relative px-3 sm:px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                                    isActive
                                        ? 'text-zinc-900 dark:text-zinc-50'
                                        : tab.muted
                                            ? 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                            >
                                {tab.label}
                                {isActive && (
                                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t" />
                                )}
                            </Link>
                        );
                    })}

                    {/* Team selector dropdown (shown when teams are available) */}
                    {teams && teams.length > 0 && currentTeamId && (
                        <div className="relative ml-auto" ref={dropdownRef}>
                            <button
                                onClick={() => setTeamDropdownOpen(!teamDropdownOpen)}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <span className="hidden sm:inline">Switch Team</span>
                                <span className="sm:hidden">Teams</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${teamDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {teamDropdownOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-72 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1">
                                    {teams.map(team => (
                                        <Link
                                            key={team.id}
                                            href={`${basePath}/team/${team.id}${qs}`}
                                            onClick={() => setTeamDropdownOpen(false)}
                                            className={`block px-3 py-2 text-sm transition-colors ${
                                                String(team.id) === currentTeamId
                                                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-medium'
                                                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            {team.name}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
