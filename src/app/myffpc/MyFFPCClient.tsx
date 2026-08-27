'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface ExistingLeague {
    league_id: string;
    name: string | null;
    total_rosters: number | null;
}

export function MyFFPCClient({ existingLeagues }: { existingLeagues: ExistingLeague[] }) {
    const router = useRouter();
    const [mode, setMode] = useState<'select' | 'create' | 'addTeam'>('select');
    const [leagueName, setLeagueName] = useState('');
    const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
    const [activeLeagueName, setActiveLeagueName] = useState<string>('');
    const [teamName, setTeamName] = useState('');
    const [rosterText, setRosterText] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [teamsAdded, setTeamsAdded] = useState(0);

    // Create a new league (name only)
    const handleCreateLeague = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!leagueName.trim()) { setError('Please enter a league name.'); return; }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/myffpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: leagueName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to create league'); return; }
            setActiveLeagueId(data.league_id);
            setActiveLeagueName(leagueName.trim());
            setMode('addTeam');
            setSuccess(`League "${leagueName.trim()}" created! Now add teams one at a time.`);
        } catch { setError('Network error. Please try again.'); }
        finally { setLoading(false); }
    };

    // Add one team to the active league
    const handleAddTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName.trim() || !rosterText.trim()) { setError('Please provide both a team name and roster data.'); return; }
        if (!activeLeagueId) { setError('No active league. Create one first.'); return; }
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch('/api/myffpc/team', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leagueId: activeLeagueId, teamName: teamName.trim(), rosterText }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to add team'); return; }
            const unmatchedMsg = data.unmatched.length > 0
                ? ` (${data.unmatched.length} unmatched: ${data.unmatched.slice(0, 5).join(', ')}${data.unmatched.length > 5 ? '...' : ''})`
                : '';
            setSuccess(`✓ "${teamName.trim()}" added — ${data.matched}/${data.total} players matched${unmatchedMsg}`);
            setTeamsAdded(prev => prev + 1);
            setTeamName('');
            setRosterText('');
        } catch { setError('Network error. Please try again.'); }
        finally { setLoading(false); }
    };

    // Select an existing league to add teams to
    const selectLeagueForAdding = (league: ExistingLeague) => {
        setActiveLeagueId(league.league_id);
        setActiveLeagueName(league.name || 'Unnamed');
        setTeamsAdded(league.total_rosters || 0);
        setMode('addTeam');
        setError(null);
        setSuccess(null);
    };

    return (
        <div className="space-y-6">
            {/* Existing Leagues */}
            {existingLeagues.length > 0 && (
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Your MyFFPC Leagues</h2>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {existingLeagues.map(league => (
                            <div key={league.league_id} className="flex items-center justify-between py-3 px-2">
                                <Link
                                    href={`/myffpc/${league.league_id}`}
                                    className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    {league.name || 'Unnamed League'}
                                    <span className="ml-2 text-xs text-zinc-500">{league.total_rosters || 0} teams</span>
                                </Link>
                                <button
                                    onClick={() => selectLeagueForAdding(league)}
                                    className="text-xs px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                >
                                    + Add Team
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Create or Add mode */}
            {mode === 'select' && (
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Create New MyFFPC League</h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                        Start by naming your league, then add teams one at a time by pasting their roster data from MyFFPC.
                    </p>
                    <button
                        onClick={() => setMode('create')}
                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        Create League
                    </button>
                </div>
            )}

            {mode === 'create' && (
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Create League</h2>
                    <form onSubmit={handleCreateLeague} className="space-y-4">
                        <div>
                            <label htmlFor="leagueName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">League Name</label>
                            <input
                                id="leagueName"
                                type="text"
                                value={leagueName}
                                onChange={(e) => setLeagueName(e.target.value)}
                                placeholder="e.g. Standard Dynasty #643"
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>}
                        <div className="flex gap-2">
                            <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors">
                                {loading ? 'Creating...' : 'Create League'}
                            </button>
                            <button type="button" onClick={() => { setMode('select'); setError(null); }} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {mode === 'addTeam' && activeLeagueId && (
                <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Add Team to: {activeLeagueName}</h2>
                            <p className="text-xs text-zinc-500">{teamsAdded} team{teamsAdded !== 1 ? 's' : ''} added so far</p>
                        </div>
                        <Link
                            href={`/myffpc/${activeLeagueId}`}
                            className="text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors"
                        >
                            View League →
                        </Link>
                    </div>

                    {success && <div className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mb-4">{success}</div>}

                    <form onSubmit={handleAddTeam} className="space-y-4">
                        <div>
                            <label htmlFor="teamName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Team Name</label>
                            <input
                                id="teamName"
                                type="text"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="e.g. Baluga Knights"
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label htmlFor="rosterText" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Roster Data</label>
                            <p className="text-xs text-zinc-400 mb-2">Copy the full roster table from MyFFPC (Starters + Bench + IR sections). The parser handles the "Last, First TEAM POS" format.</p>
                            <textarea
                                id="rosterText"
                                value={rosterText}
                                onChange={(e) => setRosterText(e.target.value)}
                                placeholder={`Starters\nQB  Jackson, Lamar BAL    QB  @IND ...\nRB  Hall, Breece NYJ Q   Submit RB  @TEN ...\n...\nBench\nQB  Nix, Bo DEN   Submit  QB  @KC ...\n...`}
                                rows={14}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</div>}
                        <button type="submit" disabled={loading} className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors">
                            {loading ? 'Adding...' : 'Add Team'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
