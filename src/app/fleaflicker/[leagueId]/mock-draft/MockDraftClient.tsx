'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Download, Play, Settings2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Player {
    id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    years_exp?: number | null;
    fc_value: number | null;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    fc_position_rank_sf?: number | null;
    fc_position_rank_1qb?: number | null;
    fc_combined_value?: number | null;
    fc_trend_30_day?: number | null;
    fc_trade_frequency?: string | number | null;
    rank_sf_overall?: number | null;
    rank_1qb_overall?: number | null;
    rank_sf_pos?: number | null;
    rank_1qb_pos?: number | null;
    rank_sf_tier?: number | null;
    rank_1qb_tier?: number | null;
}

interface Team {
    id: number;
    name: string;
    owner: string;
    players: Player[];
    positionValues: { QB: number; RB: number; WR: number; TE: number };
    draftPicks: Array<{
        season: number;
        round: number;
        slot: number;
        overall: number;
        originalOwner: number;
        currentOwner: number;
    }>;
}

interface DraftPick {
    round: number;
    pick: number;
    teamId: number;
    teamName: string;
    playerId?: string;
    playerName?: string;
    playerPosition?: string;
    playerValue?: number;
}

interface MockDraftClientProps {
    leagueId: string;
    teams: Team[];
    freeAgents: Player[];
    format: string;
}

const ROUNDS = 5;

