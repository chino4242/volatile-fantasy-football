'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, MessageSquare } from 'lucide-react';

interface TradeScenario {
    id: string;
    status: string;
    my_assets: string; // JSON string
    their_assets: string; // JSON string
    target_team_name: string | null;
    my_value_at_save: number | null;
    their_value_at_save: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface PlayerInfo {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    fc_value: number | null;
}

interface SavedTradesProps {
    leagueId: string;
    platform: 'sleeper' | 'fleaflicker';
    playerMap: Map<string, PlayerInfo>; // sleeper_id -> player info for resolving names
}

const STATUS_OPTIONS = [
    { value: 'exploring', label: 'Exploring', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
    { value: 'ready', label: 'Ready to Offer', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    { value: 'sent', label: 'Sent', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
];

export function SavedTrades({ leagueId, platform, playerMap }: SavedTradesProps) {
    const [scenarios, setScenarios] = useState<TradeScenario[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(true);
    const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
    const [editingNotes, setEditingNotes] = useState<string | null>(null);
    const [notesText, setNotesText] = useState('');

    useEffect(() => {
        fetch(`/api/trade-scenarios?league_id=${leagueId}`)
            .then(r => { if (!r.ok) return { scenarios: [] }; return r.json(); })
            .then(data => setScenarios(data.scenarios || []))
            .catch(() => setScenarios([]))
            .finally(() => setLoading(false));
    }, [leagueId]);

    const updateStatus = async (id: string, status: string) => {
        await fetch('/api/trade-scenarios', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status }),
        });
        setScenarios(prev => prev.map(s => s.id === id ? { ...s, status, updated_at: new Date().toISOString() } : s));
    };

    const saveNotes = async (id: string) => {
        await fetch('/api/trade-scenarios', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, notes: notesText }),
        });
        setScenarios(prev => prev.map(s => s.id === id ? { ...s, notes: notesText } : s));
        setEditingNotes(null);
    };

    const deleteTrade = async (id: string) => {
        await fetch(`/api/trade-scenarios?id=${id}`, { method: 'DELETE' });
        setScenarios(prev => prev.filter(s => s.id !== id));
    };

    const resolveNames = (jsonStr: string): { name: string; position: string | null; value: number | null }[] => {
        try {
            const ids: string[] = JSON.parse(jsonStr);
            return ids.map(id => {
                const p = playerMap.get(id);
                return p ? { name: p.full_name, position: p.position, value: p.fc_value } : { name: id, position: null, value: null };
            });
        } catch {
            return [];
        }
    };

    if (loading) return null;
    if (scenarios.length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Saved Trades</h3>
                    <span className="text-[10px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">{scenarios.length}</span>
                </div>
                {expanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3">
                    {scenarios.map(scenario => {
                        const myPlayers = resolveNames(scenario.my_assets);
                        const theirPlayers = resolveNames(scenario.their_assets);
                        const isExpanded = expandedScenario === scenario.id;
                        const statusInfo = STATUS_OPTIONS.find(s => s.value === scenario.status) || STATUS_OPTIONS[0];

                        return (
                            <div key={scenario.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
                                {/* Summary row */}
                                <div
                                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                                    onClick={() => setExpandedScenario(isExpanded ? null : scenario.id)}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusInfo.color}`}>
                                            {statusInfo.label}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                → {scenario.target_team_name || 'Unknown Team'}
                                            </div>
                                            <div className="text-[10px] text-zinc-500">
                                                {myPlayers.length} player{myPlayers.length !== 1 ? 's' : ''} for {theirPlayers.length}
                                                {scenario.my_value_at_save && scenario.their_value_at_save && (
                                                    <span className="ml-1">
                                                        · {scenario.my_value_at_save.toLocaleString()} ↔ {scenario.their_value_at_save.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>

                                {/* Expanded detail */}
                                {isExpanded && (
                                    <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
                                        {/* Assets */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-[9px] font-bold text-red-500 uppercase mb-1">You Send</div>
                                                {myPlayers.map((p, i) => (
                                                    <div key={i} className="text-xs text-zinc-700 dark:text-zinc-300 flex justify-between">
                                                        <span>{p.name} <span className="text-zinc-400">{p.position}</span></span>
                                                        <span className="text-zinc-400 font-mono">{p.value?.toLocaleString() || '?'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div>
                                                <div className="text-[9px] font-bold text-green-500 uppercase mb-1">You Get</div>
                                                {theirPlayers.map((p, i) => (
                                                    <div key={i} className="text-xs text-zinc-700 dark:text-zinc-300 flex justify-between">
                                                        <span>{p.name} <span className="text-zinc-400">{p.position}</span></span>
                                                        <span className="text-zinc-400 font-mono">{p.value?.toLocaleString() || '?'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Notes */}
                                        {editingNotes === scenario.id ? (
                                            <div className="space-y-1">
                                                <textarea
                                                    value={notesText}
                                                    onChange={e => setNotesText(e.target.value)}
                                                    placeholder="Trade notes (e.g., 'He said he'd consider a 1st + RB')"
                                                    className="w-full text-xs p-2 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 resize-none"
                                                    rows={2}
                                                    autoFocus
                                                />
                                                <div className="flex gap-1">
                                                    <button onClick={() => saveNotes(scenario.id)} className="text-[10px] px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                                                    <button onClick={() => setEditingNotes(null)} className="text-[10px] px-2 py-1 text-zinc-500 hover:text-zinc-700">Cancel</button>
                                                </div>
                                            </div>
                                        ) : scenario.notes ? (
                                            <div
                                                onClick={() => { setEditingNotes(scenario.id); setNotesText(scenario.notes || ''); }}
                                                className="text-xs text-zinc-500 dark:text-zinc-400 italic bg-zinc-50 dark:bg-zinc-800/50 px-2 py-1.5 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                💬 {scenario.notes}
                                            </div>
                                        ) : null}

                                        {/* Actions */}
                                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                            <div className="flex gap-1">
                                                {STATUS_OPTIONS.map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => updateStatus(scenario.id, opt.value)}
                                                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                                                            scenario.status === opt.value ? opt.color : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                                                        }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => { setEditingNotes(scenario.id); setNotesText(scenario.notes || ''); }}
                                                    className="p-1 text-zinc-400 hover:text-indigo-500 transition-colors"
                                                    title="Add notes"
                                                >
                                                    <MessageSquare size={12} />
                                                </button>
                                                <button
                                                    onClick={() => deleteTrade(scenario.id)}
                                                    className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
