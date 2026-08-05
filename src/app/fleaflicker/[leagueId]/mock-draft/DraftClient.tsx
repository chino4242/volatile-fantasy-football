'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, Download, Undo2, ChevronDown, ChevronUp } from 'lucide-react';
import { PositionScarcityChart } from '@/components/PositionScarcityChart';
import { PlayerDetailModal } from './PlayerDetailModal';
import DraftBoardGrid, { PickHistoryLog } from './DraftBoardGrid';
import AvailablePlayersTable from './AvailablePlayersTable';
import { useAuth } from '@/hooks/useUser';
import { analyzeLeaguePostDraft } from '@/lib/post-draft-analysis';
import type { PlayerForAnalysis } from '@/lib/post-draft-analysis';
import { DRAFT_STYLES, getEffectiveValue, estimateFuturePickValue } from '@/lib/draft-simulation';

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
    target_fade?: string | null;
    redraft_rank_overall?: number | null;
    redraft_rank_pos?: number | null;
    redraft_rank_tier?: number | null;
    redraft_auction_value?: number | null;
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
    isKeeper?: boolean;
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
    defaultUserTeamId?: number;
    customRankingsMap?: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]>;
    keeperPicks?: { round: number; pick_no: number; overall: number; roster_id: number; draft_slot: number; player_id: string; player_name: string; player_position: string | null; player_value: number | null; player_data?: any }[];
}

const DEFAULT_ROUNDS = 5;