export default function MockDraftClient({ leagueId, teams, freeAgents, format }: MockDraftClientProps) {
    // Generate draft order from current year picks
    const draftOrder = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const order: DraftPick[] = [];
        
        for (let round = 1; round <= ROUNDS; round++) {
            // Get all picks for this round
            const roundPicks = teams.flatMap(team => 
                team.draftPicks
                    .filter(p => p.season === currentYear && p.round === round)
                    .map(p => ({
                        round,
                        pick: p.slot,
                        teamId: team.id,
                        teamName: team.name,
                    }))
            );
            
            // Sort by slot (Fleaflicker already accounts for snake draft in slot numbers)
            roundPicks.sort((a, b) => a.pick - b.pick);
            
            order.push(...roundPicks);
        }
        
        return order;
    }, [teams]);

    const [picks, setPicks] = useState<DraftPick[]>(draftOrder);
    const [currentPickIndex, setCurrentPickIndex] = useState(0);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>(freeAgents);
    const [userTeamId, setUserTeamId] = useState<number | null>(null);
    const [draftStarted, setDraftStarted] = useState(false);
    const [positionFilter, setPositionFilter] = useState<string>('ALL');
    const [sortColumn, setSortColumn] = useState<string>('fc_value');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('vff_mock_draft_columns');
            if (saved) return new Set(JSON.parse(saved));
        }
        return new Set(['position', 'team', 'market_value', 'fc_rank', 'fc_pos_rank']);
    });
    const [showColumnPicker, setShowColumnPicker] = useState(false);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [selectedTradeAssets, setSelectedTradeAssets] = useState<Set<string>>(new Set());

    // Auto-simulate CPU picks
    const currentPick = picks[currentPickIndex];
    const isUserPick = currentPick && userTeamId !== null && currentPick.teamId === userTeamId;
    const isDraftComplete = currentPickIndex >= picks.length;

    const makePick = (playerId: string) => {
        const player = availablePlayers.find(p => p.id === playerId);
        if (!player) return;

        const updatedPicks = [...picks];
        updatedPicks[currentPickIndex] = {
            ...updatedPicks[currentPickIndex],
            playerId: player.id,
            playerName: player.full_name,
            playerPosition: player.position || undefined,
            playerValue: player.fc_value || undefined,
        };

        setPicks(updatedPicks);
        setAvailablePlayers(availablePlayers.filter(p => p.id !== playerId));
        setCurrentPickIndex(currentPickIndex + 1);
    };

    // Auto-simulate non-user picks
    if (draftStarted && !isDraftComplete && currentPick && !isUserPick && userTeamId !== null && availablePlayers.length > 0) {
        setTimeout(() => {
            const selectedPlayer = simulatePick(currentPick.teamId);
            if (selectedPlayer) {
                makePick(selectedPlayer.id);
            }
        }, 1500);
    }

    // Calculate league average positional values
    const leagueAvgPositions = useMemo(() => {
        const totals = { QB: 0, RB: 0, WR: 0, TE: 0 };
        teams.forEach(team => {
            totals.QB += team.positionValues.QB;
            totals.RB += team.positionValues.RB;
            totals.WR += team.positionValues.WR;
            totals.TE += team.positionValues.TE;
        });
        return {
            QB: totals.QB / teams.length,
            RB: totals.RB / teams.length,
            WR: totals.WR / teams.length,
            TE: totals.TE / teams.length,
        };
    }, [teams]);

    const calculatePositionalNeed = (teamId: number): Record<string, number> => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return { QB: 0, RB: 0, WR: 0, TE: 0 };

        const needs: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const teamValue = team.positionValues[pos];
            const avgValue = leagueAvgPositions[pos];
            // Higher need when below average
            needs[pos] = Math.max(0, (avgValue - teamValue) / avgValue);
        });

        return needs;
    };

    const scorePlayer = (player: Player, teamId: number): number => {
        const value = player.fc_value || 0;
        const needs = calculatePositionalNeed(teamId);
        const posNeed = needs[player.position || ''] || 0;
        const random = Math.random() * 100;

        return (value * 0.85) + (posNeed * value * 0.10) + (random * 0.05);
    };

    const simulatePick = (teamId: number) => {
        if (availablePlayers.length === 0) return null;

        // Score all available players
        const scoredPlayers = availablePlayers.map(p => ({
            player: p,
            score: scorePlayer(p, teamId)
        }));

        // Sort by score and pick from top 5
        scoredPlayers.sort((a, b) => b.score - a.score);
        const topCandidates = scoredPlayers.slice(0, 5);
        
        // Weighted random selection from top candidates
        const totalScore = topCandidates.reduce((sum, c) => sum + c.score, 0);
        let random = Math.random() * totalScore;
        
        for (const candidate of topCandidates) {
            random -= candidate.score;
            if (random <= 0) {
                return candidate.player;
            }
        }

        return topCandidates[0].player;
    };

    const resetDraft = () => {
        setPicks(draftOrder);
        setCurrentPickIndex(0);
        setAvailablePlayers(freeAgents);
        setDraftStarted(false);
    };

    const toggleColumn = (column: string) => {
        setVisibleColumns(prev => {
            const next = new Set(prev);
            if (next.has(column)) {
                next.delete(column);
            } else {
                next.add(column);
            }
            localStorage.setItem('vff_mock_draft_columns', JSON.stringify([...next]));
            return next;
        });
    };

    const show = (column: string) => visibleColumns.has(column);

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setSortColumn(column);
            setSortDirection('desc');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 inline-block opacity-40 group-hover:opacity-100" />;
        return sortDirection === 'desc'
            ? <ArrowDown className="ml-1 h-3 w-3 inline-block text-indigo-500" />
            : <ArrowUp className="ml-1 h-3 w-3 inline-block text-indigo-500" />;
    };

    const exportToCSV = () => {
        const headers = ['Round', 'Pick', 'Team', 'Player', 'Position', 'Value'];
        const rows = picks
            .filter(p => p.playerId)
            .map(p => [
                p.round,
                p.pick,
                p.teamName,
                p.playerName || '',
                p.playerPosition || '',
                p.playerValue || ''
            ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mock-draft-${leagueId}.csv`;
        a.click();
    };

    // Calculate trade value
    const calculateTradeValue = () => {
        const userTeam = teams.find(t => t.id === userTeamId);
        if (!userTeam || !currentPick) return 0;

        let totalValue = 0;

        // Add current pick value - use rough estimates based on round/pick
        // Based on FantasyCalc values: 1.01 ~6700, 1.09 ~2500, 2.01 ~1900, etc.
        const round = currentPick.round;
        const pick = currentPick.pick;
        
        let pickValue = 0;
        if (round === 1) {
            // First round: 6700 down to 2000
            pickValue = Math.max(2000, 6700 - (pick - 1) * 400);
        } else if (round === 2) {
            // Second round: 1900 down to 1200
            pickValue = Math.max(1200, 1900 - (pick - 1) * 60);
        } else if (round === 3) {
            // Third round: 1100 down to 700
            pickValue = Math.max(700, 1100 - (pick - 1) * 35);
        } else if (round === 4) {
            // Fourth round: 650 down to 400
            pickValue = Math.max(400, 650 - (pick - 1) * 20);
        } else {
            // Fifth round and beyond: 350 down to 200
            pickValue = Math.max(200, 350 - (pick - 1) * 15);
        }
        
        totalValue += pickValue;

        // Add selected assets
        selectedTradeAssets.forEach(assetId => {
            if (assetId.startsWith('player_')) {
                const playerId = assetId.replace('player_', '');
                const player = userTeam.players.find(p => p.id === playerId);
                if (player) totalValue += player.fc_value || 0;
            } else if (assetId.startsWith('pick_')) {
                const [_, season, round] = assetId.split('_');
                const r = parseInt(round);
                // Future picks worth slightly less
                let futurePickValue = 0;
                if (r === 1) futurePickValue = 2900;
                else if (r === 2) futurePickValue = 1500;
                else if (r === 3) futurePickValue = 900;
                else if (r === 4) futurePickValue = 500;
                else futurePickValue = 300;
                totalValue += futurePickValue;
            }
        });

        return totalValue;
    };

    // Find trade targets
    const tradeTargets = useMemo(() => {
        if (!showTradeModal || !currentPick || !userTeamId) return [];
        
        const tradeValue = calculateTradeValue();
        const tolerance = 0.15; // 15% tolerance for rostered players
        const minValue = tradeValue * (1 - tolerance);
        const maxValue = tradeValue * (1 + tolerance);

        // Get all rostered players from OTHER teams
        const rosteredPlayers: (Player & { teamName: string })[] = [];
        teams.forEach(team => {
            if (team.id !== userTeamId) {
                team.players.forEach(player => {
                    rosteredPlayers.push({ ...player, teamName: team.name });
                });
            }
        });

        return rosteredPlayers
            .filter(p => {
                const value = p.fc_value || 0;
                return value >= minValue && value <= maxValue;
            })
            .sort((a, b) => {
                const aDiff = Math.abs((a.fc_value || 0) - tradeValue);
                const bDiff = Math.abs((b.fc_value || 0) - tradeValue);
                return aDiff - bDiff;
            })
            .slice(0, 30);
    }, [showTradeModal, selectedTradeAssets, currentPick, userTeamId, teams]);

    const toggleTradeAsset = (assetId: string) => {
        setSelectedTradeAssets(prev => {
            const next = new Set(prev);
            if (next.has(assetId)) {
                next.delete(assetId);
            } else {
                next.add(assetId);
            }
            return next;
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/fleaflicker/${leagueId}`}
                            className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                            Mock Draft
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={resetDraft}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reset
                        </button>
                        <button
                            onClick={exportToCSV}
                            disabled={picks.filter(p => p.playerId).length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download className="h-4 w-4" />
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* Team Selector */}
                {userTeamId === null && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                            Select Your Team
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {teams.map(team => (
                                <button
                                    key={team.id}
                                    onClick={() => setUserTeamId(team.id)}
                                    className="p-4 text-left border-2 border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
                                >
                                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {team.name}
                                    </div>
                                    <div className="text-sm text-zinc-500 dark:text-zinc-400">
                                        {team.owner}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Start Draft Button */}
                {userTeamId !== null && !draftStarted && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6 text-center">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                            Ready to draft as {teams.find(t => t.id === userTeamId)?.name}?
                        </h2>
                        <button
                            onClick={() => setDraftStarted(true)}
                            className="px-8 py-4 text-lg font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-lg"
                        >
                            Start Draft
                        </button>
                    </div>
                )}

                {/* Current Pick */}
                {draftStarted && !isDraftComplete && currentPick && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <div className="text-center">
                            <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                                Round {currentPick.round}, Pick {currentPick.pick}
                            </div>
                            <div className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                                {currentPick.teamName} is on the clock
                            </div>
                            {isUserPick && (
                                <div className="space-y-3">
                                    <div className="text-base sm:text-lg text-indigo-600 dark:text-indigo-400 font-semibold">
                                        Your pick! Select a player below or evaluate trades.
                                    </div>
                                    <button
                                        onClick={() => setShowTradeModal(true)}
                                        className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                                    >
                                        Evaluate Trades
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isDraftComplete && (
                    <div className="bg-green-50 dark:bg-green-950 rounded-xl p-6 mb-6 text-center">
                        <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                            Draft Complete!
                        </div>
                    </div>
                )}

                {/* Available Players (when user's pick) */}
                {draftStarted && !isDraftComplete && isUserPick && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                            <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                Available Players
                            </h2>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                                {/* Position Filters */}
                                <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                                    {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                                        <button
                                            key={pos}
                                            onClick={() => setPositionFilter(pos)}
                                            className={`px-2 sm:px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                                                positionFilter === pos
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            {pos}
                                        </button>
                                    ))}
                                </div>
                                {/* Column Picker */}
                                <div className="relative flex-shrink-0">
                                    <button
                                        onClick={() => setShowColumnPicker(!showColumnPicker)}
                                        className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
                                        title="Configure columns"
                                    >
                                        <Settings2 className="h-4 w-4" />
                                    </button>
                                    {showColumnPicker && (
                                        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700 z-50 max-h-96 overflow-y-auto">
                                            <div className="p-3 space-y-3">
                                                <div>
                                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Core</div>
                                                    {[
                                                        { id: 'position', label: 'Position' },
                                                        { id: 'team', label: 'Team' },
                                                        { id: 'market_value', label: 'Market Value' },
                                                    ].map(col => (
                                                        <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 p-1 rounded">
                                                            <input
                                                                type="checkbox"
                                                                checked={show(col.id)}
                                                                onChange={() => toggleColumn(col.id)}
                                                                className="rounded border-zinc-300 dark:border-zinc-600"
                                                            />
                                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{col.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">FantasyCalc</div>
                                                    {[
                                                        { id: 'fc_rank', label: 'FC Overall' },
                                                        { id: 'fc_pos_rank', label: 'FC Pos Rank' },
                                                        { id: 'combined_value', label: 'Combined' },
                                                        { id: 'trend_30d', label: '30d Trend' },
                                                        { id: 'trade_freq', label: 'Trade Freq' },
                                                    ].map(col => (
                                                        <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 p-1 rounded">
                                                            <input
                                                                type="checkbox"
                                                                checked={show(col.id)}
                                                                onChange={() => toggleColumn(col.id)}
                                                                className="rounded border-zinc-300 dark:border-zinc-600"
                                                            />
                                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{col.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">VFF Rankings</div>
                                                    {[
                                                        { id: 'vff_rank', label: 'VFF Rank' },
                                                        { id: 'vff_pos', label: 'VFF Pos' },
                                                        { id: 'tier', label: 'Tier' },
                                                    ].map(col => (
                                                        <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 p-1 rounded">
                                                            <input
                                                                type="checkbox"
                                                                checked={show(col.id)}
                                                                onChange={() => toggleColumn(col.id)}
                                                                className="rounded border-zinc-300 dark:border-zinc-600"
                                                            />
                                                            <span className="text-sm text-zinc-700 dark:text-zinc-300">{col.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-4 sm:mx-0">
                            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                                <thead className="bg-zinc-50 dark:bg-zinc-950/50 sticky top-0">
                                    <tr>
                                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('full_name')}>
                                            Player <SortIcon column="full_name" />
                                        </th>
                                        {show('position') && <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('position')}>
                                            Pos <SortIcon column="position" />
                                        </th>}
                                        {show('team') && <th className="hidden sm:table-cell px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('team')}>
                                            Team <SortIcon column="team" />
                                        </th>}
                                        {show('market_value') && <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('fc_value')}>
                                            Value <SortIcon column="fc_value" />
                                        </th>}
                                        {show('fc_rank') && <th className="hidden md:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors" onClick={() => handleSort(format === 'sf' ? 'fc_rank_sf' : 'fc_rank_1qb')}>
                                            FC Rank <SortIcon column={format === 'sf' ? 'fc_rank_sf' : 'fc_rank_1qb'} />
                                        </th>}
                                        {show('fc_pos_rank') && <th className="hidden md:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors" onClick={() => handleSort(format === 'sf' ? 'fc_position_rank_sf' : 'fc_position_rank_1qb')}>
                                            FC Pos <SortIcon column={format === 'sf' ? 'fc_position_rank_sf' : 'fc_position_rank_1qb'} />
                                        </th>}
                                        {show('combined_value') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors" onClick={() => handleSort('fc_combined_value')}>
                                            Combined <SortIcon column="fc_combined_value" />
                                        </th>}
                                        {show('trend_30d') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors" onClick={() => handleSort('fc_trend_30_day')}>
                                            30d <SortIcon column="fc_trend_30_day" />
                                        </th>}
                                        {show('trade_freq') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors" onClick={() => handleSort('fc_trade_frequency')}>
                                            Traded <SortIcon column="fc_trade_frequency" />
                                        </th>}
                                        {show('vff_rank') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors" onClick={() => handleSort(format === 'sf' ? 'rank_sf_overall' : 'rank_1qb_overall')}>
                                            VFF Rank <SortIcon column={format === 'sf' ? 'rank_sf_overall' : 'rank_1qb_overall'} />
                                        </th>}
                                        {show('vff_pos') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors" onClick={() => handleSort(format === 'sf' ? 'rank_sf_pos' : 'rank_1qb_pos')}>
                                            VFF Pos <SortIcon column={format === 'sf' ? 'rank_sf_pos' : 'rank_1qb_pos'} />
                                        </th>}
                                        {show('tier') && <th className="hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors" onClick={() => handleSort(format === 'sf' ? 'rank_sf_tier' : 'rank_1qb_tier')}>
                                            Tier <SortIcon column={format === 'sf' ? 'rank_sf_tier' : 'rank_1qb_tier'} />
                                        </th>}
                                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-zinc-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {availablePlayers
                                        .filter(p => positionFilter === 'ALL' || p.position === positionFilter)
                                        .sort((a, b) => {
                                            let valA: any = a[sortColumn as keyof Player];
                                            let valB: any = b[sortColumn as keyof Player];
                                            
                                            if (valA === null || valA === undefined) valA = sortDirection === 'desc' ? -Infinity : Infinity;
                                            if (valB === null || valB === undefined) valB = sortDirection === 'desc' ? -Infinity : Infinity;
                                            
                                            if (typeof valA === 'string' && typeof valB === 'string') {
                                                return sortDirection === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
                                            }
                                            
                                            return sortDirection === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
                                        })
                                        .slice(0, 50)
                                        .map(player => {
                                            const sf = format === 'sf';
                                            return (
                                        <tr key={player.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                                            <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                                {player.full_name}
                                            </td>
                                            {show('position') && (
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                                                    {player.position}
                                                </td>
                                            )}
                                            {show('team') && (
                                                <td className="hidden sm:table-cell px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                                                    {player.team || '—'}
                                                </td>
                                            )}
                                            {show('market_value') && (
                                                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-zinc-900 dark:text-zinc-100">
                                                    {player.fc_value?.toFixed(0) || '—'}
                                                </td>
                                            )}
                                            {show('fc_rank') && (
                                                <td className="hidden md:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20">
                                                    {(sf ? player.fc_rank_sf : player.fc_rank_1qb) || '—'}
                                                </td>
                                            )}
                                            {show('fc_pos_rank') && (
                                                <td className="hidden md:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20">
                                                    {player.position}{(sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb) || '—'}
                                                </td>
                                            )}
                                            {show('combined_value') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20">
                                                    {player.fc_combined_value?.toFixed(0) || '—'}
                                                </td>
                                            )}
                                            {show('trend_30d') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right bg-blue-50/50 dark:bg-blue-950/20">
                                                    {player.fc_trend_30_day ? (
                                                        <span className={player.fc_trend_30_day > 0 ? 'text-green-600 dark:text-green-400' : player.fc_trend_30_day < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}>
                                                            {player.fc_trend_30_day > 0 ? '+' : ''}{player.fc_trend_30_day}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                            )}
                                            {show('trade_freq') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20">
                                                    {player.fc_trade_frequency ? Number(player.fc_trade_frequency).toFixed(2) : '—'}
                                                </td>
                                            )}
                                            {show('vff_rank') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-purple-50/50 dark:bg-purple-950/20">
                                                    {(sf ? player.rank_sf_overall : player.rank_1qb_overall) || '—'}
                                                </td>
                                            )}
                                            {show('vff_pos') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-purple-50/50 dark:bg-purple-950/20">
                                                    {player.position}{(sf ? player.rank_sf_pos : player.rank_1qb_pos) || '—'}
                                                </td>
                                            )}
                                            {show('tier') && (
                                                <td className="hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-purple-50/50 dark:bg-purple-950/20">
                                                    {(sf ? player.rank_sf_tier : player.rank_1qb_tier) || '—'}
                                                </td>
                                            )}
                                            <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                                                <button
                                                    onClick={() => makePick(player.id)}
                                                    className="px-2 sm:px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                                                >
                                                    Draft
                                                </button>
                                            </td>
                                        </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Draft Board + Roster Sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Draft Board */}
                    <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden order-2 lg:order-1">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                                <thead className="bg-zinc-50 dark:bg-zinc-950/50">
                                    <tr>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase">Round</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase">Pick</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase hidden sm:table-cell">Team</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase">Player</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase">Pos</th>
                                        <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-zinc-500 uppercase hidden sm:table-cell">Value</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {picks.map((pick, idx) => (
                                        <tr
                                            key={idx}
                                            className={`${
                                                idx === currentPickIndex
                                                    ? 'bg-indigo-50 dark:bg-indigo-950/20'
                                                    : pick.teamId === userTeamId && pick.playerId
                                                    ? 'bg-green-50 dark:bg-green-950/20'
                                                    : ''
                                            }`}
                                        >
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                                {pick.round}
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                                {pick.pick}
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">
                                                {pick.teamName}
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                                {pick.playerName || '—'}
                                            </td>
                                            <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                                                {pick.playerPosition || '—'}
                                            </td>
                                            <td className="hidden sm:table-cell px-4 py-3 text-sm text-right text-zinc-900 dark:text-zinc-100">
                                                {pick.playerValue ? pick.playerValue.toFixed(0) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Your Roster Sidebar */}
                    {userTeamId !== null && draftStarted && (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 order-1 lg:order-2">
                            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                                Your Roster
                            </h3>
                            <div className="space-y-4">
                                {/* Position Groups */}
                                {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                                    const userTeam = teams.find(t => t.id === userTeamId);
                                    const existingPlayers = userTeam?.players.filter(p => p.position === pos) || [];
                                    const draftedPlayers = picks
                                        .filter(p => p.teamId === userTeamId && p.playerId && p.playerPosition === pos)
                                        .map(p => ({
                                            full_name: p.playerName!,
                                            fc_value: p.playerValue || 0,
                                        }));
                                    const allPlayers = [...existingPlayers, ...draftedPlayers];
                                    const totalValue = allPlayers.reduce((sum, p) => sum + (p.fc_value || 0), 0);

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
                                                        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))
                                                        .map((player, idx) => (
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

                {/* Trade Modal */}
                {showTradeModal && userTeamId !== null && currentPick && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowTradeModal(false)}>
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-6 z-10">
                                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                                    Trade Evaluator
                                </h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Select additional assets to include in the trade package
                                </p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Current Pick (always included) */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                                        Current Pick (Included)
                                    </h3>
                                    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                                {currentPick.round}.{String(currentPick.pick).padStart(2, '0')}
                                            </span>
                                            <span className="text-sm text-zinc-600 dark:text-zinc-400">
                                                ~{(() => {
                                                    const round = currentPick.round;
                                                    const pick = currentPick.pick;
                                                    let pickValue = 0;
                                                    if (round === 1) pickValue = Math.max(2000, 6700 - (pick - 1) * 400);
                                                    else if (round === 2) pickValue = Math.max(1200, 1900 - (pick - 1) * 60);
                                                    else if (round === 3) pickValue = Math.max(700, 1100 - (pick - 1) * 35);
                                                    else if (round === 4) pickValue = Math.max(400, 650 - (pick - 1) * 20);
                                                    else pickValue = Math.max(200, 350 - (pick - 1) * 15);
                                                    return pickValue.toLocaleString();
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Additional Assets */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                                        Additional Assets (Optional)
                                    </h3>
                                    
                                    {/* Future Picks */}
                                    {(() => {
                                        const userTeam = teams.find(t => t.id === userTeamId);
                                        const futurePicks = userTeam?.draftPicks.filter(p => p.season > new Date().getFullYear()) || [];
                                        
                                        return futurePicks.length > 0 && (
                                            <div className="mb-4">
                                                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Future Picks</div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {futurePicks.map((pick, idx) => {
                                                        const assetId = `pick_${pick.season}_${pick.round}`;
                                                        const isSelected = selectedTradeAssets.has(assetId);
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => toggleTradeAsset(assetId)}
                                                                className={`p-2 rounded-lg border-2 text-sm transition-colors ${
                                                                    isSelected
                                                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-100'
                                                                        : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                                                }`}
                                                            >
                                                                {pick.season} R{pick.round}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Rostered Players */}
                                    {(() => {
                                        const userTeam = teams.find(t => t.id === userTeamId);
                                        const rosteredPlayers = userTeam?.players || [];
                                        
                                        return rosteredPlayers.length > 0 && (
                                            <div>
                                                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Rostered Players</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                                    {rosteredPlayers
                                                        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))
                                                        .map((player) => {
                                                            const assetId = `player_${player.id}`;
                                                            const isSelected = selectedTradeAssets.has(assetId);
                                                            return (
                                                                <button
                                                                    key={player.id}
                                                                    onClick={() => toggleTradeAsset(assetId)}
                                                                    className={`p-2 rounded-lg border-2 text-sm text-left transition-colors ${
                                                                        isSelected
                                                                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-100'
                                                                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                                                    }`}
                                                                >
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="truncate">{player.full_name}</span>
                                                                        <span className="ml-2 text-xs text-zinc-500">
                                                                            {(player.fc_value || 0).toLocaleString()}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-xs text-zinc-500 mt-1">
                                                                        {player.position} • {player.team || 'FA'}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Trade Package Summary */}
                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                            Trade Package Value
                                        </span>
                                        <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                            {calculateTradeValue().toLocaleString()}
                                        </span>
                                    </div>
                                    {selectedTradeAssets.size > 0 && (
                                        <button
                                            onClick={() => setSelectedTradeAssets(new Set())}
                                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                        >
                                            Clear selections
                                        </button>
                                    )}
                                </div>

                                {/* Trade Targets */}
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
                                        Trade Targets (±10% value)
                                    </h3>
                                    {tradeTargets.length === 0 ? (
                                        <div className="text-center py-8">
                                            <div className="text-zinc-500 dark:text-zinc-400 mb-2">
                                                No players found in this value range
                                            </div>
                                            <div className="text-xs text-zinc-400">
                                                Looking for players between {(calculateTradeValue() * 0.9).toFixed(0)} - {(calculateTradeValue() * 1.1).toFixed(0)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-96 overflow-y-auto">
                                            {tradeTargets.map(player => {
                                                const valueDiff = (player.fc_value || 0) - calculateTradeValue();
                                                const diffPercent = ((valueDiff / calculateTradeValue()) * 100).toFixed(1);
                                                
                                                return (
                                                    <div
                                                        key={player.id}
                                                        className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                                    >
                                                        <div className="flex-1">
                                                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                                                                {player.full_name}
                                                            </div>
                                                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                                                {player.position} • {player.team || 'FA'} • {player.teamName}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                                {(player.fc_value || 0).toLocaleString()}
                                                            </div>
                                                            <div className={`text-xs font-medium ${
                                                                valueDiff > 0 
                                                                    ? 'text-green-600 dark:text-green-400' 
                                                                    : valueDiff < 0 
                                                                    ? 'text-red-600 dark:text-red-400'
                                                                    : 'text-zinc-500'
                                                            }`}>
                                                                {valueDiff > 0 ? '+' : ''}{diffPercent}%
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Close Button */}
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => {
                                            setShowTradeModal(false);
                                            setSelectedTradeAssets(new Set());
                                        }}
                                        className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
