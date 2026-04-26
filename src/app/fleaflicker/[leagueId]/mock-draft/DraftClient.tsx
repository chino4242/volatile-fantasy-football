'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Download, Play, ArrowUpDown, ArrowUp, ArrowDown, Star, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { ColumnPicker, useColumnState } from '@/components/ColumnPicker';
import type { ColumnDef } from '@/components/ColumnPicker';
import { PositionScarcityChart } from '@/components/PositionScarcityChart';
import { useAuth } from '@/hooks/useUser';

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
    zap_score?: number | null;
    zap_category?: string | null;
    zap_stale?: boolean;
    zap_comps?: string | null;
    zap_analysis?: string | null;
    zap_nfl_team?: string | null;
    zap_ai?: { confidence: number | null; summary: string | null; bull_case: string | null; bear_case: string | null; comps: string | null } | null;
    writeups?: { source: string; analysis_text: string; ai_confidence?: number | null; ai_summary?: string | null; ai_bull_case?: string | null; ai_bear_case?: string | null; ai_comps?: string | null }[] | null;
    rookie_rank?: number | null;
    rookie_pos_rank?: number | null;
    rookie_tier?: number | null;
    redraft_rank_overall?: number | null;
    redraft_rank_pos?: number | null;
    redraft_rank_tier?: number | null;
    droppedByTeam?: string;
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
    pickReason?: string;
}

interface DraftClientProps {
    leagueId: string;
    teams: Team[];
    freeAgents: Player[];
    format: string;
    rankingsVintage?: string | null;
    redraftVintage?: string | null;
    platform?: 'sleeper' | 'fleaflicker';
    rosterSlots?: { QB: number; RB: number; WR: number; TE: number; FLEX: number };
    keeperCount?: number;
    mode?: 'mock' | 'live';
}

const ROUNDS = 5;

const MOCK_DRAFT_COLUMNS: ColumnDef[] = [
    { key: 'position', label: 'Position', defaultOn: true, group: 'core' },
    { key: 'team', label: 'Team', defaultOn: true, group: 'core' },
    { key: 'market_value', label: 'Market Value', defaultOn: true, group: 'core' },
    { key: 'fc_rank', label: 'FC Overall', defaultOn: true, group: 'fc' },
    { key: 'fc_pos_rank', label: 'FC Pos Rank', defaultOn: true, group: 'fc' },
    { key: 'combined_value', label: 'Combined', defaultOn: false, group: 'fc' },
    { key: 'trend_30d', label: '30d Trend', defaultOn: false, group: 'fc' },
    { key: 'trade_freq', label: 'Trade Freq', defaultOn: false, group: 'fc' },
    { key: 'vff_rank', label: 'VFF Rank', defaultOn: false, group: 'internal' },
    { key: 'vff_pos', label: 'VFF Pos', defaultOn: false, group: 'internal' },
    { key: 'tier', label: 'Tier', defaultOn: false, group: 'internal' },
    { key: 'zap', label: 'ZAP / Yr 2', defaultOn: true, group: 'prospect' },
    { key: 'rookie_pos_rank', label: 'Pos Rank', defaultOn: true, group: 'prospect' },
    { key: 'rookie_tier', label: 'Tier', defaultOn: true, group: 'prospect' },
    { key: 'redraft_rank', label: 'Redraft Rank', defaultOn: true, group: 'redraft' },
    { key: 'redraft_pos', label: 'Redraft Pos', defaultOn: true, group: 'redraft' },
    { key: 'redraft_tier', label: 'Redraft Tier', defaultOn: true, group: 'redraft' },
];