export default function DraftClient({ leagueId, teams, freeAgents, format, rankingsVintage, redraftVintage, platform = 'fleaflicker', rosterSlots, keeperCount, mode = 'mock', defaultUserTeamId, customRankingsMap, keeperPicks }: DraftClientProps) {
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const userId = sleeperUsername || fleaflickerUsername || null;

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

    // Load saved draft plan (keepers + pick targets)
    interface DraftPlanData {
        keeper_ids: string[];
        picks: { pickNumber: number; round: number; slot: number; targetPosition: string | null; targetPlayer: string | null; notes: string }[];
        name?: string;
    }
    const [draftPlan, setDraftPlan] = useState<DraftPlanData | null>(null);
    const [availablePlans, setAvailablePlans] = useState<{ id: string; name: string }[]>([]);

    useEffect(() => {
        if (!userId) return;
        fetch(`/api/draft-plans?league_id=${leagueId}&user_id=${userId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.plans && Array.isArray(data.plans)) {
                    setAvailablePlans(data.plans.map((p: any) => ({ id: p.id, name: p.name })));
                    // Auto-load the most recent plan
                    if (data.plans.length > 0) {
                        const plan = data.plans[0];
                        setDraftPlan({
                            keeper_ids: JSON.parse(plan.keeper_ids || '[]'),
                            picks: JSON.parse(plan.picks || '[]'),
                            name: plan.name,
                        });
                    }
                }
            })
            .catch(() => {});
    }, [leagueId, userId]);

    // Allow switching plans
    const loadPlanById = async (planId: string) => {
        try {
            const res = await fetch(`/api/draft-plans?league_id=${leagueId}&user_id=${userId}`);
            if (!res.ok) return;
            const { plans } = await res.json();
            const plan = plans?.find((p: any) => p.id === planId);
            if (plan) {
                setDraftPlan({
                    keeper_ids: JSON.parse(plan.keeper_ids || '[]'),
                    picks: JSON.parse(plan.picks || '[]'),
                    name: plan.name,
                });
            }
        } catch {}
    };

    // Generate draft order from current year picks
    // Derive rounds from team draft picks, fallback to default
    // Cap at total roster spots to avoid drafting more players than can fit
    const ROUNDS = useMemo(() => {
        const maxRound = Math.max(...teams.flatMap(t => t.draftPicks.map(p => p.round)), 0);
        const picksRounds = maxRound > 0 ? maxRound : DEFAULT_ROUNDS;
        if (rosterSlots) {
            const totalRosterSpots = rosterSlots.QB + rosterSlots.RB + rosterSlots.WR + rosterSlots.TE + rosterSlots.FLEX;
            return Math.min(picksRounds, totalRosterSpots);
        }
        return picksRounds;
    }, [teams, rosterSlots]);

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

    // Apply keeper picks (pre-draft picks from Sleeper) to the draft board
    const keeperPicksApplied = useRef(false);
    useEffect(() => {
        if (keeperPicksApplied.current || !keeperPicks || keeperPicks.length === 0) return;
        keeperPicksApplied.current = true;

        // Store keeper player data in draftedPlayerMap so roster display works
        for (const kp of keeperPicks) {
            if ((kp as any).player_data) {
                draftedPlayerMap.current.set(kp.player_id, (kp as any).player_data as Player);
            } else {
                draftedPlayerMap.current.set(kp.player_id, {
                    id: kp.player_id,
                    full_name: kp.player_name,
                    position: kp.player_position,
                    fc_value: kp.player_value,
                } as Player);
            }
        }

        setPicks(prev => {
            const updated = [...prev];
            for (const kp of keeperPicks) {
                // Find the matching slot in the draft order by pick_no (overall pick number)
                const idx = updated.findIndex(p => {
                    const overall = (p.round - 1) * teams.length + p.pick;
                    return overall === kp.pick_no;
                });
                if (idx >= 0) {
                    updated[idx] = {
                        ...updated[idx],
                        playerId: kp.player_id,
                        playerName: kp.player_name,
                        playerPosition: kp.player_position || undefined,
                        playerValue: kp.player_value || undefined,
                        pickReason: 'Keeper',
                        isKeeper: true,
                    };
                }
            }
            return updated;
        });

        // Remove keeper players from available pool
        const keeperPlayerIds = new Set(keeperPicks.map(kp => kp.player_id));
        setAvailablePlayers(prev => prev.filter(p => !keeperPlayerIds.has(p.id)));

        // Advance currentPickIndex past any initial keeper picks
        setPicks(prev => {
            let startIdx = 0;
            while (startIdx < prev.length && prev[startIdx].isKeeper) startIdx++;
            if (startIdx > 0) setCurrentPickIndex(startIdx);
            return prev;
        });
    }, [keeperPicks, teams.length]);

    // Live draft persistence key
    const liveDraftKey = `live_draft_${leagueId}`;
    const mockDraftKey = `mock_draft_${leagueId}`;
    const [activeTeams, setActiveTeams] = useState<Team[]>(teams);
    const [userTeamId, setUserTeamId] = useState<number | null>(defaultUserTeamId ?? null);
    const [draftStarted, setDraftStarted] = useState(false);

    // Live draft persistence — restore on mount
    useEffect(() => {
        if (mode !== 'live') return;
        try {
            const saved = localStorage.getItem(liveDraftKey);
            if (saved) {
                const { picks: savedPicks, currentPickIndex: savedIdx, draftedPlayerIds } = JSON.parse(saved);
                if (savedPicks?.length === draftOrder.length) {
                    setPicks(savedPicks);
                    setCurrentPickIndex(savedIdx || 0);
                    setDraftStarted(true);
                    const draftedIds = new Set(draftedPlayerIds || []);
                    setAvailablePlayers(freeAgents.filter(p => !draftedIds.has(p.id)));
                }
            }
        } catch {}
    }, []);

    // Mock draft persistence — restore on mount
    useEffect(() => {
        if (mode !== 'mock') return;
        try {
            const saved = localStorage.getItem(mockDraftKey);
            if (saved) {
                const { picks: savedPicks, currentPickIndex: savedIdx, draftedPlayerIds, userTeamId: savedTeam, activeTeams: savedTeams } = JSON.parse(saved);
                // Only restore if draft is in progress (not complete)
                const isComplete = savedIdx >= (savedPicks?.length || 0);
                if (savedPicks?.length > 0 && savedIdx > 0 && !isComplete) {
                    setPicks(savedPicks);
                    setCurrentPickIndex(savedIdx || 0);
                    setDraftStarted(true);
                    if (savedTeam) setUserTeamId(savedTeam);
                    if (savedTeams) setActiveTeams(savedTeams);
                    const draftedIds = new Set(draftedPlayerIds || []);
                    setAvailablePlayers(freeAgents.filter(p => !draftedIds.has(p.id)));
                } else if (isComplete) {
                    // Clear completed draft state
                    localStorage.removeItem(mockDraftKey);
                }
            }
        } catch {}
    }, []);

    // Live draft persistence — save on every pick
    useEffect(() => {
        if (mode !== 'live' || !draftStarted) return;
        const draftedPlayerIds = picks.filter(p => p.playerId).map(p => p.playerId);
        localStorage.setItem(liveDraftKey, JSON.stringify({ picks, currentPickIndex, draftedPlayerIds }));
    }, [picks, currentPickIndex, draftStarted, mode, liveDraftKey]);

    // Mock draft persistence — save on every pick
    useEffect(() => {
        if (mode !== 'mock' || !draftStarted) return;
        const draftedPlayerIds = picks.filter(p => p.playerId).map(p => p.playerId);
        localStorage.setItem(mockDraftKey, JSON.stringify({ picks, currentPickIndex, draftedPlayerIds, userTeamId, activeTeams }));
    }, [picks, currentPickIndex, draftStarted, mode, mockDraftKey, userTeamId]);

    // Team Health before/after snapshot
    const computeHealthSnapshot = (teamPlayers: Player[]) => {
        const myPlayers = teamPlayers.filter(p => p.position !== 'PICK');
        const posValues: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
        myPlayers.forEach(p => { if (p.position && posValues[p.position] !== undefined) posValues[p.position] += (p.fc_value || 0); });
        const total = Object.values(posValues).reduce((s, v) => s + v, 0);
        const totalAll = teams.reduce((s, t) => s + t.players.filter(p => p.position !== 'PICK').reduce((s2, p) => s2 + (p.fc_value || 0), 0), 0);
        const avgPerTeam = totalAll / teams.length;
        let rdBetter = 0, dynBetter = 0;
        myPlayers.forEach(p => {
            const fcRank = sf ? p.fc_rank_sf : p.fc_rank_1qb;
            const rdRank = p.redraft_rank_overall;
            if (fcRank && rdRank) { if (rdRank < fcRank - 10) rdBetter++; if (fcRank < rdRank - 10) dynBetter++; }
        });
        const window = rdBetter > dynBetter + 2 ? 'Competing' : dynBetter > rdBetter + 2 ? 'Rebuilding' : 'Balanced';
        return { posValues, total, window };
    };
    const [preHealthSnapshot, setPreHealthSnapshot] = useState<ReturnType<typeof computeHealthSnapshot> | null>(null);

    // CPU drafting personalities (DRAFT_STYLES imported from @/lib/draft-simulation)
    const teamStyles = useRef<Map<number, typeof DRAFT_STYLES[number]>>(new Map());
    const getTeamStyle = (teamId: number) => {
        if (teamId === userTeamId) return DRAFT_STYLES[0]; // user always balanced
        if (!teamStyles.current.has(teamId)) {
            teamStyles.current.set(teamId, DRAFT_STYLES[Math.floor(Math.random() * DRAFT_STYLES.length)]);
        }
        return teamStyles.current.get(teamId)!;
    };
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
                // Use draft plan keepers if available, otherwise default to top N by value
                if (draftPlan && draftPlan.keeper_ids.length > 0) {
                    setSelectedKeepers(new Set(draftPlan.keeper_ids));
                } else {
                    const sortedPlayers = [...userTeam.players].sort((a,b) => (b.fc_value || 0) - (a.fc_value || 0));
                    const topKeepers = sortedPlayers.slice(0, keeperCount).map(p => p.id);
                    setSelectedKeepers(new Set(topKeepers));
                }
            }
        }
    }, [userTeamId, keeperCount, keepersConfirmed, activeTeams, draftPlan]); // run when team selected or count changes

    // Track whether user chose to use plan (shows choice screen after team selection)
    const [planChoice, setPlanChoice] = useState<'pending' | 'plan' | 'manual'>('pending');

    const handleUsePlan = () => {
        if (draftPlan && draftPlan.keeper_ids.length > 0) {
            setSelectedKeepers(new Set(draftPlan.keeper_ids));
            setPlanChoice('plan');
            // Confirm keepers immediately using plan data
            if (!keeperCount) return;
            const updatedTeams = [...activeTeams];
            const newDroppedPlayers: (Player & { droppedByTeam?: string })[] = [];
            const planKeeperSet = new Set(draftPlan.keeper_ids);

            for (let i = 0; i < updatedTeams.length; i++) {
                const team = updatedTeams[i];
                let keptPlayers = [...team.players];

                if (team.id === userTeamId) {
                    keptPlayers = team.players.filter(p => planKeeperSet.has(p.id));
                    const dropped = team.players.filter(p => !planKeeperSet.has(p.id));
                    newDroppedPlayers.push(...dropped.map(p => ({ ...p, droppedByTeam: team.name })));
                } else {
                    if (team.players.length > keeperCount) {
                        const sorted = [...team.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
                        keptPlayers = sorted.slice(0, keeperCount);
                        const dropped = sorted.slice(keeperCount);
                        newDroppedPlayers.push(...dropped.map(p => ({ ...p, droppedByTeam: team.name })));
                    }
                }

                const positionValues = { QB: 0, RB: 0, WR: 0, TE: 0 };
                keptPlayers.forEach(p => {
                    if (p.position && p.fc_value) {
                        positionValues[p.position as keyof typeof positionValues] += p.fc_value;
                    }
                });

                updatedTeams[i] = { ...team, players: keptPlayers, positionValues };
            }

            const newFreeAgents = [...availablePlayers, ...newDroppedPlayers].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            setActiveTeams(updatedTeams);
            setAvailablePlayers(newFreeAgents);
            setKeepersConfirmed(true);
        }
    };

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
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [draftBottomTab, setDraftBottomTab] = useState<'board' | 'roster' | 'needs'>('board');
    const [draftSpeed, setDraftSpeed] = useState<'instant' | 'fast' | 'realistic'>('fast');

    // Value mode: 0 = pure dynasty, 100 = pure redraft
    const [redraftWeight, setRedraftWeight] = useState(0);
    const getEffValue = (player: Player): number => getEffectiveValue(player, redraftWeight);
    const [selectedTradeAssets, setSelectedTradeAssets] = useState<Set<string>>(new Set());
    const [tradeSearch, setTradeSearch] = useState('');
    const [tradeTargetPlayer, setTradeTargetPlayer] = useState<(Player & { teamName: string; teamId: number }) | null>(null);
    const [theirTradeAssets, setTheirTradeAssets] = useState<Set<string>>(new Set());
    const [tradePosFilter, setTradePosFilter] = useState<string>('ALL');
    const [tradeForPick, setTradeForPick] = useState(false); // true when trading TO ACQUIRE the current pick
    const [selectedDraftPlayer, setSelectedDraftPlayer] = useState<Player | null>(null);
    const [advancedStats, setAdvancedStats] = useState<any[] | null>(null);
    const [playerBreakout, setPlayerBreakout] = useState<any | null>(null);
    const [playerRegression, setPlayerRegression] = useState<any[] | null>(null);
    const [rosterFitSort, setRosterFitSort] = useState<'dynasty' | 'auction'>('dynasty');
    const [watchList, setWatchList] = useState<Set<string>>(() => {
        if (typeof window !== 'undefined') {
            try { const saved = localStorage.getItem(`vff_watchlist_${leagueId}`); if (saved) return new Set(JSON.parse(saved)); } catch {}
        }
        return new Set();
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(`vff_watchlist_${leagueId}`, JSON.stringify([...watchList]));
        }
    }, [watchList, leagueId]);

    // Fetch advanced stats when player modal opens
    useEffect(() => {
        if (!selectedDraftPlayer) { setAdvancedStats(null); setPlayerBreakout(null); setPlayerRegression(null); return; }
        const id = selectedDraftPlayer.id;
        fetch(`/api/player-advanced-stats?sleeper_id=${id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.stats) setAdvancedStats(data.stats); else setAdvancedStats(null);
                if (data?.breakout) setPlayerBreakout(data.breakout); else setPlayerBreakout(null);
                if (data?.regression) setPlayerRegression(data.regression); else setPlayerRegression(null);
            })
            .catch(() => { setAdvancedStats(null); setPlayerBreakout(null); setPlayerRegression(null); });
    }, [selectedDraftPlayer]);

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
            localStorage.removeItem(liveDraftKey);
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
                    planId: availablePlans.find(p => p.name === draftPlan?.name)?.id || null,
                    draftData: {
                        userTeamName: myTeam?.name || '',
                        planName: draftPlan?.name || null,
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
    const speedDelay = draftSpeed === 'instant' ? 50 : draftSpeed === 'fast' ? 800 : 2500;
    useEffect(() => {
        if (!isLive && draftStarted && !isDraftComplete && currentPick && userTeamId !== null && availablePlayers.length > 0) {
            // Skip keeper picks (already filled)
            if (currentPick.isKeeper) {
                setCurrentPickIndex(prev => prev + 1);
                return;
            }
            if (!isUserPick) {
                if (pickTimerRef.current) return; // already scheduled
                pickTimerRef.current = setTimeout(() => {
                    pickTimerRef.current = null;
                    const result = simulatePick(currentPick.teamId);
                    if (result) {
                        makePick(result.player.id, result.reason);
                    }
                }, speedDelay);
            }
        }
        return () => {
            if (pickTimerRef.current) { clearTimeout(pickTimerRef.current); pickTimerRef.current = null; }
        };
    }, [currentPickIndex, draftStarted, userTeamId, picks, speedDelay]);

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
            const startReq = Math.round(effectiveSlots[pos]);
            const depthNeed = rosterCounts[pos] < startReq ? (startReq - rosterCounts[pos]) / startReq : 0;

            // Combine: 50% allocation, 30% depth, 20% scarcity boost
            needs[pos] = allocNeed * 0.5 + depthNeed * 0.3 + (allocNeed * (waiverScarcity[pos] - 1)) * 0.2;
        });

        return needs;
    };

    const scorePlayer = (player: Player, teamId: number): { score: number; tags: string[] } => {
        const style = getTeamStyle(teamId);
        const w = style.weights;
        // In redraft leagues (no keepers), use redraft value as primary scoring
        // This makes CPU picks follow ADP-like behavior (proven producers go early)
        const isRedraft = !keeperCount || keeperCount === 0;
        let value = isRedraft
            ? (player.redraft_auction_value || 0) * 100 // scale auction $ to comparable range
            : (player.fc_value || 0);
        const tags: string[] = [];

        // Draft Supply/Demand Adjustments based on roster slots
        const slots = rosterSlots || { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2 };
        const qbSlots = slots.QB;
        if (player.position === 'QB') {
            // 1 QB slot = heavy discount (market overvalues QBs for 1QB leagues)
            // 2+ QB slots (SF) = no discount, market values are accurate
            if (qbSlots <= 1) value *= 0.55;
        } else if (player.position === 'TE') {
            value *= slots.TE >= 2 ? 0.95 : 0.85;
        }

        // Dynasty conviction: your tier vs market rank
        const dynRank = sf ? player.rank_sf_overall : player.rank_1qb_overall;
        const fcRank = sf ? player.fc_rank_sf : player.fc_rank_1qb;
        let dynastyBoost = 0;
        if (dynRank && fcRank) {
            const gap = fcRank - dynRank;
            if (gap >= 15) { dynastyBoost = 0.12 * w.dynasty; tags.push('Dynasty Buy'); }
            else if (gap >= 8) { dynastyBoost = 0.06 * w.dynasty; }
            else if (gap <= -15) { dynastyBoost = -0.08 * w.dynasty; }
        }

        // Redraft production value
        let redraftBoost = 0;
        if (player.redraft_rank_overall && fcRank) {
            const rdGap = fcRank - player.redraft_rank_overall;
            if (rdGap >= 20) { redraftBoost = 0.10 * w.redraft; tags.push('Redraft ↑'); }
            else if (rdGap >= 10) { redraftBoost = 0.05 * w.redraft; }
            else if (rdGap <= -20) { redraftBoost = -0.05 * w.redraft; }
        }

        // ZAP prospect quality
        let zapBoost = 0;
        if (player.zap_score && !player.zap_stale) {
            if (player.zap_score >= 80) { zapBoost = 0.15 * w.prospect; tags.push('Elite Prospect'); }
            else if (player.zap_score >= 60) { zapBoost = 0.08 * w.prospect; tags.push('ZAP ↑'); }
            else if (player.zap_score >= 40) { zapBoost = 0.03 * w.prospect; }
            else if (player.zap_score < 15) { zapBoost = -0.08 * w.prospect; }
        }

        // AI confidence modifier
        if (player.writeups?.length) {
            const bestConfidence = Math.max(...player.writeups.map(wr => wr.ai_confidence || 0));
            if (bestConfidence >= 8) { value *= 1.04; }
            else if (bestConfidence <= 3) { value *= 0.96; }
        }

        // Target/Fade modifier from prospect guide
        if (player.target_fade === 'target') { value *= 1.10; tags.push('🎯 Target'); }
        else if (player.target_fade === 'fade') { value *= 0.85; tags.push('Fade'); }

        const adjustedValue = value * (1 + dynastyBoost + redraftBoost + zapBoost);

        const needs = calculatePositionalNeed(teamId);
        const posNeed = needs[player.position || ''] || 0;
        if (posNeed >= 0.5) tags.push('Need');

        const score = (adjustedValue * w.value) + (posNeed * adjustedValue * w.need);
        return { score, tags };
    };

    const simulatePick = (teamId: number): { player: Player; reason: string } | null => {
        if (availablePlayers.length === 0) return null;

        const needs = calculatePositionalNeed(teamId);
        const isRedraft = !keeperCount || keeperCount === 0;

        // Roster floor: force QB/TE if team is running out of picks without one
        const team = activeTeams.find(t => t.id === teamId);
        const teamDraftedPositions: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
        const teamKeptPositions: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
        if (team) team.players.forEach(p => { if (p.position && p.position in teamKeptPositions) teamKeptPositions[p.position as keyof typeof teamKeptPositions]++; });
        picks.filter(p => p.teamId === teamId && p.playerPosition).forEach(p => { if (p.playerPosition && p.playerPosition in teamDraftedPositions) teamDraftedPositions[p.playerPosition as keyof typeof teamDraftedPositions]++; });

        const totalQB = teamKeptPositions.QB + teamDraftedPositions.QB;
        const totalTE = teamKeptPositions.TE + teamDraftedPositions.TE;
        const remainingPicks = picks.filter(p => p.teamId === teamId && !p.playerId && !p.isKeeper).length;

        // Must-have floors: at least 1 QB and 1 TE by end of draft
        let forcedPosition: string | null = null;
        if (totalQB === 0 && totalTE === 0 && remainingPicks <= 2) {
            // Need both — take QB first (more important for scoring)
            forcedPosition = 'QB';
        } else if (totalQB === 0 && remainingPicks <= 3) {
            forcedPosition = 'QB';
        } else if (totalTE === 0 && remainingPicks <= 3) {
            forcedPosition = 'TE';
        }

        if (forcedPosition) {
            const forced = availablePlayers.filter(p => p.position === forcedPosition).sort((a, b) => {
                const av = isRedraft ? (a.redraft_auction_value || 0) : (a.fc_value || 0);
                const bv = isRedraft ? (b.redraft_auction_value || 0) : (b.fc_value || 0);
                return bv - av;
            })[0];
            if (forced) {
                return { player: forced, reason: `Roster Floor | Must start ${forcedPosition} — ${remainingPicks} picks left` };
            }
        }

        const scoredPlayers = availablePlayers.map(p => {
            const value = isRedraft ? (p.redraft_auction_value || 0) * 100 : (p.fc_value || 0);
            const posNeed = needs[p.position || ''] || 0;
            const { score, tags } = scorePlayer(p, teamId);
            return { player: p, score, value, posNeed, tags };
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
                const reason = `#${i + 1} of 3 | ${getTeamStyle(teamId).label} | Value: ${c.value} | ${c.player.position} need: ${(c.posNeed * 100).toFixed(0)}% | Score: ${c.score.toFixed(0)}`;
                return { player: c.player, reason };
            }
        }

        const c = topCandidates[0];
        return { player: c.player, reason: `BPA | ${getTeamStyle(teamId).label} | Value: ${c.value} | Score: ${c.score.toFixed(0)}` };
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
        setPlanChoice('pending');
        // Clear persisted draft state
        localStorage.removeItem(mockDraftKey);
        localStorage.removeItem(liveDraftKey);
    };

    const sf = format === 'sf';

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

    const calculateSideValue = (assets: Set<string>, teamPlayers: Player[], includeCurrentPick: boolean) => {
        let total = 0;
        if (includeCurrentPick && currentPick) total += estimatePickValue(currentPick.round, currentPick.pick);
        assets.forEach(assetId => {
            if (assetId.startsWith('player_')) {
                const player = teamPlayers.find(p => p.id === assetId.replace('player_', ''));
                if (player) total += getEffValue(player);
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
                const value = getEffValue(p);
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
                        {/* Draft Speed Selector */}
                        {draftStarted && !isDraftComplete && !isLive && (
                            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                                {([
                                    { key: 'instant', label: '⚡', title: 'Instant' },
                                    { key: 'fast', label: '🏃', title: 'Fast' },
                                    { key: 'realistic', label: '🐢', title: 'Realistic' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.key}
                                        onClick={() => setDraftSpeed(opt.key)}
                                        title={opt.title}
                                        className={`px-2 py-1.5 text-xs rounded-md transition-colors ${draftSpeed === opt.key ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sticky On-Deck Bar */}
                {draftStarted && !isDraftComplete && userTeamId !== null && (
                    <div className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
                        <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm ${
                            isUserPick
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}>
                            <div className="flex items-center gap-3">
                                {isUserPick ? (
                                    <>
                                        <span className="inline-flex items-center gap-1.5 font-bold">
                                            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                            YOUR PICK
                                        </span>
                                        <span className="text-indigo-100">
                                            Round {currentPick?.round}, Pick {currentPick?.pick}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="font-medium">{currentPick?.teamName}</span>
                                        <span className="text-zinc-500 dark:text-zinc-400">
                                            R{currentPick?.round}.{String(currentPick?.pick || 0).padStart(2, '0')}
                                        </span>
                                    </>
                                )}
                            </div>
                            {!isUserPick && (() => {
                                const nextIdx = picks.findIndex((p, i) => i > currentPickIndex && p.teamId === userTeamId && !p.playerId);
                                if (nextIdx === -1) return <span className="text-xs text-zinc-400">No more picks</span>;
                                const next = picks[nextIdx];
                                const away = nextIdx - currentPickIndex;
                                return (
                                    <span className="text-xs font-medium">
                                        You pick: <span className="text-indigo-600 dark:text-indigo-400">{next.round}.{String(next.pick).padStart(2, '0')}</span>
                                        <span className="text-zinc-400 ml-1">({away} away)</span>
                                    </span>
                                );
                            })()}
                            {isUserPick && (
                                <span className="text-xs text-indigo-100 font-medium">Select a player below</span>
                            )}
                        </div>
                    </div>
                )}

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
                        {availablePlans.length > 0 && (
                            <div className="mb-4 p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">📋 Draft Plan:</span>
                                <select
                                    value={availablePlans.find(p => p.name === draftPlan?.name)?.id || ''}
                                    onChange={(e) => loadPlanById(e.target.value)}
                                    className="text-xs bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-700 rounded px-2 py-1 text-zinc-900 dark:text-zinc-100"
                                >
                                    {availablePlans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <span className="text-[10px] text-amber-500">Keepers auto-confirmed from plan</span>
                            </div>
                        )}
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

                {/* Plan or Manual Keepers Choice */}
                {userTeamId !== null && keeperCount && keeperCount > 0 && !keepersConfirmed && availablePlans.length > 0 && planChoice === 'pending' && (
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6 mb-6">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                            Load Draft Plan?
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                            You have a saved draft plan with keepers. Use it or pick keepers manually.
                        </p>
                        {availablePlans.length > 1 && (
                            <div className="mb-4">
                                <select
                                    value={availablePlans.find(p => p.name === draftPlan?.name)?.id || ''}
                                    onChange={(e) => loadPlanById(e.target.value)}
                                    className="text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 text-zinc-900 dark:text-zinc-100"
                                >
                                    {availablePlans.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {draftPlan && (
                            <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-xs text-zinc-600 dark:text-zinc-400">
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">{draftPlan.name || 'Draft Plan'}</span>
                                {' · '}
                                {draftPlan.keeper_ids.length} keepers
                                {draftPlan.picks.filter(p => p.targetPlayer).length > 0 && (
                                    <> · {draftPlan.picks.filter(p => p.targetPlayer).length} pick targets</>
                                )}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={handleUsePlan}
                                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                            >
                                📋 Use Plan Keepers
                            </button>
                            <button
                                onClick={() => setPlanChoice('manual')}
                                className="flex-1 px-4 py-3 border-2 border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 text-zinc-700 dark:text-zinc-300 font-medium rounded-lg transition-colors"
                            >
                                ✋ Pick Manually
                            </button>
                        </div>
                    </div>
                )}

                {/* Select Keepers Screen */}
                {userTeamId !== null && keeperCount && keeperCount > 0 && !keepersConfirmed && (availablePlans.length === 0 || planChoice === 'manual') && (
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

                        {/* Value Blend Slider */}
                        <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold text-purple-500 uppercase">Dynasty</span>
                                <span className="text-[10px] font-bold text-zinc-400">{redraftWeight === 0 ? 'Pure Dynasty' : redraftWeight === 100 ? 'Pure Redraft' : redraftWeight === 50 ? 'Combined' : `${100 - redraftWeight}% Dyn / ${redraftWeight}% RD`}</span>
                                <span className="text-[10px] font-bold text-amber-500 uppercase">Redraft</span>
                            </div>
                            <input type="range" min={0} max={100} step={10} value={redraftWeight} onChange={e => setRedraftWeight(Number(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                            {(() => {
                                const userTeam = activeTeams.find(t => t.id === userTeamId);
                                if (!userTeam) return null;
                                const sortedPlayers = [...userTeam.players].sort((a,b) => getEffValue(b) - getEffValue(a));
                                
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
                                                    {getEffValue(player).toLocaleString()}
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
                                            {/* Late Round Draft Guide data */}
                                            {(() => {
                                                const lr = customRankingsMap?.[player.id]?.find((r: any) => r.source?.toLowerCase().includes('late round'));
                                                if (!lr) return null;
                                                const tier = lr.tier || (lr.notes ? (() => { const m = lr.notes.match(/Tier\s+(\d+)/); return m ? parseInt(m[1]) : null; })() : null);
                                                const ms = lr.marketScore || (lr.notes ? (() => { const m = lr.notes.match(/Market Score:\s*([\d.]+)/); return m ? parseFloat(m[1]) : null; })() : null);
                                                return (
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] mt-1">
                                                        {lr.rank && <span className="font-medium text-emerald-700 dark:text-emerald-400">LR #{lr.rank}</span>}
                                                        {tier && <span className="text-zinc-500">T{tier}</span>}
                                                        {ms && <span className={`font-medium ${ms >= 70 ? 'text-green-600 dark:text-green-400' : ms >= 50 ? 'text-zinc-600 dark:text-zinc-400' : 'text-red-500'}`}>MS {ms.toFixed(0)}</span>}
                                                        {lr.signal && (
                                                            <span className={`px-1.5 py-0.5 rounded font-medium ${
                                                                lr.signal.includes('Super Buy') ? 'bg-green-600 text-white' :
                                                                lr.signal === 'Buy' ? 'bg-green-500 text-white' :
                                                                lr.signal === 'Hold' ? 'bg-zinc-400 text-white' :
                                                                lr.signal === 'Sell' ? 'bg-red-500 text-white' :
                                                                lr.signal.includes('Super Sell') ? 'bg-red-600 text-white' :
                                                                'bg-zinc-600 text-white'
                                                            }`}>{lr.signal}</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
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

                        {/* Plan Selector */}
                        {availablePlans.length > 0 && (
                            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400">📋 Draft Plan:</span>
                                    <select
                                        value={availablePlans.find(p => p.name === draftPlan?.name)?.id || ''}
                                        onChange={(e) => loadPlanById(e.target.value)}
                                        className="text-xs bg-white dark:bg-zinc-800 border border-amber-200 dark:border-amber-700 rounded px-2 py-1 text-zinc-900 dark:text-zinc-100"
                                    >
                                        {availablePlans.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    {draftPlan && <span className="text-[10px] text-amber-600 dark:text-amber-400">Active — keepers + pick targets loaded</span>}
                                </div>
                            </div>
                        )}

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
                                    if (userTeamId) {
                                        const myTeam = activeTeams.find(t => t.id === userTeamId);
                                        if (myTeam) setPreHealthSnapshot(computeHealthSnapshot(myTeam.players));
                                    }
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
                                    {(() => {
                                        const needs = calculatePositionalNeed(userTeamId!);
                                        const userTeam = activeTeams.find(t => t.id === userTeamId);

                                        // Count current roster + drafted at each position
                                        const rosterCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
                                        userTeam?.players.forEach(p => { if (p.position && p.position in rosterCounts) rosterCounts[p.position]++; });
                                        picks.filter(p => p.teamId === userTeamId && p.playerPosition).forEach(p => { if (p.playerPosition && p.playerPosition in rosterCounts) rosterCounts[p.playerPosition]++; });

                                        const startReqs: Record<string, number> = {
                                            QB: Math.round(effectiveSlots.QB),
                                            RB: Math.round(effectiveSlots.RB),
                                            WR: Math.round(effectiveSlots.WR),
                                            TE: Math.round(effectiveSlots.TE),
                                        };

                                        // Score all available players
                                        const scored = availablePlayers
                                            .map(p => {
                                                const value = p.fc_value || 0;
                                                const posNeed = needs[p.position || ''] || 0;
                                                const { score, tags } = scorePlayer(p, userTeamId!);
                                                return { player: p, score, value, posNeed, tags };
                                            })
                                            .sort((a, b) => b.score - a.score);

                                        const top = scored[0];
                                        const alternatives = scored.slice(1, 5);

                                        if (!top) return <div className="text-sm text-zinc-500">No players available.</div>;

                                        // Generate the "fills" context
                                        const pos = top.player.position || '';
                                        const currentCount = rosterCounts[pos] || 0;
                                        const slotLabel = `${pos}${currentCount + 1}`;
                                        const startReq = startReqs[pos] || 0;
                                        const isStarterSlot = currentCount < startReq;

                                        // Generate scarcity context
                                        const topPlayersAtPos = availablePlayers.filter(p => p.position === pos && (p.fc_value || 0) > (top.value * 0.6)).length;

                                        // Count teams ahead that need this position
                                        const teamsAheadNeedingPos = (() => {
                                            let count = 0;
                                            for (let i = currentPickIndex + 1; i < picks.length && i < currentPickIndex + 12; i++) {
                                                const pick = picks[i];
                                                if (pick.playerId) continue;
                                                if (pick.teamId === userTeamId) break;
                                                const teamNeeds = calculatePositionalNeed(pick.teamId);
                                                if ((teamNeeds[pos] || 0) >= 0.3) count++;
                                            }
                                            return count;
                                        })();

                                        // Build the "edge" sentence
                                        let edge = '';
                                        if (topPlayersAtPos <= 2 && teamsAheadNeedingPos >= 2) {
                                            edge = `Only ${topPlayersAtPos} comparable ${pos}s left and ${teamsAheadNeedingPos} teams ahead need ${pos}. High urgency.`;
                                        } else if (topPlayersAtPos <= 3) {
                                            edge = `${pos} supply is thin — ${topPlayersAtPos} quality options remain at this level.`;
                                        } else if (isStarterSlot) {
                                            edge = `Fills a starting slot. You need ${startReq - currentCount} more ${pos}${startReq - currentCount > 1 ? 's' : ''} for your lineup.`;
                                        } else if (top.tags.includes('Elite Prospect') || top.tags.includes('ZAP ↑')) {
                                            edge = `Best prospect available by a wide margin. Value pick regardless of positional need.`;
                                        } else if (top.posNeed < 0.15) {
                                            edge = `Luxury pick — you're set at ${pos}. Taking best value on the board.`;
                                        } else {
                                            edge = `Strong value relative to board. ${teamsAheadNeedingPos > 0 ? `${teamsAheadNeedingPos} team${teamsAheadNeedingPos > 1 ? 's' : ''} ahead also eyeing ${pos}.` : ''}`;
                                        }

                                        // Alt reasoning
                                        const getAltReason = (c: typeof top) => {
                                            const p = c.player.position || '';
                                            const altCount = rosterCounts[p] || 0;
                                            const altIsStarter = altCount < (startReqs[p] || 0);
                                            if (c.tags.includes('Elite Prospect')) return 'Elite prospect talent';
                                            if (c.tags.includes('Need') && altIsStarter) return `Fills ${p}${altCount + 1} starter hole`;
                                            if (c.tags.includes('ZAP ↑')) return 'High ZAP upside';
                                            if (c.tags.includes('Dynasty Buy')) return 'Market undervalues';
                                            if (c.tags.includes('Redraft ↑')) return 'Win-now production';
                                            if (c.posNeed < 0.1) return 'Luxury / BPA';
                                            return 'Good value';
                                        };

                                        return (
                                            <>
                                                {/* Draft Plan suggestion */}
                                                {draftPlan && draftPlan.picks.length > 0 && (() => {
                                                    // Find the plan's suggestion for this pick based on round/pick
                                                    const currentPick = picks[currentPickIndex];
                                                    const planPick = draftPlan.picks.find(pp =>
                                                        pp.round === currentPick?.round && pp.slot === currentPick?.pick
                                                    ) || draftPlan.picks[picks.filter(p => p.teamId === userTeamId && p.playerId && picks.indexOf(p) < currentPickIndex).length];

                                                    if (!planPick?.targetPlayer) return null;

                                                    const isAvailable = availablePlayers.some(p =>
                                                        p.full_name === planPick.targetPlayer
                                                    );

                                                    return (
                                                        <div className={`mb-3 px-3 py-2 rounded-lg border ${isAvailable ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20' : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/30 opacity-60'}`}>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">📋 Your Plan</span>
                                                                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{planPick.targetPlayer}</span>
                                                                {planPick.targetPosition && (
                                                                    <span className="text-[10px] text-zinc-500">({planPick.targetPosition})</span>
                                                                )}
                                                                {isAvailable && (
                                                                    <button
                                                                        onClick={() => {
                                                                            const player = availablePlayers.find(p => p.full_name === planPick.targetPlayer);
                                                                            if (player) makePick(player.id, 'Draft Plan');
                                                                        }}
                                                                        className="ml-auto px-3 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg active:scale-95 transition-all"
                                                                    >
                                                                        Draft
                                                                    </button>
                                                                )}
                                                                {!isAvailable && <span className="text-[10px] text-red-500 font-medium ml-auto">Unavailable</span>}
                                                            </div>
                                                            {planPick.notes && <div className="text-[10px] text-zinc-500 mt-0.5">{planPick.notes}</div>}
                                                        </div>
                                                    );
                                                })()}

                                                {/* Primary recommendation */}
                                                <div className="bg-indigo-50 dark:bg-indigo-950/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1">
                                                            <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-1">🎯 Recommended</div>
                                                            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                                                                {top.player.full_name}
                                                                <span className={`ml-2 text-sm font-medium ${pos === 'QB' ? 'text-green-600' : pos === 'RB' ? 'text-blue-600' : pos === 'WR' ? 'text-red-600' : 'text-orange-600'}`}>{pos}</span>
                                                            </div>
                                                            <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                                                                <span className="font-medium">Fills:</span> {slotLabel} {isStarterSlot ? '(starter)' : '(depth)'} — you have {currentCount} {pos}{currentCount !== 1 ? 's' : ''}
                                                            </div>
                                                            <div className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
                                                                <span className="font-medium">Edge:</span> {edge}
                                                            </div>
                                                            {top.tags.length > 0 && (
                                                                <div className="flex gap-1 mt-2 flex-wrap">
                                                                    {top.tags.map(tag => (
                                                                        <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                                                            tag === 'Elite Prospect' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                                                            tag === 'ZAP ↑' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                                            tag === 'Dynasty Buy' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' :
                                                                            tag === 'Redraft ↑' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                                                                            tag === 'Need' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                                                                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                                                                        }`}>{tag}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col gap-2 flex-shrink-0">
                                                            <button
                                                                onClick={() => { makePick(top.player.id); }}
                                                                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-95 transition-all"
                                                            >
                                                                Draft
                                                            </button>
                                                            <button
                                                                onClick={() => setSelectedDraftPlayer(top.player)}
                                                                className="px-4 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                                            >
                                                                Info
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Alternatives */}
                                                <div className="mt-3">
                                                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Alternatives</div>
                                                    <div className="space-y-1">
                                                        {alternatives.map((c, i) => (
                                                            <div key={c.player.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <span className="text-[10px] text-zinc-400 font-mono w-4">#{i + 2}</span>
                                                                    <div className="min-w-0">
                                                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.player.full_name}</span>
                                                                        <span className={`ml-1.5 text-xs ${c.player.position === 'QB' ? 'text-green-600' : c.player.position === 'RB' ? 'text-blue-600' : c.player.position === 'WR' ? 'text-red-600' : 'text-orange-600'}`}>{c.player.position}</span>
                                                                        <span className="ml-2 text-xs text-zinc-400">— {getAltReason(c)}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                                    <button
                                                                        onClick={() => { makePick(c.player.id); }}
                                                                        className="px-2 py-1 text-xs font-bold text-white bg-green-600 rounded hover:bg-green-700 active:scale-95 transition-all"
                                                                    >
                                                                        ✓
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setSelectedDraftPlayer(c.player)}
                                                                        className="px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded"
                                                                    >
                                                                        Info
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                    {/* Trade This Pick suggestions */}
                                    {(() => {
                                        if (!currentPick || !userTeamId) return null;
                                        // Your pick value = BPA at this spot
                                        const pickValue = availablePlayers[0]?.fc_value || 3000;
                                        const bpaPosition = availablePlayers[0]?.position || 'BPA';

                                        // Find teams picking later that might want to trade up
                                        const laterPicksByTeam = new Map<number, { pickIndex: number; round: number; pick: number }>();
                                        for (let i = currentPickIndex + 1; i < picks.length; i++) {
                                            const p = picks[i];
                                            if (p.teamId !== userTeamId && !p.playerId && !laterPicksByTeam.has(p.teamId)) {
                                                laterPicksByTeam.set(p.teamId, { pickIndex: i, round: p.round, pick: p.pick });
                                            }
                                        }

                                        // For each later team, compute realistic trade-up offer
                                        const tradeOffers: { teamId: number; teamName: string; offer: string; offerValue: number; premium: number; reason: string }[] = [];
                                        laterPicksByTeam.forEach(({ pickIndex, round, pick }, teamId) => {
                                            const team = activeTeams.find(t => t.id === teamId);
                                            if (!team) return;

                                            // Their pick value = BPA at their pick position
                                            // Approximate: how many players will be taken between now and their pick
                                            const picksAway = pickIndex - currentPickIndex;
                                            const theirBPA = availablePlayers[Math.min(picksAway, availablePlayers.length - 1)];
                                            const theirPickValue = theirBPA?.fc_value || Math.round(pickValue * 0.5);

                                            // Gap they need to bridge
                                            const gap = pickValue - theirPickValue;
                                            if (gap <= 0) return; // their pick is somehow worth more — no trade-up needed

                                            // Trade-up premium: 10-20% overpay (closer picks = less premium needed)
                                            const premiumPct = picksAway <= 3 ? 1.05 : picksAway <= 6 ? 1.10 : 1.15;
                                            const targetOffer = Math.round(pickValue * premiumPct);
                                            const sweetenerNeeded = targetOffer - theirPickValue;

                                            // Does this team even WANT to trade up? Check if BPA position is a need for them
                                            const posCount = team.players.filter(p => p.position === bpaPosition).length;
                                            const wouldTradeUp = bpaPosition === 'RB' ? posCount < 4 :
                                                                  bpaPosition === 'WR' ? posCount < 5 :
                                                                  bpaPosition === 'QB' ? posCount < 2 :
                                                                  bpaPosition === 'TE' ? posCount < 2 : true;
                                            if (!wouldTradeUp) return;

                                            // Find sweetener: a startable player they have depth at
                                            // Prefer positions where they're deep (can afford to lose)
                                            const posCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
                                            team.players.forEach(p => { if (p.position && p.position in posCounts) posCounts[p.position as keyof typeof posCounts]++; });

                                            const sweetenerCandidates = team.players
                                                .filter(p => {
                                                    if (!p.position || p.position === 'PICK') return false;
                                                    const val = p.fc_value || 0;
                                                    // Must be worth enough to matter, within 60%-150% of what's needed
                                                    if (val < sweetenerNeeded * 0.6 || val > sweetenerNeeded * 1.5) return false;
                                                    // Team should have depth at this position (2+ others)
                                                    const posDepth = posCounts[p.position] || 0;
                                                    if (posDepth < 3) return false;
                                                    return true;
                                                })
                                                .sort((a, b) => {
                                                    // Prefer closest to sweetener value needed
                                                    const aDiff = Math.abs((a.fc_value || 0) - sweetenerNeeded);
                                                    const bDiff = Math.abs((b.fc_value || 0) - sweetenerNeeded);
                                                    return aDiff - bDiff;
                                                });

                                            const sweetener = sweetenerCandidates[0];
                                            if (!sweetener) return; // can't construct a fair offer

                                            const offerValue = theirPickValue + (sweetener.fc_value || 0);
                                            // Only show if the total offer beats your pick value (real overpay)
                                            if (offerValue < pickValue * 1.02) return;

                                            const premium = Math.round(((offerValue / pickValue) - 1) * 100);
                                            const reason = `wants ${bpaPosition} (has ${posCount})`;

                                            tradeOffers.push({
                                                teamId,
                                                teamName: team.name,
                                                offer: `${round}.${String(pick).padStart(2, '0')} + ${sweetener.full_name}`,
                                                offerValue,
                                                premium,
                                                reason,
                                            });
                                        });

                                        const topOffers = tradeOffers
                                            .sort((a, b) => b.offerValue - a.offerValue)
                                            .slice(0, 3);

                                        if (topOffers.length === 0) return null;

                                        return (
                                            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                                <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase mb-2">💰 Trade Back Options</div>
                                                <div className="space-y-2">
                                                    {topOffers.map((offer, i) => (
                                                        <div key={i} className="text-xs">
                                                            <div className="flex items-center justify-between">
                                                                <div className="min-w-0">
                                                                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{offer.teamName}</span>
                                                                    <span className="text-zinc-500 ml-1">offers {offer.offer}</span>
                                                                </div>
                                                                <span className="text-[10px] font-mono font-bold flex-shrink-0 ml-2 text-green-600">
                                                                    +{offer.premium}% ({offer.offerValue.toLocaleString()})
                                                                </span>
                                                            </div>
                                                            <div className="text-[9px] text-zinc-400 mt-0.5">{offer.reason}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-2 pt-1.5 border-t border-amber-200 dark:border-amber-800">
                                                    Your pick value: ~{pickValue.toLocaleString()} · BPA: {availablePlayers[0]?.full_name} ({bpaPosition})
                                                </div>
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
                                            .map(p => { const { score, tags } = scorePlayer(p, currentPick.teamId); return { player: p, score, value: p.fc_value || 0, posNeed: needs[p.position || ''] || 0, tags }; })
                                            .sort((a, b) => b.score - a.score)
                                            .slice(0, 3);
                                        return (
                                            <div className="flex flex-col sm:flex-row gap-2 justify-center mt-2">
                                                {top3.map((c, i) => (
                                                    <div key={c.player.id} onClick={() => makePick(c.player.id)} className={`text-left px-3 py-2 rounded-lg border-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${i === 0 ? 'border-zinc-300 dark:border-zinc-600' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                                        <div className="text-xs text-zinc-400">Projected #{i + 1}</div>
                                                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{c.player.full_name} <span className="text-zinc-400">{c.player.position}</span></div>
                                                        <div className="text-[10px] text-zinc-500">Value: {c.value} | Score: {c.score.toFixed(0)}</div>
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

                            {/* Team Health Before/After */}
                            {preHealthSnapshot && userTeamId !== null && (() => {
                                const myTeam = activeTeams.find(t => t.id === userTeamId);
                                if (!myTeam) return null;
                                const myDraftedPicks = picks.filter(p => p.teamId === userTeamId && p.playerId);
                                const draftedPlayers = myDraftedPicks.map(p => freeAgents.find(fa => fa.id === p.playerId) || draftedPlayerMap.current.get(p.playerId!)).filter(Boolean) as Player[];
                                const postPlayers = [...myTeam.players, ...draftedPlayers];
                                const post = computeHealthSnapshot(postPlayers);
                                const pre = preHealthSnapshot;
                                const positions = ['QB', 'RB', 'WR', 'TE'] as const;
                                return (
                                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6">
                                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">📊 Team Health: Before → After</h3>
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                                                <div className="text-[9px] font-bold text-zinc-500 uppercase">Before</div>
                                                <div className="text-lg font-black text-zinc-400">{pre.total.toLocaleString()}</div>
                                                <div className="text-[9px] text-zinc-500">{pre.window}</div>
                                            </div>
                                            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3 text-center">
                                                <div className="text-[9px] font-bold text-zinc-500 uppercase">After</div>
                                                <div className="text-lg font-black text-green-500">{post.total.toLocaleString()}</div>
                                                <div className="text-[9px] text-zinc-500">{post.window}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {positions.map(pos => {
                                                const before = pre.posValues[pos] || 0;
                                                const after = post.posValues[pos] || 0;
                                                const delta = after - before;
                                                return (
                                                    <div key={pos} className="text-center bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2">
                                                        <div className="text-[10px] font-bold text-zinc-400">{pos}</div>
                                                        <div className="text-xs font-mono text-zinc-500">{before.toLocaleString()}</div>
                                                        <div className="text-[10px]">→</div>
                                                        <div className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">{after.toLocaleString()}</div>
                                                        {delta > 0 && <div className="text-[9px] font-bold text-green-500">+{delta.toLocaleString()}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

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

                            {/* Comprehensive Draft Analysis */}
                            {userTeamId !== null && (() => {
                                const my = gradeScores.find(t => t.team.id === userTeamId);
                                if (!my) return null;
                                const myTeam = activeTeams.find(t => t.id === userTeamId);
                                if (!myTeam) return null;

                                const myDraftedPicks = picks.filter(p => p.teamId === userTeamId && p.playerId);
                                const draftedPlayers = myDraftedPicks.map(p => {
                                    const fa = freeAgents.find(f => f.id === p.playerId) || draftedPlayerMap.current.get(p.playerId!);
                                    return fa ? { ...fa, round: p.round, pick: p.pick, pickIndex: picks.indexOf(p) } : null;
                                }).filter(Boolean) as (Player & { round: number; pick: number; pickIndex: number })[];

                                const fullRoster = [...myTeam.players, ...draftedPlayers];
                                const positions = ['QB', 'RB', 'WR', 'TE'] as const;

                                // --- Draft Strategy Recap ---
                                const posDist = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0 };
                                draftedPlayers.forEach(p => { if (p.position && p.position in posDist) posDist[p.position as keyof typeof posDist]++; });
                                const heavyPos = Object.entries(posDist).sort(([,a], [,b]) => b - a)[0];
                                const strategyLabel = heavyPos[1] >= 4 ? `${heavyPos[0]}-heavy` : heavyPos[1] >= 3 ? `${heavyPos[0]}-leaning` : 'Balanced';

                                // Best value pick: highest value relative to pick position
                                const bestValue = draftedPlayers.reduce((best, p) => {
                                    // What was the expected value at this pick? Use BPA that was available
                                    const picksBeforeThis = picks.filter((pk, i) => i < p.pickIndex && pk.playerId).length;
                                    const expectedValue = freeAgents[Math.min(picksBeforeThis, freeAgents.length - 1)]?.fc_value || 0;
                                    const surplus = (p.fc_value || 0) - expectedValue * 0.85;
                                    return surplus > (best?.surplus || -Infinity) ? { player: p, surplus } : best;
                                }, null as { player: typeof draftedPlayers[0]; surplus: number } | null);

                                // Biggest reach: lowest value relative to when they were picked
                                const biggestReach = draftedPlayers.reduce((worst, p) => {
                                    const overallPick = (p.round - 1) * activeTeams.length + p.pick;
                                    // How many players with higher value were still available?
                                    const betterAvailable = freeAgents.filter(fa => 
                                        (fa.fc_value || 0) > (p.fc_value || 0) && !draftedPlayers.some(dp => dp.id === fa.id && dp.pickIndex < p.pickIndex)
                                    ).length;
                                    return betterAvailable > (worst?.betterAvailable || 0) ? { player: p, betterAvailable } : worst;
                                }, null as { player: typeof draftedPlayers[0]; betterAvailable: number } | null);

                                // --- Win-Now vs Dynasty ---
                                const avgAge = draftedPlayers.reduce((sum, p) => sum + (p.years_exp || 0), 0) / (draftedPlayers.length || 1);
                                const startersCount = my.starters.length;
                                const totalDraftedValue = draftedPlayers.reduce((s, p) => s + (p.fc_value || 0), 0);
                                const redraftValue = draftedPlayers.reduce((s, p) => s + (p.redraft_auction_value || 0), 0);
                                const dynastyScore = totalDraftedValue > 25000 ? 'A' : totalDraftedValue > 18000 ? 'B+' : totalDraftedValue > 12000 ? 'B' : totalDraftedValue > 8000 ? 'C+' : 'C';
                                const winNowScore = redraftValue > 80 ? 'A' : redraftValue > 55 ? 'B+' : redraftValue > 35 ? 'B' : redraftValue > 20 ? 'C+' : 'C';
                                const youthPct = draftedPlayers.filter(p => (p.years_exp || 0) <= 2).length / (draftedPlayers.length || 1);

                                // --- Value Over Replacement ---
                                const vorData = draftedPlayers.map((p, idx) => {
                                    // Find next pick by this team after this one
                                    const nextTeamPick = draftedPlayers.find((dp, i) => i > idx);
                                    const nextPickIndex = nextTeamPick ? nextTeamPick.pickIndex : picks.length;
                                    // Who was the next best player at this position available?
                                    const nextBestAtPos = freeAgents.find(fa => 
                                        fa.position === p.position &&
                                        (fa.fc_value || 0) < (p.fc_value || 0) &&
                                        !draftedPlayers.some(dp => dp.id === fa.id && dp.pickIndex <= p.pickIndex)
                                    );
                                    const vor = (p.fc_value || 0) - (nextBestAtPos?.fc_value || 0);
                                    return { player: p, nextBest: nextBestAtPos, vor };
                                });

                                // --- Roster Gaps ---
                                const rosterByPos: Record<string, Player[]> = { QB: [], RB: [], WR: [], TE: [] };
                                fullRoster.forEach(p => { if (p.position && p.position in rosterByPos) rosterByPos[p.position].push(p); });
                                Object.values(rosterByPos).forEach(arr => arr.sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)));
                                const idealStarters: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1 };
                                const gaps: { pos: string; issue: string; bestPlayer: string; tier: number }[] = [];
                                positions.forEach(pos => {
                                    const best = rosterByPos[pos][0];
                                    const bestValue = best?.fc_value || 0;
                                    const count = rosterByPos[pos].length;
                                    if (count < idealStarters[pos]) {
                                        gaps.push({ pos, issue: `Missing starter (have ${count}/${idealStarters[pos]})`, bestPlayer: best?.full_name || 'None', tier: 0 });
                                    } else if (bestValue < 3000 && pos !== 'TE') {
                                        gaps.push({ pos, issue: `No elite option (best: ${best?.full_name})`, bestPlayer: best?.full_name || '', tier: Math.ceil(bestValue / 1000) });
                                    } else if (bestValue < 2000 && pos === 'TE') {
                                        gaps.push({ pos, issue: `No top-tier TE (best: ${best?.full_name})`, bestPlayer: best?.full_name || '', tier: Math.ceil(bestValue / 1000) });
                                    }
                                });

                                // --- Draft Efficiency ---
                                // For each of your picks, BPA = best player that was actually available at that point
                                // We approximate by using the pick's overall position (how many picks happened before)
                                let theoreticalMax = 0;
                                const sortedFreeAgents = [...freeAgents].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
                                const effBreakdown: { player: typeof draftedPlayers[0]; bpa: Player | null; bpaValue: number; actualValue: number; delta: number }[] = [];
                                
                                // Build a set of all players taken before each of your picks
                                const allPicksInOrder = picks.filter(p => p.playerId);
                                for (const dp of draftedPlayers) {
                                    // How many picks happened before this one?
                                    const picksBefore = allPicksInOrder.filter(p => picks.indexOf(p) < dp.pickIndex).length;
                                    // BPA at this point = the best player from the pool after removing `picksBefore` players
                                    // Since other teams took from the same pool, the Nth best player is roughly at index N
                                    const bpaPlayer = sortedFreeAgents[Math.min(picksBefore, sortedFreeAgents.length - 1)] || null;
                                    const bpaValue = bpaPlayer?.fc_value || 0;
                                    const actualValue = dp.fc_value || 0;
                                    const delta = actualValue - bpaValue;
                                    theoreticalMax += bpaValue;
                                    effBreakdown.push({ player: dp, bpa: bpaPlayer, bpaValue, actualValue, delta });
                                }
                                const efficiency = theoreticalMax > 0 ? Math.round((totalDraftedValue / theoreticalMax) * 100) : 100;
                                const effGrade = efficiency >= 90 ? 'A+' : efficiency >= 80 ? 'A' : efficiency >= 70 ? 'B+' : efficiency >= 60 ? 'B' : efficiency >= 50 ? 'C+' : 'C';
                                const biggestMisses = [...effBreakdown].sort((a, b) => a.delta - b.delta).filter(e => e.delta < -200);

                                return (
                                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-4 sm:p-6 space-y-6">
                                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">📈 Draft Analysis</h3>

                                        {/* Strategy Recap */}
                                        <div>
                                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Strategy Recap</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                                                    <div className="text-[9px] text-zinc-500 uppercase">Approach</div>
                                                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{strategyLabel}</div>
                                                </div>
                                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                                                    <div className="text-[9px] text-zinc-500 uppercase">Picks</div>
                                                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{draftedPlayers.length}</div>
                                                    <div className="text-[9px] text-zinc-400">{Object.entries(posDist).filter(([,v]) => v > 0).map(([k,v]) => `${v}${k}`).join(' · ')}</div>
                                                </div>
                                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                                                    <div className="text-[9px] text-zinc-500 uppercase">Best Value</div>
                                                    <div className="text-sm font-bold text-green-600">{bestValue?.player.full_name.split(' ').pop()}</div>
                                                    <div className="text-[9px] text-zinc-400">{bestValue ? `+${Math.round(bestValue.surplus).toLocaleString()} surplus` : ''}</div>
                                                </div>
                                                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2.5 text-center">
                                                    <div className="text-[9px] text-zinc-500 uppercase">Biggest Reach</div>
                                                    <div className="text-sm font-bold text-amber-600">{biggestReach && biggestReach.betterAvailable > 3 ? biggestReach.player.full_name.split(' ').pop() : 'None'}</div>
                                                    <div className="text-[9px] text-zinc-400">{biggestReach && biggestReach.betterAvailable > 3 ? `${biggestReach.betterAvailable} better avail` : 'Solid picks'}</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Win-Now vs Dynasty */}
                                        <div>
                                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Win-Now vs Dynasty</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Win-Now</span>
                                                        <span className={`text-lg font-black ${winNowScore.startsWith('A') ? 'text-green-600' : winNowScore.startsWith('B') ? 'text-blue-600' : 'text-amber-600'}`}>{winNowScore}</span>
                                                    </div>
                                                    <div className="text-[10px] text-amber-600 dark:text-amber-400">{startersCount} starters drafted</div>
                                                    <div className="text-[10px] text-amber-600 dark:text-amber-400">${redraftValue} auction value</div>
                                                </div>
                                                <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-bold text-purple-700 dark:text-purple-400">Dynasty</span>
                                                        <span className={`text-lg font-black ${dynastyScore.startsWith('A') ? 'text-green-600' : dynastyScore.startsWith('B') ? 'text-blue-600' : 'text-amber-600'}`}>{dynastyScore}</span>
                                                    </div>
                                                    <div className="text-[10px] text-purple-600 dark:text-purple-400">{Math.round(youthPct * 100)}% young players (≤2 yrs)</div>
                                                    <div className="text-[10px] text-purple-600 dark:text-purple-400">{totalDraftedValue.toLocaleString()} dynasty value added</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Value Over Replacement */}
                                        <div>
                                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Value Over Replacement</h4>
                                            <div className="space-y-1">
                                                {vorData.slice(0, 6).map((v, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs">
                                                        <span className="text-zinc-400 font-mono w-10">{v.player.round}.{String(v.player.pick).padStart(2, '0')}</span>
                                                        <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${posBadge(v.player.position || '')}`}>{v.player.position}</span>
                                                        <span className="text-zinc-900 dark:text-zinc-100 font-medium flex-1 truncate">{v.player.full_name}</span>
                                                        <span className={`font-mono font-bold text-[11px] ${v.vor > 0 ? 'text-green-600' : 'text-zinc-400'}`}>
                                                            {v.vor > 0 ? `+${v.vor.toLocaleString()}` : '—'}
                                                        </span>
                                                        <span className="text-[9px] text-zinc-400 w-24 text-right truncate">
                                                            {v.nextBest ? `vs ${v.nextBest.full_name.split(' ').pop()}` : ''}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            {vorData.length > 6 && <div className="text-[9px] text-zinc-400 mt-1">+ {vorData.length - 6} more picks</div>}
                                        </div>

                                        {/* Roster Gaps */}
                                        <div>
                                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Roster Gaps Remaining</h4>
                                            {gaps.length === 0 ? (
                                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">✓ No critical gaps — roster is well-rounded</div>
                                            ) : (
                                                <div className="space-y-1.5">
                                                    {gaps.map((g, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${posBadge(g.pos)}`}>{g.pos}</span>
                                                            <span className="text-red-700 dark:text-red-300 flex-1">{g.issue}</span>
                                                            <span className="text-[9px] text-red-500">Consider trading for upgrade</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Draft Efficiency */}
                                        <div>
                                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Draft Efficiency</h4>
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                                                        <span>Actual: {totalDraftedValue.toLocaleString()}</span>
                                                        <span>Theoretical Max: {theoreticalMax.toLocaleString()}</span>
                                                    </div>
                                                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${efficiency >= 80 ? 'bg-green-500' : efficiency >= 60 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                                            style={{ width: `${Math.min(100, efficiency)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <div className={`text-2xl font-black ${effGrade.startsWith('A') ? 'text-green-600' : effGrade.startsWith('B') ? 'text-blue-600' : 'text-amber-600'}`}>{effGrade}</div>
                                                    <div className="text-[9px] text-zinc-400">{efficiency}%</div>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-zinc-500 mt-2">
                                                {efficiency >= 85 ? 'Excellent — you drafted near-optimal value at every pick.' :
                                                 efficiency >= 70 ? 'Good — you captured strong value with minor misses.' :
                                                 efficiency >= 55 ? 'Average — some value left on the board, likely for positional need.' :
                                                 'Below average — significant value missed. Consider BPA strategy next time.'}
                                            </p>
                                            {/* Per-pick breakdown */}
                                            <div className="mt-3 space-y-0.5">
                                                <div className="text-[9px] font-bold text-zinc-400 uppercase mb-1">Pick-by-Pick Breakdown</div>
                                                {effBreakdown.map((e, i) => (
                                                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                                        <span className="text-zinc-400 font-mono w-10">{e.player.round}.{String(e.player.pick).padStart(2, '0')}</span>
                                                        <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{e.player.full_name}</span>
                                                        <span className="text-zinc-500 font-mono w-12 text-right">{e.actualValue.toLocaleString()}</span>
                                                        <span className="text-zinc-400 w-4 text-center">vs</span>
                                                        <span className="text-zinc-400 font-mono w-12 text-right">{e.bpaValue.toLocaleString()}</span>
                                                        <span className={`font-mono font-bold w-14 text-right text-[10px] ${e.delta >= 0 ? 'text-green-600' : e.delta > -500 ? 'text-amber-500' : 'text-red-500'}`}>
                                                            {e.delta >= 0 ? '+' : ''}{e.delta.toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            {biggestMisses.length > 0 && (
                                                <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                                    <div className="text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase mb-1">Value Left on Board</div>
                                                    <div className="space-y-1">
                                                        {biggestMisses.slice(0, 3).map((e, i) => (
                                                            <div key={i} className="text-[11px] text-amber-700 dark:text-amber-300">
                                                                {e.player.round}.{String(e.player.pick).padStart(2, '0')}: Took <span className="font-medium">{e.player.full_name}</span> ({e.actualValue.toLocaleString()}) — BPA was <span className="font-medium">{e.bpa?.full_name}</span> ({e.bpaValue.toLocaleString()})
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
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

                            {/* Late Round Power Rankings */}
                            {(() => {
                                // Build full rosters (existing + drafted) for each team
                                const teamsForAnalysis = activeTeams.map(team => {
                                    const teamDraftedPicks = picks.filter(p => p.teamId === team.id && p.playerId);
                                    const draftedPlayers = teamDraftedPicks.map(p => {
                                        const fa = freeAgents.find(f => f.id === p.playerId) || draftedPlayerMap.current.get(p.playerId!);
                                        if (!fa) return null;
                                        return { id: fa.id, full_name: fa.full_name, position: fa.position, fc_value: fa.fc_value, years_exp: fa.years_exp, zap_score: fa.zap_score, zap_category: fa.zap_category } as PlayerForAnalysis;
                                    }).filter(Boolean) as PlayerForAnalysis[];

                                    const existingPlayers = team.players.map(p => ({
                                        id: p.id, full_name: p.full_name, position: p.position, fc_value: p.fc_value, years_exp: p.years_exp, zap_score: p.zap_score, zap_category: p.zap_category,
                                    } as PlayerForAnalysis));

                                    return { id: team.id, name: team.name, players: [...existingPlayers, ...draftedPlayers] };
                                });

                                const analyses = analyzeLeaguePostDraft(teamsForAnalysis, customRankingsMap);
                                const gradeColor2 = (g: string) => g.startsWith('A') ? 'text-green-600 dark:text-green-400' : g.startsWith('B') ? 'text-blue-600 dark:text-blue-400' : g.startsWith('C') ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                                const posGradeColor = (g: string) => g.startsWith('A') ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : g.startsWith('B') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : g.startsWith('C') ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';

                                return (
                                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg p-6">
                                        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">📋 Late Round Power Rankings</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Full roster evaluation based on Late Round Draft Guide tiers, Market Score, and strategic fit</p>
                                        <div className="space-y-4">
                                            {analyses.map(ta => (
                                                <div key={ta.teamId} className={`border rounded-lg p-4 ${ta.teamId === userTeamId ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/30 dark:bg-indigo-950/10' : 'border-zinc-200 dark:border-zinc-700'}`}>
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm font-bold text-zinc-500">#{ta.powerRank}</span>
                                                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{ta.teamName}</span>
                                                                {ta.teamId === userTeamId && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded font-medium">YOU</span>}
                                                            </div>
                                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{ta.summary}</p>
                                                        </div>
                                                        <span className={`text-2xl font-bold ${gradeColor2(ta.overallGrade)}`}>{ta.overallGrade}</span>
                                                    </div>

                                                    {/* Position grades */}
                                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                                        {ta.positionGrades.map(pg => (
                                                            <div key={pg.position} className="text-center">
                                                                <div className="text-[10px] font-bold text-zinc-400">{pg.position}</div>
                                                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${posGradeColor(pg.grade)}`}>{pg.grade}</span>
                                                                <div className="text-[9px] text-zinc-400 mt-0.5">{pg.tierBreakdown}</div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Strengths & Weaknesses */}
                                                    {(ta.strengths.length > 0 || ta.weaknesses.length > 0) && (
                                                        <div className="flex flex-col sm:flex-row gap-2 text-[11px]">
                                                            {ta.strengths.length > 0 && (
                                                                <div className="flex-1">
                                                                    <span className="font-semibold text-green-600 dark:text-green-400">✓ </span>
                                                                    {ta.strengths.slice(0, 2).join(' · ')}
                                                                </div>
                                                            )}
                                                            {ta.weaknesses.length > 0 && (
                                                                <div className="flex-1">
                                                                    <span className="font-semibold text-red-500 dark:text-red-400">✗ </span>
                                                                    {ta.weaknesses.slice(0, 2).join(' · ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Market Score + Elite count */}
                                                    <div className="flex gap-3 mt-2 text-[10px] text-zinc-400">
                                                        {ta.marketScoreAvg && <span>Avg Mkt Score: <span className={ta.marketScoreAvg >= 60 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>{ta.marketScoreAvg.toFixed(0)}</span></span>}
                                                        {ta.eliteCount > 0 && <span>Elite players (T1-5): <span className="font-medium text-zinc-600 dark:text-zinc-300">{ta.eliteCount}</span></span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
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
                            customRankingsMap={customRankingsMap}
                        />
                        {userTeamId !== null && (
                            <PositionScarcityChart
                                players={myRosterPlayers}
                                format={format}
                                onPlayerClick={setSelectedDraftPlayer}
                                title="My Roster"
                                topN={30}
                                emptyMessage="Draft players to build your roster"
                                customRankingsMap={customRankingsMap}
                            />
                        )}
                        {userTeamId !== null && myRosterPlayers.length > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold text-zinc-500 uppercase">Roster ({myRosterPlayers.length})</h4>
                                    <span className="text-[10px] text-zinc-400">
                                        ${myRosterPlayers.reduce((s, p) => s + (p.redraft_auction_value || 0), 0)} total auction
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                                    {[...myRosterPlayers].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).map(p => (
                                        <div key={p.id} className="flex items-center gap-1.5 text-xs py-0.5">
                                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                                p.position === 'QB' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                                                p.position === 'RB' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                p.position === 'WR' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                                p.position === 'TE' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                            }`}>{p.position}</span>
                                            <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{p.full_name}</span>
                                            <span className="text-zinc-400 font-mono text-[10px]">{(p.fc_value || 0).toLocaleString()}</span>
                                            {p.redraft_auction_value ? (
                                                <span className="text-amber-600 font-mono text-[10px] w-7 text-right">${p.redraft_auction_value}</span>
                                            ) : (
                                                <span className="text-zinc-300 dark:text-zinc-700 font-mono text-[10px] w-7 text-right">—</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Available Players (when user's pick, or always in live mode) */}
                {draftStarted && !isDraftComplete && (isUserPick || isLive) && (
                    <AvailablePlayersTable
                        availablePlayers={availablePlayers}
                        watchList={watchList}
                        toggleWatchList={toggleWatchList}
                        makePick={makePick}
                        setSelectedDraftPlayer={setSelectedDraftPlayer}
                        sf={sf}
                        customRankingsMap={customRankingsMap}
                        rankingsVintage={rankingsVintage}
                        redraftVintage={redraftVintage}
                        isLive={isLive}
                        leagueId={leagueId}
                    />
                )}


                {/* Pick History Log */}
                <PickHistoryLog
                    picks={picks}
                    currentPickIndex={currentPickIndex}
                    userTeamId={userTeamId}
                    draftStarted={draftStarted}
                />

                {/* Draft Board + Roster Sidebar (Tabbed) */}
                <DraftBoardGrid
                    picks={picks}
                    teams={teams}
                    activeTeams={activeTeams}
                    draftBottomTab={draftBottomTab}
                    setDraftBottomTab={setDraftBottomTab}
                    currentPickIndex={currentPickIndex}
                    userTeamId={userTeamId}
                    draftStarted={draftStarted}
                    isDraftComplete={isDraftComplete}
                    ROUNDS={ROUNDS}
                    calculatePositionalNeed={calculatePositionalNeed}
                />

                {/* Player Detail Modal */}
                {selectedDraftPlayer && (
                    <PlayerDetailModal
                        player={selectedDraftPlayer}
                        advancedStats={advancedStats}
                        breakout={playerBreakout}
                        regression={playerRegression}
                        sf={sf}
                        isLive={isLive}
                        isUserPick={isUserPick}
                        userTeamId={userTeamId}
                        activeTeams={activeTeams}
                        picks={picks}
                        freeAgents={freeAgents}
                        availablePlayers={availablePlayers}
                        customRankingsMap={customRankingsMap}
                        draftPlan={draftPlan}
                        rosterFitSort={rosterFitSort}
                        rosterSlots={rosterSlots}
                        onClose={() => setSelectedDraftPlayer(null)}
                        onDraft={(id) => { makePick(id); setSelectedDraftPlayer(null); }}
                        onRosterFitSortChange={setRosterFitSort}
                    />
                )}

                {/* Trade Modal */}
                {showTradeModal && userTeamId !== null && currentPick && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowTradeModal(false); setTradeTargetPlayer(null); setTradeSearch(''); setSelectedTradeAssets(new Set()); setTheirTradeAssets(new Set()); setTradePosFilter('ALL'); setTradeForPick(false); }}>
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 z-10">
                                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">Trade Evaluator</h2>
                                {/* Value Blend Slider */}
                                <div className="mb-3 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[9px] font-bold text-purple-500 uppercase">Dynasty</span>
                                        <span className="text-[9px] font-bold text-zinc-400">{redraftWeight === 0 ? 'Pure Dynasty' : redraftWeight === 100 ? 'Pure Redraft' : redraftWeight === 50 ? 'Combined' : `${100 - redraftWeight}/${redraftWeight}`}</span>
                                        <span className="text-[9px] font-bold text-amber-500 uppercase">Redraft</span>
                                    </div>
                                    <input type="range" min={0} max={100} step={10} value={redraftWeight} onChange={e => setRedraftWeight(Number(e.target.value))}
                                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500" />
                                </div>
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
