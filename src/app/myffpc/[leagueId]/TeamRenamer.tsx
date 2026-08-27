'use client';

import React, { useState } from 'react';

interface RenameableTeam {
    rosterUuid: string;
    currentName: string;
    topPlayers: string[];
}

export function TeamRenamer({ teams }: { teams: RenameableTeam[] }) {
    const [editing, setEditing] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);
    const [renamed, setRenamed] = useState<Record<string, string>>({});

    const startEdit = (rosterUuid: string, currentName: string) => {
        setEditing(rosterUuid);
        setNewName(currentName === 'Unknown' || currentName === 'unknown' ? '' : currentName);
    };

    const save = async (rosterUuid: string) => {
        if (!newName.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/myffpc/rename', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rosterId: rosterUuid, name: newName.trim() }),
            });
            if (res.ok) {
                setRenamed(prev => ({ ...prev, [rosterUuid]: newName.trim() }));
                setEditing(null);
            }
        } catch {}
        finally { setSaving(false); }
    };

    return (
        <div className="bg-white dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-900/5 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Rename Teams</h2>
            <p className="text-xs text-zinc-500 mb-4">Click a team to rename it. Top players shown to help identify each roster.</p>
            <div className="space-y-2">
                {teams.map(team => {
                    const displayName = renamed[team.rosterUuid] || team.currentName;
                    const isEditing = editing === team.rosterUuid;
                    return (
                        <div key={team.rosterUuid} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                            {isEditing ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && save(team.rosterUuid)}
                                        className="flex-1 px-2 py-1 text-sm border border-indigo-300 dark:border-indigo-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        autoFocus
                                        placeholder="Enter team name"
                                    />
                                    <button
                                        onClick={() => save(team.rosterUuid)}
                                        disabled={saving}
                                        className="px-3 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {saving ? '...' : 'Save'}
                                    </button>
                                    <button
                                        onClick={() => setEditing(null)}
                                        className="px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => startEdit(team.rosterUuid, displayName)}>
                                    <span className={`text-sm font-medium ${displayName === 'Unknown' || displayName === 'unknown' ? 'text-red-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                                        {displayName}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 truncate">
                                        {team.topPlayers.join(' • ')}
                                    </span>
                                    <span className="ml-auto text-[10px] text-indigo-500 hover:text-indigo-700">✎ rename</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