export default function DraftClient({ leagueId, teams, freeAgents, format, rankingsVintage, redraftVintage, platform = 'fleaflicker', rosterSlots, keeperCount, mode = 'mock' }: DraftClientProps) {
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const userId = platform === 'sleeper' ? sleeperUsername : fleaflickerUsername;

    // Draft history
    interface DraftHistoryEntry { id: string; mode: string; created_at: string; draft_data: { userTeamName: string; grade: string; picks: { round: number; pick: number; teamName: string; playerName: string; playerPosition: string; playerValue: number }[] } }
    const [draftHistoryList, setDraftHistoryList] = useState<DraftHistoryEntry[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

    useEffect(() => {
        if (userId && leagueId) {
            fetch(`/api/draft-history?leagueId=${leagueId}&userId=${userId}`)
                .then(r => r.json()).then(data => { if (Array.isArray(data)) setDraftHistoryList(data); }).catch(() => {});
        }
    }, [userId, leagueId]);

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
    const [activeTeams, setActiveTeams] = useState<Team[]>(teams);
    const [userTeamId, setUserTeamId] = useState<number | null>(null);
    const [draftStarted, setDraftStarted] = useState(false);
    const [preDraftValues, setPreDraftValues] = useState<Record<number, { total: number; QB: number; RB: number; WR: number; TE: number }>>({});
    const isSleeper = platform === 'sleeper';
    const hasDraftOrder = draftOrder.length > 0;
    const [setupComplete, setSetupComplete] = useState(!isSleeper || hasDraftOrder);
    const [keepersConfirmed, setKeepersConfirmed] = useState(!keeperCount || keeperCount === 0);
    const [selectedKeepers, setSelectedKeepers] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (userTeamId && keeperCount && keeperCount > 0 && !keepersConfirmed) {
            const userTeam = activeTeams.find(t => t.id === userTeamId);
            if (userTeam && selectedKeepers.size === 0) {
                const sortedPlayers = [...userTeam.players].sort((a,b) => (b.fc_value || 0) - (a.fc_value || 0));
                const topKeepers = sortedPlayers.slice(0, keeperCount).map(p => p.id);
                setSelectedKeepers(new Set(topKeepers));
            }
        }
    }, [userTeamId, keeperCount, keepersConfirmed, activeTeams]); // run when team selected or count changes

    const handleConfirmKeepers = () => {
        if (!keeperCount) return;

        const updatedTeams = [...activeTeams];
        const newDroppedPlayers: (Player & { droppedByTeam?: string })[] = [];

        for (let i = 0; i < updatedTeams.length; i++) {
            const team = updatedTeams[i];
            let keptPlayers = [...team.players];

            if (team.id === userTeamId) {
                // Keep only selected
                keptPlayers = team.players.filter(p => selectedKeepers.has(p.id));
                const dropped = team.players.filter(p => !selectedKeepers.has(p.id));
                newDroppedPlayers.push(...dropped.map(p => ({ ...p, droppedByTeam: team.name })));
            } else {
                // Auto-prune
                if (team.players.length > keeperCount) {
                    const sorted = [...team.players].sort((a,b) => (b.fc_value || 0) - (a.fc_value || 0));
                    keptPlayers = sorted.slice(0, keeperCount);
                    const dropped = sorted.slice(keeperCount);
                    newDroppedPlayers.push(...dropped.map(p => ({ ...p, droppedByTeam: team.name })));
                }
            }

            // Recalculate position values
            const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
            keptPlayers.forEach(p => {
                if (p.position && p.fc_value) {
                    positionValues[p.position as keyof typeof positionValues] += p.fc_value;
                }
            });

            updatedTeams[i] = {
                ...team,
                players: keptPlayers,
                positionValues
            };
        }

        const newFreeAgents = [...availablePlayers, ...newDroppedPlayers].sort((a,b) => (b.fc_value || 0) - (a.fc_value || 0));
        
        setActiveTeams(updatedTeams);
        setAvailablePlayers(newFreeAgents);
        setKeepersConfirmed(true);
    };

    // Draft setup: slot assignments per round — Record<`${round}.${slot}`, teamId>
    // Default: each team owns their slot in every round (no trades)
    type PickAssignments = Record<string, number>;
    const storageKey = `vff_draft_setup_${leagueId}`;

    const buildDefaultAssignments = useCallback((): { assignments: PickAssignments; userSlot: number | null } => {
        const assignments: PickAssignments = {};
        teams.forEach((team, i) => {
            for (let round = 1; round <= ROUNDS; round++) {
                assignments[`${round}.${i + 1}`] = team.id;
            }
        });
        return { assignments, userSlot: null };
    }, [teams]);

    const [pickAssignments, setPickAssignments] = useState<PickAssignments>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.assignments) return parsed.assignments;
                } catch {}
            }
        }
        return buildDefaultAssignments().assignments;
    });
    const [userDraftSlot, setUserDraftSlot] = useState<number | null>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.userSlot) return parsed.userSlot;
                } catch {}
            }
        }
        return null;
    });
    const [editingPick, setEditingPick] = useState<string | null>(null);

    // Save setup to localStorage whenever it changes
    useEffect(() => {
        if (typeof window !== 'undefined' && setupComplete) {
            localStorage.setItem(storageKey, JSON.stringify({ assignments: pickAssignments, userSlot: userDraftSlot }));
        }
    }, [pickAssignments, userDraftSlot, setupComplete, storageKey]);

    // Build draftOrder from pickAssignments
    const setupDraftOrder = useMemo(() => {
        const order: DraftPick[] = [];
        const numTeams = teams.length;
        for (let round = 1; round <= ROUNDS; round++) {
            for (let slot = 1; slot <= numTeams; slot++) {
                const teamId = pickAssignments[`${round}.${slot}`];
                const team = teams.find(t => t.id === teamId);
                if (team) {
                    order.push({ round, pick: slot, teamId: team.id, teamName: team.name });
                }
            }
        }
        return order;
    }, [pickAssignments, teams]);
    const [positionFilter, setPositionFilter] = useState<string>('ALL');
    const [sortColumn, setSortColumn] = useState<string>('fc_value');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const vffLabel = rankingsVintage ? `VFF Rankings (${rankingsVintage})` : 'VFF Rankings';
    const redraftLabel = redraftVintage ? `Redraft (${redraftVintage})` : 'Redraft';
    const MD_GROUPS = [
        { id: 'core', label: 'Core' },
        { id: 'fc', label: 'FantasyCalc' },
        { id: 'internal', label: vffLabel },
        { id: 'redraft', label: redraftLabel },
        { id: 'prospect', label: 'Prospect' },
    ];
    const { visibleCols: visibleColumns, columnOrder, toggle: toggleCol, reorder, orderedVisible } = useColumnState(MOCK_DRAFT_COLUMNS, 'vff_mock_draft_columns');
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [selectedTradeAssets, setSelectedTradeAssets] = useState<Set<string>>(new Set());
    const [tradeSearch, setTradeSearch] = useState('');
    const [tradeTargetPlayer, setTradeTargetPlayer] = useState<(Player & { teamName: string; teamId: number }) | null>(null);
    const [theirTradeAssets, setTheirTradeAssets] = useState<Set<string>>(new Set());
    const [tradePosFilter, setTradePosFilter] = useState<string>('ALL');
    const [tradeForPick, setTradeForPick] = useState(false); // true when trading TO ACQUIRE the current pick
    const [expandedProspect, setExpandedProspect] = useState<string | null>(null);
    const [activeWriteupTab, setActiveWriteupTab] = useState<string>('late_round');
    const [selectedDraftPlayer, setSelectedDraftPlayer] = useState<Player | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [watchList, setWatchList] = useState<Set<string>>(() => {
        if (typeof window !== 'undefined') {
            try { const saved = localStorage.getItem(`vff_watchlist_${leagueId}`); if (saved) return new Set(JSON.parse(saved)); } catch {}
        }
        return new Set();
    });
    const [showWatchListOnly, setShowWatchListOnly] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(`vff_watchlist_${leagueId}`, JSON.stringify([...watchList]));
        }
    }, [watchList, leagueId]);

    const toggleWatchList = (playerId: string) => {
        setWatchList(prev => { const next = new Set(prev); if (next.has(playerId)) next.delete(playerId); else next.add(playerId); return next; });
    };

    // My roster: pre-draft keepers + drafted picks
    const draftedPlayerMap = useRef(new Map<string, any>());

    const myRosterPlayers = useMemo(() => {
        if (userTeamId === null) return [];
        const myTeam = activeTeams.find(t => t.id === userTeamId);
        const drafted = picks
            .filter(p => p.teamId === userTeamId && p.playerId)
            .map(p => draftedPlayerMap.current.get(p.playerId!))
            .filter(Boolean);
        return [...(myTeam?.players || []), ...drafted];
    }, [userTeamId, activeTeams, picks]);

    // Auto-simulate CPU picks
    const isLive = mode === 'live';
    const currentPick = picks[currentPickIndex];
    const isUserPick = currentPick && userTeamId !== null && currentPick.teamId === userTeamId;
    const isDraftComplete = currentPickIndex >= picks.length;

    const makePick = (playerId: string, reason?: string) => {
        const player = availablePlayers.find(p => p.id === playerId);
        if (!player) return;

        draftedPlayerMap.current.set(player.id, player);

        const updatedPicks = [...picks];
        updatedPicks[currentPickIndex] = {
            ...updatedPicks[currentPickIndex],
            playerId: player.id,
            playerName: player.full_name,
            playerPosition: player.position || undefined,
            playerValue: player.fc_value || undefined,
            pickReason: reason,
        };

        setPicks(updatedPicks);
        setAvailablePlayers(availablePlayers.filter(p => p.id !== playerId));
        setCurrentPickIndex(currentPickIndex + 1);
    };

    const undoLastPick = () => {
        if (currentPickIndex === 0) return;
        const prevIdx = currentPickIndex - 1;
        const prevPick = picks[prevIdx];
        if (!prevPick.playerId) return;
        // Restore the player to available pool
        const player = freeAgents.find(p => p.id === prevPick.playerId);
        if (player) setAvailablePlayers(prev => [...prev, player].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)));
        // Clear the pick
        const updatedPicks = [...picks];
        updatedPicks[prevIdx] = { ...updatedPicks[prevIdx], playerId: undefined, playerName: undefined, playerPosition: undefined, playerValue: undefined, pickReason: undefined };
        setPicks(updatedPicks);
        setCurrentPickIndex(prevIdx);
    };

    // Save draft to DB on completion
    const draftSavedRef = useRef(false);
    useEffect(() => {
        if (isDraftComplete && userId && userTeamId !== null && !draftSavedRef.current) {
            draftSavedRef.current = true;
            const myTeam = activeTeams.find(t => t.id === userTeamId);
            const myPicks = picks.filter(p => p.teamId === userTeamId && p.playerName);
            const draftedValue = myPicks.reduce((s, p) => s + (p.playerValue || 0), 0);
            const allValues = activeTeams.map(t => picks.filter(p => p.teamId === t.id && p.playerName).reduce((s, p) => s + (p.playerValue || 0), 0));
            const maxVal = Math.max(...allValues, 1);
            const pct = draftedValue / maxVal;
            const grade = pct >= 0.9 ? 'A+' : pct >= 0.8 ? 'A' : pct >= 0.7 ? 'A-' : pct >= 0.6 ? 'B+' : pct >= 0.5 ? 'B' : pct >= 0.4 ? 'B-' : pct >= 0.3 ? 'C+' : 'C';
            fetch('/api/draft-history', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    leagueId, userId, platform, mode,
                    draftData: {
                        userTeamName: myTeam?.name || '',
                        grade,
                        picks: picks.filter(p => p.playerName).map(p => ({ round: p.round, pick: p.pick, teamName: p.teamName, playerName: p.playerName, playerPosition: p.playerPosition, playerValue: p.playerValue || 0 })),
                    },
                }),
            }).then(() => {
                // Refresh history list
                fetch(`/api/draft-history?leagueId=${leagueId}&userId=${userId}`).then(r => r.json()).then(data => { if (Array.isArray(data)) setDraftHistoryList(data); }).catch(() => {});
            }).catch(() => {});
        }
        if (!isDraftComplete) draftSavedRef.current = false;
    }, [isDraftComplete]);

    // Auto-simulate non-user picks
    const pickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!isLive && draftStarted && !isDraftComplete && currentPick && !isUserPick && userTeamId !== null && availablePlayers.length > 0) {
            if (pickTimerRef.current) return; // already scheduled
            pickTimerRef.current = setTimeout(() => {
                pickTimerRef.current = null;
                const result = simulatePick(currentPick.teamId);
                if (result) {
                    makePick(result.player.id, result.reason);
                }
            }, 1500);
        }
        return () => {
            if (pickTimerRef.current) { clearTimeout(pickTimerRef.current); pickTimerRef.current = null; }
        };
    }, [currentPickIndex, draftStarted, userTeamId, picks]);

    // Default roster slots if not provided (1QB, 2RB, 3WR, 1TE, 2FLEX)
    const slots = rosterSlots || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 };
    // FLEX counts toward RB/WR/TE proportionally
    const effectiveSlots = {
        QB: slots.QB,
        RB: slots.RB + slots.FLEX * 0.33,
        WR: slots.WR + slots.FLEX * 0.5,
        TE: slots.TE + slots.FLEX * 0.17,
    };
    const totalSlots = effectiveSlots.QB + effectiveSlots.RB + effectiveSlots.WR + effectiveSlots.TE;
    const TARGET_ALLOCATION = {
        QB: effectiveSlots.QB / totalSlots,
        RB: effectiveSlots.RB / totalSlots,
        WR: effectiveSlots.WR / totalSlots,
        TE: effectiveSlots.TE / totalSlots,
    };

    // Waiver scarcity: avg value of top N free agents at each position (N = league size)
    const waiverScarcity = useMemo(() => {
        const leagueSize = teams.length;
        const byPos: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };
        availablePlayers.forEach(p => {
            if (p.position && p.position in byPos && p.fc_value) {
                byPos[p.position].push(p.fc_value);
            }
        });
        const avgTop: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const sorted = byPos[pos].sort((a, b) => b - a).slice(0, leagueSize);
            avgTop[pos] = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
        });
        // Normalize: lower avg = more scarce = higher multiplier
        const maxAvg = Math.max(...Object.values(avgTop), 1);
        const scarcity: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            scarcity[pos] = avgTop[pos] > 0 ? 1 + (maxAvg - avgTop[pos]) / maxAvg : 1;
        });
        return scarcity;
    }, [availablePlayers, teams.length]);

    const calculatePositionalNeed = (teamId: number): Record<string, number> => {
        const team = activeTeams.find(t => t.id === teamId);
        if (!team) return { QB: 0, RB: 0, WR: 0, TE: 0 };

        // Count rostered + drafted players at each position
        const rosterCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };
        team.players.forEach(p => {
            if (p.position && p.position in rosterCounts) rosterCounts[p.position as keyof typeof rosterCounts]++;
        });
        picks.filter(p => p.teamId === teamId && p.playerPosition).forEach(p => {
            const pos = p.playerPosition as keyof typeof rosterCounts;
            if (pos in rosterCounts) rosterCounts[pos]++;
        });

        // Include values for allocation calc
        const draftedValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
        picks.filter(p => p.teamId === teamId && p.playerPosition && p.playerValue).forEach(p => {
            const pos = p.playerPosition as keyof typeof draftedValues;
            if (pos in draftedValues) draftedValues[pos] += p.playerValue!;
        });
        const currentValues = {
            QB: team.positionValues.QB + draftedValues.QB,
            RB: team.positionValues.RB + draftedValues.RB,
            WR: team.positionValues.WR + draftedValues.WR,
            TE: team.positionValues.TE + draftedValues.TE,
        };
        const totalValue = currentValues.QB + currentValues.RB + currentValues.WR + currentValues.TE || 1;

        const needs: Record<string, number> = {};
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            // Allocation need (0-1)
            const currentPct = currentValues[pos] / totalValue;
            const targetPct = TARGET_ALLOCATION[pos];
            const allocNeed = Math.max(0, Math.min(1, (targetPct - currentPct) / targetPct));

            // Depth need: if below starting requirement
            const startReq = Math.ceil(effectiveSlots[pos]);
            const depthNeed = rosterCounts[pos] < startReq ? (startReq - rosterCounts[pos]) / startReq : 0;

            // Combine: 50% allocation, 30% depth, 20% scarcity boost
            needs[pos] = allocNeed * 0.5 + depthNeed * 0.3 + (allocNeed * (waiverScarcity[pos] - 1)) * 0.2;
        });

        return needs;
    };

    const scorePlayer = (player: Player, teamId: number): number => {
        let value = player.fc_value || 0;
        
        // Draft Supply/Demand Adjustments
        if (player.position === 'QB') {
            value *= format === 'sf' ? 0.85 : 0.55;
        } else if (player.position === 'TE') {
            value *= 0.85;
        }

        // ZAP category modifier (prospect scouting signal)
        if (player.zap_category && !player.zap_stale) {
            const zapMod: Record<string, number> = { 'LEGENDARY PERFORMER': 0.15, 'ELITE PRODUCER': 0.10, 'WEEKLY STARTER': 0.05, 'FLEX PLAY': 0, 'BENCHWARMER': -0.05, 'WAIVER WIRE ADD': -0.10, 'DART THROW': -0.10 };
            value *= 1 + (zapMod[player.zap_category.toUpperCase()] || 0);
        }

        // AI confidence modifier from writeup analysis
        if (player.writeups?.length) {
            const bestConfidence = Math.max(...player.writeups.map(w => w.ai_confidence || 0));
            if (bestConfidence > 0) {
                value *= 1 + (bestConfidence - 6) * 0.02; // 10 = +8%, 6 = 0%, 2 = -8%
            }
        }

        const needs = calculatePositionalNeed(teamId);
        const posNeed = needs[player.position || ''] || 0;

        return (value * 0.92) + (posNeed * value * 0.08);
    };

    const simulatePick = (teamId: number): { player: Player; reason: string } | null => {
        if (availablePlayers.length === 0) return null;

        const needs = calculatePositionalNeed(teamId);
        const scoredPlayers = availablePlayers.map(p => {
            const value = p.fc_value || 0;
            const posNeed = needs[p.position || ''] || 0;
            return { player: p, score: scorePlayer(p, teamId), value, posNeed };
        });

        scoredPlayers.sort((a, b) => b.score - a.score);
        const topCandidates = scoredPlayers.slice(0, 3);
        
        const squared = topCandidates.map(c => ({ ...c, w: c.score * c.score }));
        const totalW = squared.reduce((sum, c) => sum + c.w, 0);
        let random = Math.random() * totalW;
        
        for (let i = 0; i < squared.length; i++) {
            random -= squared[i].w;
            if (random <= 0) {
                const c = squared[i];
                const reason = `#${i + 1} of 3 | Value: ${c.value} | ${c.player.position} need: ${(c.posNeed * 100).toFixed(0)}% | Score: ${c.score.toFixed(0)}`;
                return { player: c.player, reason };
            }
        }

        const c = topCandidates[0];
        return { player: c.player, reason: `BPA | Value: ${c.value} | Score: ${c.score.toFixed(0)}` };
    };

    const executeTrade = (targetPlayer: Player & { teamName: string }) => {
        if (!userTeamId || !currentPick) return;

        const targetTeamId = activeTeams.find(t => t.name === targetPlayer.teamName)?.id;
        if (!targetTeamId) return;

        // Collect outgoing player IDs from both sides
        const userOutgoingPlayerIds: string[] = [];
        selectedTradeAssets.forEach(a => { if (a.startsWith('player_')) userOutgoingPlayerIds.push(a.replace('player_', '')); });
        const theirOutgoingPlayerIds: string[] = [targetPlayer.id];
        theirTradeAssets.forEach(a => { if (a.startsWith('player_')) theirOutgoingPlayerIds.push(a.replace('player_', '')); });

        // Update teams
        setActiveTeams(prev => prev.map(team => {
            if (team.id === userTeamId) {
                const playersAfter = team.players.filter(p => !userOutgoingPlayerIds.includes(p.id));
                const theirTeam = prev.find(t => t.id === targetTeamId);
                theirOutgoingPlayerIds.forEach(pid => {
                    const player = theirTeam?.players.find(p => p.id === pid);
                    if (player) playersAfter.push(player);
                });
                return { ...team, players: playersAfter };
            }
            if (team.id === targetTeamId) {
                const playersAfter = team.players.filter(p => !theirOutgoingPlayerIds.includes(p.id));
                const userTeam = prev.find(t => t.id === userTeamId);
                userOutgoingPlayerIds.forEach(pid => {
                    const player = userTeam?.players.find(p => p.id === pid);
                    if (player) playersAfter.push(player);
                });
                return { ...team, players: playersAfter };
            }
            return team;
        }));

        // Reassign current pick to the target team
        setPicks(prev => prev.map((p, idx) => {
            if (idx === currentPickIndex) return { ...p, teamId: targetTeamId, teamName: targetPlayer.teamName };
            return p;
        }));

        // Close modal and reset
        setShowTradeModal(false);
        setSelectedTradeAssets(new Set());
        setTheirTradeAssets(new Set());
        setTradeTargetPlayer(null);
        setTradeSearch('');
    };

    const resetDraft = () => {
        setPicks(isSleeper && !hasDraftOrder ? setupDraftOrder : draftOrder);
        setCurrentPickIndex(0);
        setAvailablePlayers(freeAgents);
        setActiveTeams(teams);
        setUserTeamId(null);
        setKeepersConfirmed(!keeperCount || keeperCount === 0);
        setSelectedKeepers(new Set());
        setSetupComplete(!isSleeper || hasDraftOrder);
        setDraftStarted(false);
    };

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

    const sf = format === 'sf';
    const coreTh = "px-2 sm:px-4 py-2 sm:py-3 text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors";
    const fcTh = "hidden md:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-blue-50/50 dark:bg-blue-950/20 cursor-pointer group hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors";
    const vffTh = "hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-purple-50/50 dark:bg-purple-950/20 cursor-pointer group hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors";
    const vffTitle = rankingsVintage ? `VFF Rankings from ${rankingsVintage}` : undefined;

    const redraftTh = "hidden lg:table-cell px-4 py-3 text-right text-xs font-medium text-zinc-400 uppercase bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer group hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors";
    const redraftTitle = redraftVintage ? `Redraft Rankings from ${redraftVintage}` : undefined;

    const headerMap: Record<string, { className: string; sortKey: string; label: string; title?: string }> = {
        position: { className: `${coreTh} text-left`, sortKey: 'position', label: 'Pos' },
        team: { className: `${coreTh} hidden sm:table-cell text-left`, sortKey: 'team', label: 'Team' },
        market_value: { className: `${coreTh} text-right`, sortKey: 'fc_value', label: 'Value' },
        fc_rank: { className: fcTh, sortKey: sf ? 'fc_rank_sf' : 'fc_rank_1qb', label: 'FC Rank' },
        fc_pos_rank: { className: fcTh, sortKey: sf ? 'fc_position_rank_sf' : 'fc_position_rank_1qb', label: 'FC Pos' },
        combined_value: { className: `hidden lg:table-cell ${fcTh.replace('hidden md:table-cell ', '')}`, sortKey: 'fc_combined_value', label: 'Combined' },
        trend_30d: { className: `hidden lg:table-cell ${fcTh.replace('hidden md:table-cell ', '')}`, sortKey: 'fc_trend_30_day', label: '30d' },
        trade_freq: { className: `hidden lg:table-cell ${fcTh.replace('hidden md:table-cell ', '')}`, sortKey: 'fc_trade_frequency', label: 'Traded' },
        vff_rank: { className: vffTh, sortKey: sf ? 'rank_sf_overall' : 'rank_1qb_overall', label: 'VFF Rank', title: vffTitle },
        vff_pos: { className: vffTh, sortKey: sf ? 'rank_sf_pos' : 'rank_1qb_pos', label: 'VFF Pos', title: vffTitle },
        tier: { className: vffTh, sortKey: sf ? 'rank_sf_tier' : 'rank_1qb_tier', label: 'Tier', title: vffTitle },
        zap: { className: `${fcTh.replace('hidden md:table-cell', 'hidden sm:table-cell').replace('bg-blue-50/50 dark:bg-blue-950/20', 'bg-emerald-50/50 dark:bg-emerald-950/20').replace('hover:bg-blue-100/50 dark:hover:bg-blue-900/30', 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30')}`, sortKey: 'zap_score', label: 'ZAP / Yr 2' },
        rookie_pos_rank: { className: `${fcTh.replace('hidden md:table-cell', 'hidden sm:table-cell').replace('bg-blue-50/50 dark:bg-blue-950/20', 'bg-emerald-50/50 dark:bg-emerald-950/20').replace('hover:bg-blue-100/50 dark:hover:bg-blue-900/30', 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30')}`, sortKey: 'rookie_pos_rank', label: 'Pos Rank' },
        rookie_tier: { className: `${fcTh.replace('hidden md:table-cell', 'hidden sm:table-cell').replace('bg-blue-50/50 dark:bg-blue-950/20', 'bg-emerald-50/50 dark:bg-emerald-950/20').replace('hover:bg-blue-100/50 dark:hover:bg-blue-900/30', 'hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30')}`, sortKey: 'rookie_tier', label: 'Tier' },
        redraft_rank: { className: redraftTh, sortKey: 'redraft_rank_overall', label: 'Rank', title: redraftTitle },
        redraft_pos: { className: redraftTh, sortKey: 'redraft_rank_pos', label: 'Pos', title: redraftTitle },
        redraft_tier: { className: redraftTh, sortKey: 'redraft_rank_tier', label: 'Tier', title: redraftTitle },
    };

    const renderHeader = (key: string) => {
        const h = headerMap[key];
        if (!h) return null;
        return <th key={key} className={h.className} onClick={() => handleSort(h.sortKey)} title={h.title}>{h.label} <SortIcon column={h.sortKey} /></th>;
    };

    const fcTd = "hidden md:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-blue-50/50 dark:bg-blue-950/20";
    const vffTd = "hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-purple-50/50 dark:bg-purple-950/20";

    const redraftTd = "hidden lg:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-amber-50/50 dark:bg-amber-950/20";

    const renderCell = (key: string, player: Player) => {
        switch (key) {
            case 'position': return <td key={key} className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">{player.position}</td>;
            case 'team': return <td key={key} className="hidden sm:table-cell px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{player.team || '—'}</td>;
            case 'market_value': return <td key={key} className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-right text-zinc-900 dark:text-zinc-100">{player.fc_value?.toFixed(0) || '—'}</td>;
            case 'fc_rank': return <td key={key} className={fcTd}>{(sf ? player.fc_rank_sf : player.fc_rank_1qb) || '—'}</td>;
            case 'fc_pos_rank': return <td key={key} className={fcTd}>{player.position}{(sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb) || '—'}</td>;
            case 'combined_value': return <td key={key} className={`${fcTd} hidden lg:table-cell`}>{player.fc_combined_value?.toFixed(0) || '—'}</td>;
            case 'trend_30d': return <td key={key} className="hidden lg:table-cell px-4 py-3 text-sm text-right bg-blue-50/50 dark:bg-blue-950/20">{player.fc_trend_30_day ? <span className={player.fc_trend_30_day > 0 ? 'text-green-600 dark:text-green-400' : player.fc_trend_30_day < 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}>{player.fc_trend_30_day > 0 ? '+' : ''}{player.fc_trend_30_day}</span> : '—'}</td>;
            case 'trade_freq': return <td key={key} className={`${fcTd} hidden lg:table-cell`}>{player.fc_trade_frequency ? Number(player.fc_trade_frequency).toFixed(2) : '—'}</td>;
            case 'vff_rank': return <td key={key} className={vffTd}>{(sf ? player.rank_sf_overall : player.rank_1qb_overall) || '—'}</td>;
            case 'vff_pos': return <td key={key} className={vffTd}>{player.position}{(sf ? player.rank_sf_pos : player.rank_1qb_pos) || '—'}</td>;
            case 'tier': return <td key={key} className={vffTd}>{(sf ? player.rank_sf_tier : player.rank_1qb_tier) || '—'}</td>;
            case 'zap': return <td key={key} className="hidden sm:table-cell px-4 py-3 text-sm text-right bg-emerald-50/50 dark:bg-emerald-950/20">{player.zap_score ? <span className={player.zap_stale ? 'text-zinc-400 dark:text-zinc-600 italic' : 'text-zinc-700 dark:text-zinc-300'} title={`${player.zap_category || ''}${player.zap_stale ? ' (stale)' : ''}`}>{player.zap_score.toFixed(1)}</span> : '—'}</td>;
            case 'rookie_pos_rank': { const zapTd = "hidden sm:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-emerald-50/50 dark:bg-emerald-950/20"; return <td key={key} className={zapTd}>{player.rookie_pos_rank ? `${player.position}${player.rookie_pos_rank}` : '—'}</td>; }
            case 'rookie_tier': { const zapTd = "hidden sm:table-cell px-4 py-3 text-sm text-right text-zinc-700 dark:text-zinc-300 bg-emerald-50/50 dark:bg-emerald-950/20"; return <td key={key} className={zapTd}>{player.rookie_tier || '—'}</td>; }
            case 'redraft_rank': return <td key={key} className={redraftTd}>{player.redraft_rank_overall || '—'}</td>;
            case 'redraft_pos': return <td key={key} className={redraftTd}>{player.redraft_rank_pos ? `${player.position}${player.redraft_rank_pos}` : '—'}</td>;
            case 'redraft_tier': return <td key={key} className={redraftTd}>{player.redraft_rank_tier || '—'}</td>;
            default: return null;
        }
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
    const estimatePickValue = (round: number, pick: number) => {
        // Use original free agent pool sorted by value — the Nth player represents
        // what you'd expect to draft at that slot
        const overall = (round - 1) * teams.length + pick;
        const sorted = [...freeAgents].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
        return sorted[overall - 1]?.fc_value || 0;
    };

    const estimateFuturePickValue = (round: number) => {
        if (round === 1) return 2900;
        if (round === 2) return 1500;
        if (round === 3) return 900;
        if (round === 4) return 500;
        return 300;
    };

    const calculateSideValue = (assets: Set<string>, teamPlayers: Player[], includeCurrentPick: boolean) => {
        let total = 0;
        if (includeCurrentPick && currentPick) total += estimatePickValue(currentPick.round, currentPick.pick);
        assets.forEach(assetId => {
            if (assetId.startsWith('player_')) {
                const player = teamPlayers.find(p => p.id === assetId.replace('player_', ''));
                if (player) total += player.fc_value || 0;
            } else if (assetId.startsWith('draftpick_')) {
                // Current draft pick: draftpick_round_slot — value based on BPA
                const [, r, s] = assetId.split('_');
                total += estimatePickValue(parseInt(r), parseInt(s));
            } else if (assetId.startsWith('pick_')) {
                // Future pick: pick_season_round
                const r = parseInt(assetId.split('_')[2]);
                total += estimateFuturePickValue(r);
            }
        });
        return total;
    };

    const calculateTradeValue = () => {
        const userTeam = activeTeams.find(t => t.id === userTeamId);
        if (!userTeam || !currentPick) return 0;
        return calculateSideValue(selectedTradeAssets, userTeam.players, true);
    };

    // Find trade targets
    const tradeTargets = useMemo(() => {
        if (!showTradeModal || !currentPick || !userTeamId) return [];
        
        const tradeValue = calculateTradeValue();
        const tolerance = 0.10; // 10% tolerance for auto-acceptance
        const minValue = tradeValue * (1 - tolerance);
        const maxValue = tradeValue * (1 + tolerance);

        // Get all rostered players from OTHER teams
        const rosteredPlayers: (Player & { teamName: string })[] = [];
        activeTeams.forEach(team => {
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
                            href={platform === 'sleeper' ? `/league/${leagueId}` : `/fleaflicker/${leagueId}`}
                            className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
                            {isLive ? 'Live Draft' : 'Mock Draft'}
                        </h1>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={undoLastPick}
                            disabled={currentPickIndex === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Undo2 className="h-4 w-4" />
                            Undo
                        </button>
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

                {/* Draft History */}
                {!draftStarted && draftHistoryList.length > 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <button onClick={() => setShowHistory(!showHistory)} className="flex items-center justify-between w-full">
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Past Drafts ({draftHistoryList.length})</h2>
                            {showHistory ? <ChevronUp className="h-5 w-5 text-zinc-400" /> : <ChevronDown className="h-5 w-5 text-zinc-400" />}
                        </button>
                        {showHistory && (
                            <div className="mt-4 space-y-2">
                                {draftHistoryList.map(entry => (
                                    <div key={entry.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg">
                                        <button onClick={() => setExpandedHistory(expandedHistory === entry.id ? null : entry.id)} className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-lg font-bold ${entry.draft_data.grade.startsWith('A') ? 'text-green-600' : entry.draft_data.grade.startsWith('B') ? 'text-blue-600' : 'text-amber-600'}`}>{entry.draft_data.grade}</span>
                                                <div>
                                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.draft_data.userTeamName}</div>
                                                    <div className="text-xs text-zinc-500">{new Date(entry.created_at).toLocaleDateString()} · {entry.mode}</div>
                                                </div>
                                            </div>
                                            {expandedHistory === entry.id ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                                        </button>
                                        {expandedHistory === entry.id && (
                                            <div className="px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                                                <table className="w-full text-xs mt-2">
                                                    <thead><tr className="text-zinc-500 border-b border-zinc-100 dark:border-zinc-800"><th className="pb-1 text-left">Pick</th><th className="pb-1 text-left">Team</th><th className="pb-1 text-left">Player</th><th className="pb-1 text-left">Pos</th><th className="pb-1 text-right">Value</th></tr></thead>
                                                    <tbody>
                                                        {entry.draft_data.picks.map((p, i) => (
                                                            <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/50">
                                                                <td className="py-1 text-zinc-400">{p.round}.{String(p.pick).padStart(2, '0')}</td>
                                                                <td className="py-1 text-zinc-600 dark:text-zinc-400">{p.teamName}</td>
                                                                <td className="py-1 font-medium text-zinc-900 dark:text-zinc-100">{p.playerName}</td>
                                                                <td className="py-1 text-zinc-500">{p.playerPosition}</td>
                                                                <td className="py-1 text-right text-zinc-500">{p.playerValue.toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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

                {/* Select Keepers Screen */}
                {userTeamId !== null && keeperCount && keeperCount > 0 && !keepersConfirmed && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                    Select Your Keepers
                                </h2>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                    Choose exactly {keeperCount} players to keep. The CPU teams will have their highest value players automatically retained.
                                </p>
                            </div>
                            <div className={`mt-4 sm:mt-0 font-bold text-lg ${selectedKeepers.size === keeperCount ? 'text-green-600 dark:text-green-400' : selectedKeepers.size > keeperCount ? 'text-red-500' : 'text-amber-500'}`}>
                                {selectedKeepers.size} / {keeperCount} Selected
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                            {(() => {
                                const userTeam = activeTeams.find(t => t.id === userTeamId);
                                if (!userTeam) return null;
                                const sortedPlayers = [...userTeam.players].sort((a,b) => (b.fc_value || 0) - (a.fc_value || 0));
                                
                                return sortedPlayers.map(player => {
                                    const isSelected = selectedKeepers.has(player.id);
                                    return (
                                        <button
                                            key={player.id}
                                            onClick={() => {
                                                setSelectedKeepers(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(player.id)) next.delete(player.id);
                                                    else next.add(player.id);
                                                    return next;
                                                });
                                            }}
                                            className={`p-4 text-left border-2 rounded-lg transition-colors ${
                                                isSelected 
                                                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/20' 
                                                    : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                    {player.full_name}
                                                </div>
                                                <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                    {player.fc_value?.toFixed(0) || '0'}
                                                </div>
                                            </div>
                                            <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1 ${player.position === 'QB' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : player.position === 'RB' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : player.position === 'WR' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}`}>{player.position}</span>
                                                {player.team || 'FA'} {player.years_exp != null ? `· Yr ${player.years_exp}` : ''}
                                                {player.zap_nfl_team && <span className="text-amber-600 dark:text-amber-400 ml-1">→ {player.zap_nfl_team}</span>}
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                                                {(sf ? player.fc_rank_sf : player.fc_rank_1qb) && <span>FC #{sf ? player.fc_rank_sf : player.fc_rank_1qb}</span>}
                                                {(sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb) && <span>{player.position}{sf ? player.fc_position_rank_sf : player.fc_position_rank_1qb}</span>}
                                                {player.fc_trend_30_day && <span className={player.fc_trend_30_day > 0 ? 'text-green-600' : 'text-red-600'}>{player.fc_trend_30_day > 0 ? '↑' : '↓'}{Math.abs(player.fc_trend_30_day)}</span>}
                                                {(sf ? player.rank_sf_overall : player.rank_1qb_overall) && <span>VFF #{sf ? player.rank_sf_overall : player.rank_1qb_overall}</span>}
                                                {player.redraft_rank_overall && <span className="text-amber-600 dark:text-amber-400">RD #{player.redraft_rank_overall}</span>}
                                            </div>
                                            {player.zap_category && !player.zap_stale && <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{player.zap_category}{player.zap_score ? ` · ZAP ${player.zap_score.toFixed(1)}` : ''}</div>}
                                            {player.writeups && player.writeups.length > 0 && player.writeups[0].ai_summary && (
                                                <div className="text-[10px] text-zinc-600 dark:text-zinc-400 mt-1 italic">{player.writeups[0].ai_summary}</div>
                                            )}
                                        </button>
                                    );
                                });
                            })()}
                        </div>

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setUserTeamId(null)}
                                className="px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleConfirmKeepers}
                                disabled={selectedKeepers.size !== keeperCount}
                                className="px-8 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Confirm Keepers
                            </button>
                        </div>
                    </div>
                )}

                {/* Start Draft Button */}
                {userTeamId !== null && keepersConfirmed && !draftStarted && !setupComplete && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                            Draft Setup — {teams.find(t => t.id === userTeamId)?.name}
                        </h2>

                        {/* Draft Slot Selector */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Your Draft Slot</h3>
                            <div className="flex flex-wrap gap-2">
                                {teams.map((_, i) => (
                                    <button
                                        key={i + 1}
                                        onClick={() => {
                                            setUserDraftSlot(i + 1);
                                            // Assign user team to this slot in every round, and swap with whoever was there
                                            setPickAssignments(prev => {
                                                const next = { ...prev };
                                                for (let round = 1; round <= ROUNDS; round++) {
                                                    const key = `${round}.${i + 1}`;
                                                    // Find where user team currently is in this round
                                                    const userKey = Object.keys(next).find(k => k.startsWith(`${round}.`) && next[k] === userTeamId);
                                                    const prevOccupant = next[key];
                                                    next[key] = userTeamId!;
                                                    if (userKey && prevOccupant !== undefined) next[userKey] = prevOccupant;
                                                }
                                                return next;
                                            });
                                        }}
                                        className={`w-10 h-10 rounded-lg font-semibold text-sm transition-colors ${
                                            userDraftSlot === i + 1
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Pick Grid */}
                        {userDraftSlot && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                                    Pick Assignments <span className="font-normal text-zinc-500">(click a pick to reassign)</span>
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr>
                                                <th className="px-2 py-1 text-left text-zinc-500">Round</th>
                                                {teams.map((_, i) => (
                                                    <th key={i} className="px-2 py-1 text-center text-zinc-500">{i + 1}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: ROUNDS }, (_, r) => r + 1).map(round => (
                                                <tr key={round}>
                                                    <td className="px-2 py-1 font-semibold text-zinc-700 dark:text-zinc-300">R{round}</td>
                                                    {teams.map((_, i) => {
                                                        const slot = i + 1;
                                                        const key = `${round}.${slot}`;
                                                        const assignedTeamId = pickAssignments[key];
                                                        const assignedTeam = teams.find(t => t.id === assignedTeamId);
                                                        const isUserPick = assignedTeamId === userTeamId;
                                                        const isEditing = editingPick === key;
                                                        return (
                                                            <td key={slot} className="px-1 py-1 text-center relative">
                                                                {isEditing ? (
                                                                    <select
                                                                        autoFocus
                                                                        className="w-full text-xs bg-white dark:bg-zinc-800 border border-indigo-500 rounded px-1 py-0.5"
                                                                        value={assignedTeamId ?? ''}
                                                                        onChange={(e) => {
                                                                            const newTeamId = Number(e.target.value);
                                                                            setPickAssignments(prev => ({ ...prev, [key]: newTeamId }));
                                                                            setEditingPick(null);
                                                                        }}
                                                                        onBlur={() => setEditingPick(null)}
                                                                    >
                                                                        {teams.map(t => (
                                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setEditingPick(key)}
                                                                        className={`w-full px-1 py-0.5 rounded text-xs truncate transition-colors ${
                                                                            isUserPick
                                                                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                                                                                : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                                                                        }`}
                                                                        title={assignedTeam?.name}
                                                                    >
                                                                        {assignedTeam?.name?.substring(0, 8) || '?'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => { setUserTeamId(null); setUserDraftSlot(null); }}
                                className="px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => {
                                    setPickAssignments(buildDefaultAssignments().assignments);
                                    setUserDraftSlot(null);
                                    localStorage.removeItem(storageKey);
                                }}
                                className="px-6 py-3 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40"
                            >
                                Reset
                            </button>
                            {userDraftSlot && (
                                <button
                                    onClick={() => {
                                        setSetupComplete(true);
                                        setPicks(setupDraftOrder);
                                    }}
                                    className="px-8 py-3 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-lg"
                                >
                                    Start Draft
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Ready screen after setup */}
                {userTeamId !== null && keepersConfirmed && setupComplete && !draftStarted && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6 text-center">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
                            Ready to draft as {teams.find(t => t.id === userTeamId)?.name}{isSleeper && userDraftSlot ? ` (Slot ${userDraftSlot})` : ''}?
                        </h2>
                        <div className="flex gap-3 justify-center">
                            {isSleeper && !hasDraftOrder && (
                                <button
                                    onClick={() => setSetupComplete(false)}
                                    className="px-6 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                >
                                    Edit Setup
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    setPreDraftValues(Object.fromEntries(activeTeams.map(t => {
                                        const pv = { total: 0, QB: 0, RB: 0, WR: 0, TE: 0 };
                                        t.players.forEach(p => { const v = p.fc_value || 0; pv.total += v; if (p.position && p.position in pv) pv[p.position as keyof typeof pv] += v; });
                                        return [t.id, pv];
                                    })));
                                    setDraftStarted(true);
                                }}
                                className="px-8 py-4 text-lg font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-lg"
                            >
                                Start Draft
                            </button>
                        </div>
                    </div>
                )}

                {/* Current Pick */}
                {draftStarted && !isDraftComplete && currentPick && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <div className="text-center">
                            {/* Last pick result */}
                            {currentPickIndex > 0 && picks[currentPickIndex - 1]?.playerName && (
                                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                                    {picks[currentPickIndex - 1].teamName} selected <span className="font-semibold text-zinc-900 dark:text-zinc-100">{picks[currentPickIndex - 1].playerName}</span> <span className="text-zinc-400">({picks[currentPickIndex - 1].playerPosition})</span>
                                </div>
                            )}
                            <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                                Round {currentPick.round}, Pick {currentPick.pick}
                            </div>
                            <div className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                                {currentPick.teamName} is on the clock
                            </div>
                            {/* On-deck indicator */}
                            {userTeamId !== null && !isUserPick && (() => {
                                const nextIdx = picks.findIndex((p, i) => i > currentPickIndex && p.teamId === userTeamId && !p.playerId);
                                if (nextIdx === -1) return <div className="text-xs text-zinc-400 mb-3">No more picks remaining</div>;
                                const next = picks[nextIdx];
                                const away = nextIdx - currentPickIndex;
                                return <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Your next pick: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{next.round}.{String(next.pick).padStart(2, '0')}</span> ({away} pick{away !== 1 ? 's' : ''} away)</div>;
                            })()}
                            {isUserPick && (
                                <div className="space-y-3">
                                    <div className="text-base sm:text-lg text-indigo-600 dark:text-indigo-400 font-semibold">
                                        Your pick! Select a player below{isLive ? '.' : ' or evaluate trades.'}
                                    </div>
                                    {(() => {
                                        const needs = calculatePositionalNeed(userTeamId!);
                                        const top3 = availablePlayers
                                            .map(p => {
                                                const value = p.fc_value || 0;
                                                const posNeed = needs[p.position || ''] || 0;
                                                return { player: p, score: scorePlayer(p, userTeamId!), value, posNeed };
                                            })
                                            .sort((a, b) => b.score - a.score)
                                            .slice(0, 3);
                                        return (
                                            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-2">
                                                {top3.map((c, i) => (
                                                    <button
                                                        key={c.player.id}
                                                        onClick={() => setSelectedDraftPlayer(c.player)}
                                                        className={`text-left px-3 py-2 rounded-lg border-2 transition-colors ${
                                                            i === 0
                                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                                                                : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300'
                                                        }`}
                                                    >
                                                        <div className="text-xs text-zinc-400">#{i + 1}</div>
                                                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                                                            {c.player.full_name} <span className="text-zinc-400">{c.player.position}</span>
                                                        </div>
                                                        <div className="text-[10px] text-zinc-500">
                                                            Value: {c.value} | {c.player.position} need: {(c.posNeed * 100).toFixed(0)}% | Score: {c.score.toFixed(0)}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                    <button
                                        onClick={() => setShowTradeModal(true)}
                                        className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium transition-colors"
                                    >
                                        Evaluate Trades
                                    </button>
                                </div>
                            )}
                            {!isUserPick && isLive && (
                                <div className="space-y-3">
                                    <div className="text-sm text-zinc-500">Select the player they drafted from the table below</div>
                                    {/* Suggested picks for this team */}
                                    {(() => {
                                        const needs = calculatePositionalNeed(currentPick.teamId);
                                        const top3 = availablePlayers
                                            .map(p => ({ player: p, score: scorePlayer(p, currentPick.teamId), value: p.fc_value || 0, posNeed: needs[p.position || ''] || 0 }))
                                            .sort((a, b) => b.score - a.score)
                                            .slice(0, 3);
                                        return (
                                            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-2">
                                                {top3.map((c, i) => (
                                                    <div key={c.player.id} onClick={() => makePick(c.player.id)} className={`text-left px-3 py-2 rounded-lg border-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${i === 0 ? 'border-zinc-300 dark:border-zinc-600' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                                        <div className="text-xs text-zinc-400">Projected #{i + 1}</div>
                                                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{c.player.full_name} <span className="text-zinc-400">{c.player.position}</span></div>
                                                        <div className="text-[10px] text-zinc-500">Value: {c.value} | {c.player.position} need: {(c.posNeed * 100).toFixed(0)}% | Score: {c.score.toFixed(0)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                    <div className="flex gap-2 justify-center">
                                        <button
                                            onClick={() => setShowTradeModal(true)}
                                            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors"
                                        >
                                            Execute Trade
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (!userTeamId) return;
                                                const targetTeam = activeTeams.find(t => t.id === currentPick.teamId);
                                                if (!targetTeam) return;
                                                setTradeForPick(true);
                                                setTradeTargetPlayer(null);
                                                setTradeSearch('');
                                                setShowTradeModal(true);
                                            }}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                                        >
                                            Suggest Trade
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isDraftComplete && (() => {
                    const positions = ['QB', 'RB', 'WR', 'TE'] as const;

                    // Determine starter thresholds per team: the value of the worst starter at each position pre-draft
                    const classifyPicks = (teamPlayers: Player[], teamPicks: DraftPick[]) => {
                        // Build a running roster — start with pre-draft players
                        const roster: Record<string, number[]> = { QB: [], RB: [], WR: [], TE: [] };
                        teamPlayers.forEach(p => {
                            if (p.position && p.position in roster) roster[p.position].push(p.fc_value || 0);
                        });
                        // Sort each position descending
                        positions.forEach(pos => roster[pos].sort((a, b) => b - a));

                        const results: boolean[] = [];
                        for (const pick of teamPicks) {
                            const pos = pick.playerPosition || '';
                            const val = pick.playerValue || 0;
                            if (!(pos in roster)) { results.push(false); continue; }
                            const starterCount = Math.ceil(effectiveSlots[pos as keyof typeof effectiveSlots] || 0);
                            const worstStarter = roster[pos][starterCount - 1];
                            const isStarter = worstStarter === undefined || val > worstStarter;
                            results.push(isStarter);
                            // Add to roster and re-sort so next pick uses updated lineup
                            roster[pos].push(val);
                            roster[pos].sort((a, b) => b - a);
                        }
                        return results;
                    };

                    const teamGrades = activeTeams.map(team => {
                        const teamPicks = picks.filter(p => p.teamId === team.id && p.playerName);
                        const drafted: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
                        teamPicks.forEach(p => { if (p.playerPosition && p.playerPosition in drafted) drafted[p.playerPosition] += p.playerValue || 0; });
                        const draftedTotal = teamPicks.reduce((s, p) => s + (p.playerValue || 0), 0);
                        const pre = preDraftValues[team.id] || { total: 0, QB: 0, RB: 0, WR: 0, TE: 0 };
                        const origTeam = teams.find(t => t.id === team.id);
                        const starterFlags = classifyPicks(origTeam?.players || [], teamPicks);
                        const starters = teamPicks.filter((_, i) => starterFlags[i]);
                        return { team, teamPicks, drafted, draftedTotal, pre, starters, starterFlags };
                    });

                    // Grade: starter impact weighted heavily
                    const gradeScores = teamGrades.map(tg => {
                        const starterValue = tg.starters.reduce((s, p) => s + (p.playerValue || 0), 0);
                        const benchValue = tg.draftedTotal - starterValue;
                        // Starters worth 3x bench in grading
                        const score = starterValue * 3 + benchValue;
                        return { ...tg, score, starterValue, benchValue };
                    }).sort((a, b) => b.score - a.score);

                    const maxScore = gradeScores[0]?.score || 1;
                    const getGrade = (s: number) => {
                        const pct = s / maxScore;
                        if (pct >= 0.9) return 'A+'; if (pct >= 0.8) return 'A'; if (pct >= 0.7) return 'A-';
                        if (pct >= 0.6) return 'B+'; if (pct >= 0.5) return 'B'; if (pct >= 0.4) return 'B-';
                        if (pct >= 0.3) return 'C+'; return 'C';
                    };
                    const gradeColor = (g: string) => g.startsWith('A') ? 'text-green-600 dark:text-green-400' : g.startsWith('B') ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400';
                    const posBadge = (pos: string) => pos === 'QB' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : pos === 'RB' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : pos === 'WR' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';

                    return (
                        <div className="space-y-6 mb-6">
                            <div className="bg-green-50 dark:bg-green-950 rounded-xl p-6 text-center">
                                <div className="text-2xl font-bold text-green-900 dark:text-green-100">Draft Complete!</div>
                            </div>

                            {/* Your picks detail */}
                            {userTeamId !== null && (() => {
                                const my = gradeScores.find(t => t.team.id === userTeamId);
                                if (!my) return null;
                                return (
                                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{my.team.name}</h3>
                                            <span className={`text-3xl font-bold ${gradeColor(getGrade(my.score))}`}>{getGrade(my.score)}</span>
                                        </div>
                                        <table className="w-full text-sm mb-4">
                                            <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-700"><th className="pb-2 pr-3">Pick</th><th className="pb-2 pr-3">Player</th><th className="pb-2 pr-3">Pos</th><th className="pb-2 text-right pr-3">Value</th><th className="pb-2 text-right">Impact</th></tr></thead>
                                            <tbody>
                                                {my.teamPicks.map((p, i) => {
                                                    const isStarter = my.starterFlags[i];
                                                    return (
                                                    <tr key={`${p.round}.${p.pick}`} className="border-b border-zinc-100 dark:border-zinc-800">
                                                        <td className="py-2 pr-3 text-zinc-500">{p.round}.{String(p.pick).padStart(2, '0')}</td>
                                                        <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">{p.playerName}</td>
                                                        <td className="py-2 pr-3"><span className={`px-1.5 py-0.5 rounded text-xs font-medium ${posBadge(p.playerPosition || '')}`}>{p.playerPosition}</span></td>
                                                        <td className="py-2 text-right pr-3 text-zinc-600 dark:text-zinc-400">{(p.playerValue || 0).toLocaleString()}</td>
                                                        <td className="py-2 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isStarter ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500'}`}>{isStarter ? 'STARTER' : 'BENCH'}</span></td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {/* Position group changes */}
                                        <div className="grid grid-cols-4 gap-3">
                                            {positions.map(pos => (
                                                <div key={pos} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                                                    <div className="text-xs font-medium text-zinc-500 mb-1">{pos}</div>
                                                    <div className="text-sm text-zinc-500">{my.pre[pos].toLocaleString()}</div>
                                                    <div className="text-xs text-green-600 dark:text-green-400">+{(my.drafted[pos] || 0).toLocaleString()}</div>
                                                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{(my.pre[pos] + (my.drafted[pos] || 0)).toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* League draft grades */}
                            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 overflow-x-auto">
                                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">League Draft Grades</h3>
                                <table className="w-full text-sm">
                                    <thead><tr className="text-left text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                                        <th className="pb-2 w-8">#</th><th className="pb-2">Team</th><th className="pb-2 text-center">Grade</th>
                                        {positions.map(pos => <th key={pos} className="pb-2 text-right">{pos}</th>)}
                                        <th className="pb-2 text-right">Starters</th><th className="pb-2 text-right">Total</th>
                                    </tr></thead>
                                    <tbody>
                                        {gradeScores.map((tg, i) => (
                                            <tr key={tg.team.id} className={`border-b border-zinc-100 dark:border-zinc-800 ${tg.team.id === userTeamId ? 'bg-indigo-50/50 dark:bg-indigo-950/10' : ''}`}>
                                                <td className="py-2 text-zinc-500">{i + 1}</td>
                                                <td className="py-2 font-medium text-zinc-900 dark:text-zinc-100">{tg.team.name}</td>
                                                <td className={`py-2 text-center font-bold ${gradeColor(getGrade(tg.score))}`}>{getGrade(tg.score)}</td>
                                                {positions.map(pos => (
                                                    <td key={pos} className="py-2 text-right">
                                                        <div className="text-zinc-900 dark:text-zinc-100">{(tg.pre[pos] + (tg.drafted[pos] || 0)).toLocaleString()}</div>
                                                        {tg.drafted[pos] > 0 && <div className="text-[10px] text-green-600 dark:text-green-400">+{tg.drafted[pos].toLocaleString()}</div>}
                                                    </td>
                                                ))}
                                                <td className="py-2 text-right"><span className="font-semibold text-green-600 dark:text-green-400">{tg.starters.length}</span><span className="text-zinc-400">/{tg.teamPicks.length}</span></td>
                                                <td className="py-2 text-right font-semibold text-zinc-900 dark:text-zinc-100">{(tg.pre.total + tg.draftedTotal).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()}

                {/* Position Scarcity (always visible during draft) */}
                {draftStarted && !isDraftComplete && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <PositionScarcityChart
                            players={availablePlayers}
                            format={format}
                            onPlayerClick={setSelectedDraftPlayer}
                        />
                        {userTeamId !== null && (
                            <PositionScarcityChart
                                players={myRosterPlayers}
                                format={format}
                                onPlayerClick={setSelectedDraftPlayer}
                                title="My Roster"
                                topN={30}
                                emptyMessage="Draft players to build your roster"
                            />
                        )}
                    </div>
                )}

                {/* Available Players (when user's pick, or always in live mode) */}
                {draftStarted && !isDraftComplete && (isUserPick || isLive) && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 mb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                            <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                Available Players
                            </h2>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                                {/* Search */}
                                <input
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-32 sm:w-40"
                                />
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
                                {/* Watch List Toggle */}
                                <button
                                    onClick={() => setShowWatchListOnly(!showWatchListOnly)}
                                    className={`px-2 sm:px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap flex-shrink-0 ${showWatchListOnly ? 'bg-amber-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                >
                                    ★ {watchList.size}
                                </button>
                                {/* Column Picker */}
                                <ColumnPicker columns={MOCK_DRAFT_COLUMNS} visibleCols={visibleColumns} columnOrder={columnOrder} onToggle={toggleCol} onReorder={reorder} groups={MD_GROUPS} />
                            </div>
                        </div>
                        <div className="overflow-x-auto max-h-96 overflow-y-auto -mx-4 sm:mx-0">
                            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                                <thead className="bg-zinc-50 dark:bg-zinc-950/50 sticky top-0">
                                    <tr>
                                        <th className="px-1 sm:px-2 py-2 sm:py-3 w-8"><Star size={12} className="text-zinc-400 mx-auto" /></th>
                                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-zinc-500 uppercase cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" onClick={() => handleSort('full_name')}>
                                            Player <SortIcon column="full_name" />
                                        </th>
                                        {orderedVisible.map(renderHeader)}
                                        <th className="px-3 sm:px-4 py-2 sm:py-3 text-right text-xs font-medium text-zinc-500 uppercase">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {availablePlayers
                                        .filter(p => {
                                            if (positionFilter !== 'ALL' && p.position !== positionFilter) return false;
                                            if (showWatchListOnly && !watchList.has(p.id)) return false;
                                            if (searchQuery && !p.full_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                                            return true;
                                        })
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
                                        .map(player => (
                                        <React.Fragment key={player.id}>
                                        <tr className={`hover:bg-zinc-50 dark:hover:bg-zinc-800 ${watchList.has(player.id) ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}`}>
                                            <td className="px-1 sm:px-2 py-2 sm:py-3 text-center">
                                                <button onClick={() => toggleWatchList(player.id)} className={`p-1 rounded transition-colors ${watchList.has(player.id) ? 'text-amber-500 hover:text-amber-600' : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'}`}>
                                                    <Star size={14} fill={watchList.has(player.id) ? 'currentColor' : 'none'} />
                                                </button>
                                            </td>
                                            <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                                {(player.zap_analysis || (player.writeups && player.writeups.length > 0)) ? (
                                                    <button className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onClick={() => { setExpandedProspect(expandedProspect === player.id ? null : player.id); setActiveWriteupTab('late_round'); }}>
                                                        {player.full_name} <span className="text-[10px] text-zinc-400">{expandedProspect === player.id ? '▲' : '▼'}</span>
                                                    </button>
                                                ) : player.full_name}
                                                {player.droppedByTeam && (
                                                    <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                                        Dropped by {player.droppedByTeam}
                                                    </span>
                                                )}
                                            </td>
                                            {orderedVisible.map(key => renderCell(key, player))}
                                            <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                                                <button
                                                    onClick={() => setSelectedDraftPlayer(player)}
                                                    className="px-2 sm:px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedProspect === player.id && (player.zap_analysis || (player.writeups && player.writeups.length > 0)) && (() => {
                                            const sources: { key: string; label: string; content: React.ReactNode }[] = [];
                                            if (player.zap_analysis) sources.push({ key: 'late_round', label: 'Late Round', content: (
                                                <>
                                                    {player.zap_ai?.summary && (
                                                        <div className="mb-3 space-y-1.5">
                                                            <div className="flex items-center gap-2">
                                                                {player.zap_ai.confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${player.zap_ai.confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : player.zap_ai.confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{player.zap_ai.confidence}/10</span>}
                                                                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{player.zap_ai.summary}</span>
                                                            </div>
                                                            {player.zap_ai.comps && <div className="text-[11px] text-zinc-500">🔄 Comps: {player.zap_ai.comps}</div>}
                                                            <div className="flex gap-3 text-[11px]">
                                                                {player.zap_ai.bull_case && <div className="text-green-700 dark:text-green-400">📈 {player.zap_ai.bull_case}</div>}
                                                                {player.zap_ai.bear_case && <div className="text-red-700 dark:text-red-400">📉 {player.zap_ai.bear_case}</div>}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className="text-xs font-medium text-zinc-500">{player.zap_category}{player.zap_score ? ` · ZAP: ${player.zap_score.toFixed(1)}` : ''}</span>
                                                        {player.zap_comps && <span className="text-xs text-zinc-400">Comps: {player.zap_comps}</span>}
                                                    </div>
                                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed">{player.zap_analysis}</p>
                                                </>
                                            )});
                                            player.writeups?.forEach(w => sources.push({ key: w.source, label: w.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), content: (
                                                <div>
                                                    {w.ai_summary && (
                                                        <div className="mb-3 space-y-1.5">
                                                            <div className="flex items-center gap-2">
                                                                {w.ai_confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.ai_confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : w.ai_confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{w.ai_confidence}/10</span>}
                                                                <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{w.ai_summary}</span>
                                                            </div>
                                                            {w.ai_comps && <div className="text-[11px] text-zinc-500">🔄 Comps: {w.ai_comps}</div>}
                                                            <div className="flex gap-3 text-[11px]">
                                                                {w.ai_bull_case && <div className="text-green-700 dark:text-green-400">📈 {w.ai_bull_case}</div>}
                                                                {w.ai_bear_case && <div className="text-red-700 dark:text-red-400">📉 {w.ai_bear_case}</div>}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed">{w.analysis_text}</p>
                                                </div>
                                            )}));
                                            const active = sources.find(s => s.key === activeWriteupTab) || sources[0];
                                            return (
                                                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                                                    <td colSpan={orderedVisible.length + 3} className="px-4 py-3">
                                                        <div className="max-w-3xl">
                                                            {sources.length > 1 && (
                                                                <div className="flex gap-1 mb-3">
                                                                    {sources.map(s => (
                                                                        <button key={s.key} onClick={() => setActiveWriteupTab(s.key)} className={`px-2 py-1 text-[11px] font-medium rounded ${(active.key === s.key) ? 'bg-indigo-600 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>{s.label}</button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {active.content}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        </React.Fragment>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pick History Log */}
                {draftStarted && currentPickIndex > 0 && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 mb-4 sm:mb-6">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Recent Picks</h3>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {picks.slice(0, currentPickIndex).reverse().slice(0, 12).reverse().map((p, i) => (
                                <div key={i} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs ${p.teamId === userTeamId ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' : 'bg-zinc-50 dark:bg-zinc-800'}`}>
                                    <div className="text-zinc-400">{p.round}.{String(p.pick).padStart(2, '0')}</div>
                                    <div className="font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{p.playerName}</div>
                                    <div className="text-zinc-500">{p.teamName} · <span className={`font-medium ${p.playerPosition === 'QB' ? 'text-red-600' : p.playerPosition === 'RB' ? 'text-blue-600' : p.playerPosition === 'WR' ? 'text-green-600' : 'text-orange-600'}`}>{p.playerPosition}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Draft Board + Roster Sidebar */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    {/* Draft Board */}
                    <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl shadow-lg overflow-hidden order-2 lg:order-1">
                        <div className="overflow-x-auto">
                            {(() => {
                                const numTeams = teams.length;
                                // Get unique team IDs from round 1 pick order (slot-based)
                                const round1 = picks.filter(p => p.round === 1).sort((a, b) => a.pick - b.pick);
                                const posBg = (pos?: string) => pos === 'QB' ? 'bg-red-100 dark:bg-red-900/30' : pos === 'RB' ? 'bg-blue-100 dark:bg-blue-900/30' : pos === 'WR' ? 'bg-green-100 dark:bg-green-900/30' : pos === 'TE' ? 'bg-orange-100 dark:bg-orange-900/30' : '';
                                const teamNames = new Map(teams.map(t => [t.id, t.name]));

                                return (
                                    <table className="w-full text-[10px] sm:text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-50 dark:bg-zinc-950/50">
                                                <th className="px-1 py-2 text-zinc-500 font-medium sticky left-0 bg-zinc-50 dark:bg-zinc-950/50 z-10 w-8"></th>
                                                {round1.map((p, i) => (
                                                    <th key={i} className={`px-1 py-2 text-center font-medium truncate max-w-[80px] ${p.teamId === userTeamId ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500'}`}>
                                                        {(p.teamName || '').split(' ').pop()?.slice(0, 8)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: ROUNDS }, (_, r) => r + 1).map(round => {
                                                const roundPicks = picks.filter(p => p.round === round).sort((a, b) => a.pick - b.pick);
                                                return (
                                                    <tr key={round} className="border-t border-zinc-100 dark:border-zinc-800">
                                                        <td className="px-1 py-1 text-zinc-400 font-medium text-center sticky left-0 bg-white dark:bg-zinc-900 z-10">R{round}</td>
                                                        {roundPicks.map((pick, slotIdx) => {
                                                            const pickIdx = picks.indexOf(pick);
                                                            const isCurrent = pickIdx === currentPickIndex;
                                                            const isUser = pick.teamId === userTeamId;
                                                            const ownerChanged = round1[slotIdx] && pick.teamId !== round1[slotIdx].teamId;
                                                            return (
                                                                <td key={`${round}-${slotIdx}`} className="px-0.5 py-0.5">
                                                                    <div className={`rounded px-1 py-1 text-center min-h-[36px] flex flex-col justify-center ${
                                                                        isCurrent ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' :
                                                                        pick.playerId ? posBg(pick.playerPosition) :
                                                                        isUser ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                                                                    }`}>
                                                                        {pick.playerName ? (
                                                                            <>
                                                                                <div className={`font-medium truncate ${isUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-zinc-900 dark:text-zinc-100'}`}>{pick.playerName.split(' ').pop()}</div>
                                                                                <div className="text-zinc-400">{pick.playerPosition}</div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                {ownerChanged && <div className="text-[9px] text-amber-600 dark:text-amber-400 truncate">{(teamNames.get(pick.teamId) || '').split(' ').pop()?.slice(0, 6)}</div>}
                                                                                <div className="text-zinc-300 dark:text-zinc-700">{round}.{String(pick.pick).padStart(2, '0')}</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                );
                            })()}
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
                                    const userTeam = activeTeams.find(t => t.id === userTeamId);
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

                {/* Player Detail Modal */}
                {selectedDraftPlayer && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedDraftPlayer(null)}>
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 z-10">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{selectedDraftPlayer.full_name}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${selectedDraftPlayer.position === 'QB' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' : selectedDraftPlayer.position === 'RB' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : selectedDraftPlayer.position === 'WR' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'}`}>{selectedDraftPlayer.position}</span>
                                            <span className="text-sm text-zinc-500">{selectedDraftPlayer.team || 'FA'}</span>
                                            {selectedDraftPlayer.zap_nfl_team && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">→ {selectedDraftPlayer.zap_nfl_team}</span>}
                                            <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{selectedDraftPlayer.fc_value?.toLocaleString() || '0'}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => setSelectedDraftPlayer(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                {/* Quick stats row */}
                                <div className="flex flex-wrap gap-3 mt-3 text-xs text-zinc-500">
                                    {(sf ? selectedDraftPlayer.fc_rank_sf : selectedDraftPlayer.fc_rank_1qb) && <span>FC #{sf ? selectedDraftPlayer.fc_rank_sf : selectedDraftPlayer.fc_rank_1qb}</span>}
                                    {(sf ? selectedDraftPlayer.fc_position_rank_sf : selectedDraftPlayer.fc_position_rank_1qb) && <span>{selectedDraftPlayer.position}{sf ? selectedDraftPlayer.fc_position_rank_sf : selectedDraftPlayer.fc_position_rank_1qb}</span>}
                                    {selectedDraftPlayer.fc_trend_30_day && <span className={selectedDraftPlayer.fc_trend_30_day > 0 ? 'text-green-600' : 'text-red-600'}>30d: {selectedDraftPlayer.fc_trend_30_day > 0 ? '+' : ''}{selectedDraftPlayer.fc_trend_30_day}</span>}
                                    {(sf ? selectedDraftPlayer.rank_sf_overall : selectedDraftPlayer.rank_1qb_overall) && <span>VFF #{sf ? selectedDraftPlayer.rank_sf_overall : selectedDraftPlayer.rank_1qb_overall}</span>}
                                    {selectedDraftPlayer.years_exp != null && <span>Yr {selectedDraftPlayer.years_exp}</span>}
                                </div>
                            </div>
                            <div className="p-4 sm:p-6 space-y-4">
                                {/* ZAP / Late Round */}
                                {selectedDraftPlayer.zap_analysis && (
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Late Round</div>
                                        {selectedDraftPlayer.zap_ai?.summary && (
                                            <div className="mb-3 space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    {selectedDraftPlayer.zap_ai.confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${selectedDraftPlayer.zap_ai.confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : selectedDraftPlayer.zap_ai.confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{selectedDraftPlayer.zap_ai.confidence}/10</span>}
                                                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{selectedDraftPlayer.zap_ai.summary}</span>
                                                </div>
                                                {selectedDraftPlayer.zap_ai.comps && <div className="text-[11px] text-zinc-500">🔄 {selectedDraftPlayer.zap_ai.comps}</div>}
                                                <div className="flex gap-3 text-[11px]">
                                                    {selectedDraftPlayer.zap_ai.bull_case && <div className="text-green-700 dark:text-green-400">📈 {selectedDraftPlayer.zap_ai.bull_case}</div>}
                                                    {selectedDraftPlayer.zap_ai.bear_case && <div className="text-red-700 dark:text-red-400">📉 {selectedDraftPlayer.zap_ai.bear_case}</div>}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-medium text-zinc-500">{selectedDraftPlayer.zap_category}{selectedDraftPlayer.zap_score ? ` · ZAP: ${selectedDraftPlayer.zap_score.toFixed(1)}` : ''}</span>
                                            {selectedDraftPlayer.zap_comps && <span className="text-xs text-zinc-400">Comps: {selectedDraftPlayer.zap_comps}</span>}
                                        </div>
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{selectedDraftPlayer.zap_analysis}</p>
                                    </div>
                                )}
                                {/* Writeups */}
                                {selectedDraftPlayer.writeups?.map(w => (
                                    <div key={w.source} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">{w.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                                        {w.ai_summary && (
                                            <div className="mb-3 space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    {w.ai_confidence && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${w.ai_confidence >= 8 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : w.ai_confidence >= 5 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>{w.ai_confidence}/10</span>}
                                                    <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{w.ai_summary}</span>
                                                </div>
                                                {w.ai_comps && <div className="text-[11px] text-zinc-500">🔄 {w.ai_comps}</div>}
                                                <div className="flex gap-3 text-[11px]">
                                                    {w.ai_bull_case && <div className="text-green-700 dark:text-green-400">📈 {w.ai_bull_case}</div>}
                                                    {w.ai_bear_case && <div className="text-red-700 dark:text-red-400">📉 {w.ai_bear_case}</div>}
                                                </div>
                                            </div>
                                        )}
                                        <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">{w.analysis_text}</p>
                                    </div>
                                ))}
                                {/* Draft action */}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button onClick={() => setSelectedDraftPlayer(null)} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">Cancel</button>
                                    <button onClick={() => { makePick(selectedDraftPlayer.id); setSelectedDraftPlayer(null); }} className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                                        {isLive && !isUserPick ? 'Select Pick' : 'Draft Player'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Trade Modal */}
                {showTradeModal && userTeamId !== null && currentPick && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowTradeModal(false); setTradeTargetPlayer(null); setTradeSearch(''); setSelectedTradeAssets(new Set()); setTheirTradeAssets(new Set()); setTradePosFilter('ALL'); setTradeForPick(false); }}>
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 z-10">
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">Trade Evaluator</h2>
                                {/* Search for target player */}
                                <input
                                    type="text"
                                    placeholder="Search for a player to trade for..."
                                    value={tradeSearch}
                                    onChange={e => { setTradeSearch(e.target.value); setTradeTargetPlayer(null); setTheirTradeAssets(new Set()); }}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                    autoFocus
                                />
                                {/* Search results dropdown */}
                                {tradeSearch.length >= 2 && !tradeTargetPlayer && (() => {
                                    const results: (Player & { teamName: string; teamId: number })[] = [];
                                    activeTeams.forEach(team => {
                                        if (team.id === userTeamId) return;
                                        team.players.forEach(p => {
                                            if (p.full_name.toLowerCase().includes(tradeSearch.toLowerCase())) {
                                                results.push({ ...p, teamName: team.name, teamId: team.id });
                                            }
                                        });
                                    });
                                    return results.length > 0 && (
                                        <div className="mt-2 border border-zinc-200 dark:border-zinc-700 rounded-lg max-h-48 overflow-y-auto">
                                            {results.sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).slice(0, 15).map(p => (
                                                <button key={p.id} onClick={() => { setTradeTargetPlayer(p); setTradeSearch(p.full_name); }} className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 flex justify-between">
                                                    <span><span className="font-medium text-zinc-900 dark:text-zinc-100">{p.full_name}</span> <span className="text-zinc-500">{p.position} · {p.teamName}</span></span>
                                                    <span className="text-zinc-500">{(p.fc_value || 0).toLocaleString()}</span>
                                                </button>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>

                            {(tradeTargetPlayer || tradeForPick) ? (() => {
                                const userTeam = activeTeams.find(t => t.id === userTeamId)!;
                                const theirTeamId = tradeForPick ? currentPick.teamId : tradeTargetPlayer!.teamId;
                                const theirTeam = activeTeams.find(t => t.id === theirTeamId)!;
                                const includeCurrentPick = !tradeForPick; // only include current pick on "You Send" if it's YOUR pick
                                const myValue = calculateSideValue(selectedTradeAssets, userTeam.players, includeCurrentPick);
                                const pickValue = tradeForPick ? estimatePickValue(currentPick.round, currentPick.pick) : 0;
                                const targetPlayerValue = tradeTargetPlayer ? (tradeTargetPlayer.fc_value || 0) : 0;
                                const theirValue = targetPlayerValue + pickValue + calculateSideValue(theirTradeAssets, theirTeam.players, false);
                                const diff = myValue - theirValue;
                                const diffPct = theirValue > 0 ? Math.abs(diff / theirValue) * 100 : 0;
                                const withinRange = isLive || diffPct <= 10;

                                return (
                                    <div className="p-4 sm:p-6 space-y-4">
                                        {/* Value comparison bar */}
                                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                                            <div className="flex justify-between items-center text-sm mb-2">
                                                <span className="text-zinc-600 dark:text-zinc-400">You send: <span className="font-bold text-zinc-900 dark:text-zinc-100">{myValue.toLocaleString()}</span></span>
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${withinRange ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                                                    {diff > 0 ? '+' : ''}{diff.toLocaleString()} ({diffPct.toFixed(1)}%) {withinRange ? '✓ Fair' : '✗ Out of range'}
                                                </span>
                                                <span className="text-zinc-600 dark:text-zinc-400">You get: <span className="font-bold text-zinc-900 dark:text-zinc-100">{theirValue.toLocaleString()}</span></span>
                                            </div>
                                        </div>

                                        {/* Position filter */}
                                        <div className="flex gap-1 mb-3">
                                            {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                                                <button key={pos} onClick={() => setTradePosFilter(pos)} className={`px-2 py-1 text-xs font-medium rounded transition-colors ${tradePosFilter === pos ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>{pos}</button>
                                            ))}
                                        </div>

                                        {/* Side by side */}
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* YOUR SIDE */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">You Send</h3>
                                                {/* Current pick (only when it's your pick) */}
                                                {!tradeForPick && (
                                                    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-2 mb-2 text-sm flex justify-between">
                                                        <span className="font-medium">{currentPick.round}.{String(currentPick.pick).padStart(2, '0')}</span>
                                                        <span className="text-zinc-500">~{estimatePickValue(currentPick.round, currentPick.pick).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {/* Your players */}
                                                <div className="text-xs font-medium text-zinc-500 uppercase mb-1">Your Players</div>
                                                <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                                                    {userTeam.players.filter(p => tradePosFilter === 'ALL' || p.position === tradePosFilter).sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).map(p => {
                                                        const aid = `player_${p.id}`;
                                                        const sel = selectedTradeAssets.has(aid);
                                                        return (
                                                            <button key={p.id} onClick={() => toggleTradeAsset(aid)} className={`w-full text-left px-2 py-1.5 rounded text-xs flex justify-between transition-colors ${sel ? 'bg-indigo-100 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent'}`}>
                                                                <span className="truncate">{p.full_name} <span className="text-zinc-400">{p.position}</span></span>
                                                                <span className="ml-1 text-zinc-500 flex-shrink-0">{(p.fc_value || 0).toLocaleString()}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {/* Your picks (current draft + future) */}
                                                {(() => {
                                                    // Current draft picks owned by user (excluding already-made and the current pick if it's yours)
                                                    const myCurrentPicks = picks
                                                        .filter((p, idx) => p.teamId === userTeamId && idx > currentPickIndex && !p.playerId)
                                                        .map(p => ({ aid: `draftpick_${p.round}_${p.pick}`, label: `${p.round}.${String(p.pick).padStart(2, '0')}`, value: estimatePickValue(p.round, p.pick) }));
                                                    const fp = userTeam.draftPicks.filter(p => p.season > new Date().getFullYear())
                                                        .map(p => ({ aid: `pick_${p.season}_${p.round}`, label: `${p.season} R${p.round}`, value: estimateFuturePickValue(p.round) }));
                                                    const allPicks = [...myCurrentPicks, ...fp];
                                                    return allPicks.length > 0 && (
                                                        <>
                                                            <div className="text-xs font-medium text-zinc-500 uppercase mb-1">Your Picks</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {allPicks.map(p => {
                                                                    const sel = selectedTradeAssets.has(p.aid);
                                                                    return <button key={p.aid} onClick={() => toggleTradeAsset(p.aid)} className={`px-2 py-1 rounded text-xs transition-colors ${sel ? 'bg-indigo-100 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-transparent'}`}>{p.label} <span className="text-zinc-400">~{p.value.toLocaleString()}</span></button>;
                                                                })}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>

                                            {/* THEIR SIDE */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">You Get from {theirTeam.name}</h3>
                                                {/* Current pick (when trading FOR the pick) */}
                                                {tradeForPick && (
                                                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2 mb-2 text-sm flex justify-between">
                                                        <span className="font-medium">Pick {currentPick.round}.{String(currentPick.pick).padStart(2, '0')}</span>
                                                        <span className="text-zinc-500">~{estimatePickValue(currentPick.round, currentPick.pick).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {/* Target player (when trading for a specific player) */}
                                                {tradeTargetPlayer && (
                                                    <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2 mb-2 text-sm flex justify-between">
                                                        <span className="font-medium">{tradeTargetPlayer.full_name} <span className="text-zinc-500">{tradeTargetPlayer.position}</span></span>
                                                        <span className="text-zinc-500">{(tradeTargetPlayer.fc_value || 0).toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {/* Their other players */}
                                                <div className="text-xs font-medium text-zinc-500 uppercase mb-1">Their Players</div>
                                                <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
                                                    {theirTeam.players.filter(p => !tradeTargetPlayer || p.id !== tradeTargetPlayer.id).filter(p => tradePosFilter === 'ALL' || p.position === tradePosFilter).sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).map(p => {
                                                        const aid = `player_${p.id}`;
                                                        const sel = theirTradeAssets.has(aid);
                                                        return (
                                                            <button key={p.id} onClick={() => setTheirTradeAssets(prev => { const n = new Set(prev); if (n.has(aid)) n.delete(aid); else n.add(aid); return n; })} className={`w-full text-left px-2 py-1.5 rounded text-xs flex justify-between transition-colors ${sel ? 'bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-700' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-transparent'}`}>
                                                                <span className="truncate">{p.full_name} <span className="text-zinc-400">{p.position}</span></span>
                                                                <span className="ml-1 text-zinc-500 flex-shrink-0">{(p.fc_value || 0).toLocaleString()}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                {/* Their draft picks */}
                                                {(() => {
                                                    // Current draft picks owned by this team (excluding already-made picks)
                                                    const theirCurrentPicks = picks
                                                        .filter((p, idx) => p.teamId === theirTeamId && idx > currentPickIndex && !p.playerId)
                                                        .map(p => ({ round: p.round, slot: p.pick, aid: `draftpick_${p.round}_${p.pick}`, label: `${p.round}.${String(p.pick).padStart(2, '0')}`, value: estimatePickValue(p.round, p.pick) }));
                                                    // Future picks
                                                    const theirFuturePicks = theirTeam.draftPicks
                                                        .filter(p => p.season > new Date().getFullYear())
                                                        .map(p => ({ round: p.round, slot: 0, aid: `pick_${p.season}_${p.round}`, label: `${p.season} R${p.round}`, value: estimateFuturePickValue(p.round) }));
                                                    const allPicks = [...theirCurrentPicks, ...theirFuturePicks];
                                                    return allPicks.length > 0 && (
                                                        <>
                                                            <div className="text-xs font-medium text-zinc-500 uppercase mb-1">Their Picks</div>
                                                            <div className="flex flex-wrap gap-1">
                                                                {allPicks.map(p => {
                                                                    const sel = theirTradeAssets.has(p.aid);
                                                                    return <button key={p.aid} onClick={() => setTheirTradeAssets(prev => { const n = new Set(prev); if (n.has(p.aid)) n.delete(p.aid); else n.add(p.aid); return n; })} className={`px-2 py-1 rounded text-xs transition-colors ${sel ? 'bg-green-100 dark:bg-green-950/40 border border-green-300 dark:border-green-700' : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-transparent'}`}>{p.label} <span className="text-zinc-400">~{p.value.toLocaleString()}</span></button>;
                                                                })}
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex justify-between items-center pt-2">
                                            <button onClick={() => { setTradeTargetPlayer(null); setTradeForPick(false); setTradeSearch(''); setSelectedTradeAssets(new Set()); setTheirTradeAssets(new Set()); }} className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                                                ← Back
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (tradeForPick) {
                                                        // Trading for the pick: reassign pick to user, swap assets
                                                        if (!userTeamId || !currentPick) return;
                                                        const theirTeamId = currentPick.teamId;
                                                        const userOutgoing: string[] = [];
                                                        selectedTradeAssets.forEach(a => { if (a.startsWith('player_')) userOutgoing.push(a.replace('player_', '')); });
                                                        const theirOutgoing: string[] = [];
                                                        theirTradeAssets.forEach(a => { if (a.startsWith('player_')) theirOutgoing.push(a.replace('player_', '')); });
                                                        setActiveTeams(prev => prev.map(team => {
                                                            if (team.id === userTeamId) {
                                                                const after = team.players.filter(p => !userOutgoing.includes(p.id));
                                                                const them = prev.find(t => t.id === theirTeamId);
                                                                theirOutgoing.forEach(pid => { const pl = them?.players.find(p => p.id === pid); if (pl) after.push(pl); });
                                                                return { ...team, players: after };
                                                            }
                                                            if (team.id === theirTeamId) {
                                                                const after = team.players.filter(p => !theirOutgoing.includes(p.id));
                                                                const us = prev.find(t => t.id === userTeamId);
                                                                userOutgoing.forEach(pid => { const pl = us?.players.find(p => p.id === pid); if (pl) after.push(pl); });
                                                                return { ...team, players: after };
                                                            }
                                                            return team;
                                                        }));
                                                        // Reassign pick to user
                                                        setPicks(prev => prev.map((p, idx) => idx === currentPickIndex ? { ...p, teamId: userTeamId, teamName: activeTeams.find(t => t.id === userTeamId)?.name || '' } : p));
                                                        setShowTradeModal(false); setSelectedTradeAssets(new Set()); setTheirTradeAssets(new Set()); setTradeForPick(false); setTradeSearch('');
                                                    } else if (tradeTargetPlayer) {
                                                        executeTrade(tradeTargetPlayer);
                                                    }
                                                }}
                                                disabled={!withinRange}
                                                className={`px-6 py-2 text-sm font-semibold rounded-lg transition-colors ${withinRange ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'}`}
                                            >
                                                {withinRange ? 'Execute Trade' : 'Trade not within 10%'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })() : !tradeSearch && (
                                /* Show browse-by-value targets when no search */
                                <div className="p-4 sm:p-6 space-y-4">
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
                                        <div className="flex justify-between items-center">
                                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">Current Pick Value</span>
                                            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">~{estimatePickValue(currentPick.round, currentPick.pick).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        {['ALL', 'QB', 'RB', 'WR', 'TE'].map(pos => (
                                            <button key={pos} onClick={() => setTradePosFilter(pos)} className={`px-2 py-1 text-xs font-medium rounded transition-colors ${tradePosFilter === pos ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>{pos}</button>
                                        ))}
                                    </div>
                                    <p className="text-sm text-zinc-500 text-center">Search for a player above, or browse value-matched targets below</p>
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                        {tradeTargets.filter(p => tradePosFilter === 'ALL' || p.position === tradePosFilter).map(player => {
                                            const tradeVal = calculateTradeValue();
                                            const valueDiff = (player.fc_value || 0) - tradeVal;
                                            const diffPercent = tradeVal > 0 ? ((valueDiff / tradeVal) * 100).toFixed(1) : '0';
                                            return (
                                                <div key={player.id} onClick={() => { setTradeTargetPlayer({ ...player, teamId: activeTeams.find(t => t.name === player.teamName)!.id }); setTradeSearch(player.full_name); }} className="flex items-center justify-between p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                                                    <div>
                                                        <div className="font-medium text-zinc-900 dark:text-zinc-100">{player.full_name}</div>
                                                        <div className="text-xs text-zinc-500">{player.position} · {player.team || 'FA'} · {player.teamName}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{(player.fc_value || 0).toLocaleString()}</div>
                                                        <div className={`text-xs font-medium ${valueDiff > 0 ? 'text-green-600' : valueDiff < 0 ? 'text-red-600' : 'text-zinc-500'}`}>{valueDiff > 0 ? '+' : ''}{diffPercent}%</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
