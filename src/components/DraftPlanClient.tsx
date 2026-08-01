'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Target, Users, ClipboardList, StickyNote, ChevronDown, Check, X, Star } from 'lucide-react';
import { PositionScarcityChart } from '@/components/PositionScarcityChart';
import { analyzeLeaguePostDraft, type TeamAnalysis } from '@/lib/post-draft-analysis';
import { runMonteCarloSim, getMonteCarloAvailability, type SimResult } from '@/lib/draft-monte-carlo';
import { getPositionColor } from '@/lib/positionColors';
import { useAuth } from '@/hooks/useUser';

// --- Types ---

import { Player } from '@/types/player';

interface DraftPick {
    season: number;
    round: number;
    slot: number;
    overall: number;
    originalOwner: number;
    currentOwner: number;
}

interface TeamData {
    id: number;
    name: string;
    players: Player[];
    draftPicks?: DraftPick[];
}

interface PickPlanEntry {
    pickNumber: number;
    round: number;
    slot: number;
    targetPosition: string | null; // 'QB' | 'RB' | 'WR' | 'TE' | 'BPA' | null
    targetPlayer: string | null; // primary player name (first selected)
    targetPlayers: string[]; // multiple penciled-in options
    notes: string;
}

interface RosterTargets {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    BPA: number;
}

interface DraftPlanClientProps {
    leagueId: string;
    platform: 'sleeper' | 'fleaflicker';
    format: '1qb' | 'sf';
    myTeam?: TeamData;
    allTeams: TeamData[];
    freeAgents: Player[];
    keeperCount?: number;
    customRankingsMap?: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]>;
    statsBoostMap?: Record<string, number>;
}

// --- Component ---

interface SavedPlan {
    id: string;
    name: string;
    keeper_ids: string;
    roster_targets: string;
    picks: string;
    tier_source: string;
    notes: string | null;
    updated_at: string;
}

export function DraftPlanClient({
    leagueId,
    platform,
    format,
    myTeam,
    allTeams,
    freeAgents,
    keeperCount,
    customRankingsMap,
    statsBoostMap,
}: DraftPlanClientProps) {
    // Auth — get user identifier for API calls
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const userId = sleeperUsername || fleaflickerUsername || 'anonymous';

    // Plan management state
    const [plans, setPlans] = useState<SavedPlan[]>([]);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [planName, setPlanName] = useState('Draft Plan 1');
    const [plansLoading, setPlansLoading] = useState(true);

    // State
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => {
        if (typeof window === 'undefined') return myTeam?.id ?? null;
        const saved = localStorage.getItem(`vff_draft_plan_team_${leagueId}`);
        if (saved) {
            const id = parseInt(saved);
            if (allTeams.some(t => t.id === id)) return id;
        }
        return myTeam?.id ?? null;
    });
    const [keeperIds, setKeeperIds] = useState<string[]>([]);
    const [rosterTargets, setRosterTargets] = useState<RosterTargets>({ QB: 0, RB: 0, WR: 0, TE: 0, BPA: 0 });
    const [picks, setPicks] = useState<PickPlanEntry[]>([]);
    const [tierSource, setTierSource] = useState<'dynasty' | 'redraft' | 'zap'>('dynasty');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState<'keepers' | 'board' | 'results' | 'notes'>('board');

    // Watchlist: starred players you're tracking availability for
    // Uses same localStorage key as mock draft so they share the list
    const [watchlist, setWatchlist] = useState<string[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const saved = localStorage.getItem(`vff_watchlist_${leagueId}`);
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const toggleWatchlist = (playerId: string) => {
        const next = watchlist.includes(playerId)
            ? watchlist.filter(id => id !== playerId)
            : [...watchlist, playerId];
        setWatchlist(next);
        try { localStorage.setItem(`vff_watchlist_${leagueId}`, JSON.stringify(next)); } catch {}
    };

    // Derive active team from selection
    const activeTeam = allTeams.find(t => t.id === selectedTeamId) || null;

    // Persist team selection
    const handleTeamChange = (teamId: number) => {
        setSelectedTeamId(teamId);
        localStorage.setItem(`vff_draft_plan_team_${leagueId}`, String(teamId));
        // Reset picks when team changes (they'll re-initialize from new team's picks)
        setPicks([]);
        setKeeperIds([]);
    };

    // Load all plans for this league
    useEffect(() => {
        async function loadPlans() {
            try {
                const res = await fetch(`/api/draft-plans?league_id=${leagueId}&user_id=${userId}`);
                if (res.ok) {
                    const { plans: loadedPlans } = await res.json();
                    if (Array.isArray(loadedPlans) && loadedPlans.length > 0) {
                        setPlans(loadedPlans);
                        // Auto-select the most recently updated plan
                        const mostRecent = loadedPlans[0];
                        loadPlanData(mostRecent);
                    }
                }
            } catch (e) {
                console.error('Failed to load draft plans:', e);
            } finally {
                setPlansLoading(false);
                setLoading(false);
            }
        }
        loadPlans();
    }, [leagueId, userId]);

    // Load a specific plan's data into the editor
    const loadPlanData = (plan: SavedPlan) => {
        setActivePlanId(plan.id);
        setPlanName(plan.name);
        setKeeperIds(JSON.parse(plan.keeper_ids || '[]'));
        setRosterTargets(JSON.parse(plan.roster_targets || '{}'));
        setTierSource((plan.tier_source as any) || 'dynasty');
        setNotes(plan.notes || '');
    };

    // Create a new plan
    const createNewPlan = async () => {
        const name = `Draft Plan ${plans.length + 1}`;
        try {
            const res = await fetch('/api/draft-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ league_id: leagueId, platform, name }),
            });
            if (res.ok) {
                const { plan } = await res.json();
                setPlans(prev => [plan, ...prev]);
                loadPlanData(plan);
                // Don't reset picks — draft board slots don't change between plans
                // Only keepers and targets differ (handled by loadPlanData)
            }
        } catch (e) {
            console.error('Failed to create plan:', e);
        }
    };

    // Branch from a specific pick — duplicates plan up to that point with a new name
    const branchFromPick = async (pickIdx: number) => {
        const pick = picks[pickIdx];
        // Use base plan name (strip any existing "→ Branch" suffix)
        const baseName = planName.split(' → Branch')[0];
        const branchName = `${baseName} → Branch at ${pick.round}.${String(pick.slot).padStart(2, '0')}`;
        try {
            const res = await fetch('/api/draft-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({
                    league_id: leagueId,
                    platform,
                    name: branchName,
                    keeper_ids: keeperIds,
                    tier_source: tierSource,
                    notes: `Branched from "${baseName}" at pick ${pick.round}.${String(pick.slot).padStart(2, '0')}. Make different selections from this point.`,
                }),
            });
            if (res.ok) {
                const { plan } = await res.json();
                setPlans(prev => [plan, ...prev]);
                setActivePlanId(plan.id);
                setPlanName(branchName);
                // Clear pick selections so user starts fresh from this point
                const newPicks = picks.map((p, i) => i >= pickIdx ? { ...p, targetPlayer: null, targetPlayers: [], targetPosition: null } : p);
                setPicks(newPicks);
            } else {
                console.error('Branch failed:', res.status);
            }
        } catch (e) {
            console.error('Failed to branch plan:', e);
        }
    };

    // Delete a plan
    const deletePlan = async (planId: string) => {
        try {
            const res = await fetch(`/api/draft-plans?id=${planId}&user_id=${userId}`, { method: 'DELETE' });
            if (res.ok) {
                setPlans(prev => prev.filter(p => p.id !== planId));
                if (activePlanId === planId) {
                    setActivePlanId(null);
                    setPlanName('');
                    setKeeperIds([]);
                    setNotes('');
                }
            }
        } catch (e) {
            console.error('Failed to delete plan:', e);
        }
    };

    // Initialize picks from team's draft picks
    // In a keeper league: you keep N, draft N → open spots = keeperCount
    // (roster size = 2× keepers in a standard keeper league)
    useEffect(() => {
        if (!loading && activeTeam?.draftPicks) {
            const allPicks = [...activeTeam.draftPicks]
                .sort((a, b) => a.overall - b.overall);

            // Cap at open roster spots
            // Open spots = keeperCount (you keep 10, draft 10 to fill back to 20)
            const openSpots = keeperCount || allPicks.length;
            const cappedPicks = allPicks.slice(0, openSpots);

            if (cappedPicks.length > 0) {
                setPicks(cappedPicks.map(p => ({
                    pickNumber: p.overall,
                    round: p.round,
                    slot: p.slot,
                    targetPosition: null,
                    targetPlayer: null,
                    targetPlayers: [],
                    notes: '',
                })));
            }
        }
    }, [loading, activeTeam, keeperCount]);

    // Save plan
    const savePlan = useCallback(async () => {
        setSaving(true);
        try {
            if (activePlanId) {
                // Update existing plan
                const res = await fetch('/api/draft-plans', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                    body: JSON.stringify({
                        id: activePlanId,
                        name: planName,
                        keeper_ids: keeperIds,
                        roster_targets: rosterTargets,
                        picks,
                        tier_source: tierSource,
                        notes,
                    }),
                });
                if (res.ok) {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                    // Update local plans list
                    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, name: planName, updated_at: new Date().toISOString() } : p));
                }
            } else {
                // Create new plan
                const res = await fetch('/api/draft-plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                    body: JSON.stringify({
                        league_id: leagueId,
                        platform,
                        name: planName || 'Draft Plan',
                        keeper_ids: keeperIds,
                        roster_targets: rosterTargets,
                        picks,
                        tier_source: tierSource,
                        notes,
                    }),
                });
                if (res.ok) {
                    const { plan } = await res.json();
                    setActivePlanId(plan.id);
                    setPlans(prev => [plan, ...prev]);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                }
            }
        } catch (e) {
            console.error('Failed to save draft plan:', e);
        } finally {
            setSaving(false);
        }
    }, [leagueId, platform, activePlanId, planName, keeperIds, rosterTargets, picks, tierSource, notes]);

    // Position color helper
    const posColor = getPositionColor;

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="animate-pulse text-zinc-400">Loading draft plan...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Plan Management Bar */}
            <div className="flex items-center gap-3 flex-wrap">
                <select
                    value={activePlanId || ''}
                    onChange={(e) => {
                        const plan = plans.find(p => p.id === e.target.value);
                        if (plan) { loadPlanData(plan); setPicks([]); }
                    }}
                    className="text-sm font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-zinc-900 dark:text-zinc-100"
                >
                    {plans.length === 0 && <option value="">No saved plans</option>}
                    {plans.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Plan name..."
                    className="text-sm px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 w-40"
                />
                <button
                    onClick={createNewPlan}
                    className="text-xs px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium"
                >
                    + New Plan
                </button>
                {activePlanId && (
                    <button
                        onClick={() => { if (confirm('Delete this plan?')) deletePlan(activePlanId); }}
                        className="text-xs px-3 py-1.5 rounded-md bg-red-50 dark:bg-red-900/20 hover:bg-red-100 text-red-600 dark:text-red-400 font-medium"
                    >
                        Delete
                    </button>
                )}
            </div>

            {/* Header with team selector and save button */}
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Draft Plan</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <select
                            value={selectedTeamId ?? ''}
                            onChange={(e) => handleTeamChange(parseInt(e.target.value))}
                            className="text-sm font-medium bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-zinc-900 dark:text-zinc-100 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <option value="" disabled>Select your team</option>
                            {allTeams
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(team => (
                                    <option key={team.id} value={team.id}>{team.name}</option>
                                ))
                            }
                        </select>
                        <span className="text-sm text-zinc-400">
                            {keeperCount ? `· ${keeperCount} keepers` : ''}
                            {' · '}{format === 'sf' ? 'SF' : '1QB'}
                        </span>
                    </div>
                </div>
                <button
                    onClick={savePlan}
                    disabled={saving || !selectedTeamId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all flex-shrink-0 ${
                        saved
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    } disabled:opacity-50`}
                >
                    {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Plan'}
                </button>
            </div>

            {/* Section tabs */}
            <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                {[
                    { key: 'keepers' as const, label: 'Keepers', icon: Users },
                    { key: 'board' as const, label: 'Draft Board', icon: ClipboardList },
                    { key: 'results' as const, label: 'Results', icon: Target },
                    { key: 'notes' as const, label: 'Notes', icon: StickyNote },
                ].map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setActiveSection(key)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium flex-1 justify-center transition-colors ${
                            activeSection === key
                                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-sm'
                                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                        }`}
                    >
                        <Icon className="w-4 h-4 hidden sm:block" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* Tier source toggle */}
            <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">Tier Source:</span>
                {(['dynasty', 'redraft', 'zap'] as const).map(source => (
                    <button
                        key={source}
                        onClick={() => setTierSource(source)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            tierSource === source
                                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400'
                        }`}
                    >
                        {source === 'dynasty' ? 'Dynasty' : source === 'redraft' ? 'Redraft' : 'ZAP'}
                    </button>
                ))}
            </div>

            {/* Active section content */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 dark:ring-zinc-800 overflow-hidden">
                {activeSection === 'keepers' && (
                    <div className="p-4 sm:p-6">
                        {activeTeam && keeperCount ? (
                            <KeeperSelectionSection
                                players={activeTeam.players}
                                keeperIds={keeperIds}
                                setKeeperIds={setKeeperIds}
                                keeperCount={keeperCount}
                                format={format}
                                leagueId={leagueId}
                                posColor={posColor}
                            />
                        ) : (
                            <div className="text-center py-8 text-zinc-400">
                                <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                {!activeTeam
                                    ? <p>Select your team above to view keeper recommendations.</p>
                                    : <p>This league is not configured as a keeper league.</p>
                                }
                            </div>
                        )}
                    </div>
                )}
                {activeSection === 'board' && (
                    <DraftBoardSection
                        activeTeam={activeTeam}
                        keeperIds={keeperIds}
                        freeAgents={freeAgents}
                        picks={picks}
                        setPicks={setPicks}
                        format={format}
                        numTeams={allTeams.length}
                        allTeams={allTeams}
                        keeperCount={keeperCount}
                        customRankingsMap={customRankingsMap}
                        statsBoostMap={statsBoostMap}
                        watchlist={watchlist}
                        toggleWatchlist={toggleWatchlist}
                        posColor={posColor}
                        onBranchFromPick={branchFromPick}
                        tierSource={tierSource}
                    />
                )}
                {activeSection === 'results' && (
                    <PlanResultsSection leagueId={leagueId} plans={plans} />
                )}
                {activeSection === 'notes' && (
                    <NotesSection notes={notes} setNotes={setNotes} />
                )}
            </div>
        </div>
    );
}

// --- Draft Board Section (combined picks + suggestions) ---

function DraftBoardSection({
    activeTeam,
    keeperIds,
    freeAgents,
    picks,
    setPicks,
    format,
    numTeams,
    allTeams,
    keeperCount,
    customRankingsMap,
    statsBoostMap,
    watchlist,
    toggleWatchlist,
    posColor,
    onBranchFromPick,
    tierSource,
}: {
    activeTeam: TeamData | null;
    keeperIds: string[];
    freeAgents: Player[];
    picks: PickPlanEntry[];
    setPicks: (picks: PickPlanEntry[]) => void;
    format: '1qb' | 'sf';
    numTeams: number;
    allTeams: TeamData[];
    keeperCount?: number;
    customRankingsMap?: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]>;
    statsBoostMap?: Record<string, number>;
    watchlist: string[];
    toggleWatchlist: (playerId: string) => void;
    posColor: (pos: string | null) => string;
    onBranchFromPick: (pickIdx: number) => void;
    tierSource: 'dynasty' | 'redraft' | 'zap';
}) {
    if (!activeTeam) {
        return (
            <div className="p-6 text-center text-zinc-400">
                <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Select your team to see draft suggestions.</p>
            </div>
        );
    }

    const sf = format === 'sf';

    // === BUILD THE REAL DRAFT POOL ===
    // Simulate keeper cuts: all teams (including yours) keep top N, dropped players enter the pool
    const droppedPlayers: Player[] = [];
    if (keeperCount && keeperCount > 0) {
        allTeams.forEach(team => {
            if (team.id === activeTeam.id) {
                // Your team: players NOT in keeperIds get dropped to the pool
                const dropped = team.players.filter(p => !keeperIds.includes(p.id));
                droppedPlayers.push(...dropped);
            } else {
                // Other teams: drop their lowest-value players beyond keeper count
                const sorted = [...team.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
                const dropped = sorted.slice(keeperCount);
                droppedPlayers.push(...dropped);
            }
        });
    }

    // Draft pool = free agents + dropped players from all teams, sorted by value
    const draftPool = [...freeAgents, ...droppedPlayers]
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // === ANALYZE KEPT ROSTER ===
    // Build a lookup from all available players (team + pool) to resolve keeper IDs
    const allPlayersById = new Map<string, Player>();
    activeTeam.players.forEach(p => allPlayersById.set(p.id, p));
    freeAgents.forEach(p => allPlayersById.set(p.id, p));

    const keptPlayers = keeperIds.map(id => allPlayersById.get(id)).filter(Boolean) as Player[];
    const keptCounts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const keptValues: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    keptPlayers.forEach(p => {
        if (p.position && p.position in keptCounts) {
            keptCounts[p.position]++;
            keptValues[p.position] += p.fc_value || 0;
        }
    });

    const idealStarters: Record<string, number> = sf
        ? { QB: 2, RB: 3, WR: 4, TE: 2 }
        : { QB: 1, RB: 3, WR: 4, TE: 2 };

    // Position needs
    const needs: { pos: string; gap: number; urgency: 'high' | 'medium' | 'low'; reason: string }[] = [];
    (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
        const have = keptCounts[pos];
        const want = idealStarters[pos];
        const gap = Math.max(0, want - have);
        if (gap > 0) {
            const urgency = gap >= 2 ? 'high' : have === 0 ? 'high' : 'medium';
            const reason = have === 0
                ? `No ${pos} on roster — must address early`
                : `${have}/${want} starters kept`;
            needs.push({ pos, gap, urgency, reason });
        }
    });
    needs.sort((a, b) => {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.gap - a.gap;
    });

    // === SIMULATE DRAFT USING DRAFT GUIDE STRATEGY ===
    // Primary: Market Score (Late Round guide) + Redraft auction value (production)
    // Base: Composite of auction value (redraft) + dynasty value (long-term)
    const scoreForUs = (player: Player, currentCounts: Record<string, number>) => {
        const pos = player.position || '';
        const dynValue = player.fc_value || 0;

        // --- BASE: Composite value ---
        // In keeper leagues, the high-auction players are kept — available pool is mostly
        // rookies and rising players with low/no auction values. Dynasty value is the
        // primary signal for who's worth drafting; auction/redraft layers on top as a 
        // production floor indicator.
        const auctionValue = player.redraft_auction_value || 0;
        const normalizedAuction = auctionValue * 250; // $30 → 7500, $15 → 3750, $5 → 1250

        // If player has auction value, blend it in (production floor).
        // Otherwise just use dynasty value (most rookies/prospects).
        let baseValue: number;
        if (auctionValue >= 10) {
            // Proven producer with real auction value: blend 40% auction + 60% dynasty
            baseValue = (normalizedAuction * 0.40) + (dynValue * 0.60);
        } else if (auctionValue > 0) {
            // Low auction (bench/dart throw): mostly dynasty, slight production floor
            baseValue = (normalizedAuction * 0.20) + (dynValue * 0.80);
        } else {
            // No auction data (rookies, deep prospects): pure dynasty
            baseValue = dynValue;
        }

        // Position discount: in 1QB, QBs are replaceable — discount their composite
        if (pos === 'QB' && !sf) baseValue *= 0.5;

        // --- PRIMARY: Market Score boost (Late Round guide's core signal) ---
        // Market Score 70+ = undervalued (target), 50 = fair, <40 = overvalued (avoid)
        const lr = customRankingsMap?.[player.id];
        const lrEntry = lr?.find(r => r.source?.toLowerCase().includes('late round'));
        const marketScore = lrEntry?.marketScore ?? null;

        let marketMultiplier = 1.0;
        if (marketScore !== null) {
            if (marketScore >= 80) marketMultiplier = 1.25;       // Strong buy
            else if (marketScore >= 70) marketMultiplier = 1.15;  // Buy signal
            else if (marketScore >= 60) marketMultiplier = 1.05;  // Slight value
            else if (marketScore <= 35) marketMultiplier = 0.75;  // Overvalued — avoid
            else if (marketScore <= 45) marketMultiplier = 0.85;  // Slight fade
        }

        // Apply market score
        const adjustedValue = baseValue * marketMultiplier;

        // --- ZAP prospect boost (for rookies/year 2 players) ---
        let zapBoost = 0;
        if (player.zap_score && !player.zap_stale) {
            if (player.zap_score >= 80) zapBoost = 0.12;
            else if (player.zap_score >= 60) zapBoost = 0.06;
            else if (player.zap_score < 15) zapBoost = -0.06;
        } else if (player.zap_category) {
            const cat = player.zap_category.toLowerCase();
            if (cat.includes('elite')) zapBoost = 0.10;
            else if (cat.includes('starter')) zapBoost = 0.05;
            else if (cat.includes('dart')) zapBoost = -0.04;
        }

        const valueWithProspect = adjustedValue * (1 + zapBoost);

        // --- Advanced stats boost (from nflreadpy data) ---
        const advBoost = statsBoostMap?.[player.id] || 1.0;
        const valueWithStats = valueWithProspect * advBoost;

        // --- Positional need ---
        // Value always leads. Need is only a PENALTY for overstocked positions,
        // never a boost that causes a reach. You fill needs by natural value flow.
        const have = currentCounts[pos] || 0;
        const want = idealStarters[pos] || 0;

        // Position roster caps (you'd never roster more than this)
        const rosterCaps: Record<string, number> = sf
            ? { QB: 3, RB: 7, WR: 8, TE: 3 }
            : { QB: 2, RB: 7, WR: 8, TE: 2 };
        const maxAtPos = rosterCaps[pos] || 5;

        let needMultiplier = 1.0; // default: no boost, no penalty
        if (have >= maxAtPos) {
            needMultiplier = 0.0; // hard cap — never draft beyond roster cap
        } else if (have >= want + 3) {
            needMultiplier = 0.5; // deeply overstocked
        } else if (have >= want + 1) {
            needMultiplier = 0.75; // over target but roster can hold more
        } else if (have >= want) {
            needMultiplier = 0.85; // at target — very slight discount
        }
        // If below target (gap > 0): no boost, just 1.0 — value does the talking

        const score = valueWithStats * needMultiplier;
        return score;
    };

    // Simulate other teams' picks (they just take BPA by raw value)
    const scoreForCPU = (player: Player) => {
        let value = player.fc_value || 0;
        if (player.position === 'QB' && !sf) value *= 0.55;
        if (player.position === 'TE') value *= 0.85;
        return value;
    };

    // Run the simulation
    const remainingPool = [...draftPool];
    const draftedByPos: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const pickSuggestions: (typeof picks[number] & { suggestion: string; targetPos: string; best: { player: Player; score: number } | null; runnerUp: { player: Player; score: number } | null; insights: string[]; candidates: { player: Player; score: number; tag: string }[] })[] = [];

    // For each of our picks, simulate all picks before it, then pick for us
    let lastOverall = 0;
    for (let idx = 0; idx < picks.length; idx++) {
        const pick = picks[idx];
        const overallPick = pick.pickNumber || ((pick.round - 1) * numTeams + pick.slot);

        // Simulate CPU picks between our last pick and this one
        const picksBetween = Math.max(0, overallPick - lastOverall - 1);
        for (let i = 0; i < picksBetween && remainingPool.length > 0; i++) {
            // CPU takes BPA (by adjusted value)
            let bestIdx = 0;
            let bestScore = -1;
            for (let j = 0; j < Math.min(5, remainingPool.length); j++) {
                const s = scoreForCPU(remainingPool[j]);
                if (s > bestScore) { bestScore = s; bestIdx = j; }
            }
            remainingPool.splice(bestIdx, 1);
        }
        lastOverall = overallPick;

        // If user already selected a player for this pick, use their choice
        const userChoice = picks[idx]?.targetPlayer;
        const userChosenPlayer = userChoice ? remainingPool.find(p => p.full_name === userChoice) || draftPool.find(p => p.full_name === userChoice) : null;

        // Now pick for us: score top candidates with our need-aware logic
        const currentCounts = {
            QB: keptCounts.QB + draftedByPos.QB,
            RB: keptCounts.RB + draftedByPos.RB,
            WR: keptCounts.WR + draftedByPos.WR,
            TE: keptCounts.TE + draftedByPos.TE,
        };

        // Score top 10 available players
        const candidates = remainingPool.slice(0, 20)
            .map((p, i) => ({ player: p, poolIdx: i, score: scoreForUs(p, currentCounts) }))
            .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        const runnerUp = candidates.find(c => c.player.position !== best?.player.position);

        let suggestion = '';
        let targetPos = 'BPA';

        if (best && best.player) {
            targetPos = best.player.position || 'BPA';
            const pos = best.player.position as 'QB' | 'RB' | 'WR' | 'TE';
            const slotNum = pos ? (currentCounts[pos] || 0) + 1 : 0;
            const stillNeed = pos ? (idealStarters[pos] || 0) - (currentCounts[pos] || 0) : 0;

            const valueStr = (best.player.fc_value || 0).toLocaleString();
            if (stillNeed >= 2) {
                suggestion = `${best.player.full_name} (${valueStr}) — ${pos} critical need (${slotNum}/${idealStarters[pos] || 0})`;
            } else if (stillNeed === 1) {
                suggestion = `${best.player.full_name} (${valueStr}) — fills ${pos}${slotNum} starter slot`;
            } else {
                suggestion = `${best.player.full_name} (${valueStr}) — depth / BPA`;
            }

            if (runnerUp && runnerUp.player && (best.score - runnerUp.score) < best.score * 0.15) {
                suggestion += ` · or ${runnerUp.player.full_name} (${runnerUp.player.position})`;
            }

            // Remove from pool and track
            if (pos) draftedByPos[pos] = (draftedByPos[pos] || 0) + 1;
            remainingPool.splice(best.poolIdx, 1);
        } else {
            suggestion = 'Slim pickings — take best available';
        }

        // If user chose a different player, remove THEIR choice from pool instead
        if (userChosenPlayer && best && userChosenPlayer.id !== best.player.id) {
            const userIdx = remainingPool.findIndex(p => p.id === userChosenPlayer.id);
            if (userIdx >= 0) remainingPool.splice(userIdx, 1);
            // Re-add the system's pick since user didn't take it
            // (it's already removed above, so downstream picks won't see it regardless)
        }

        // Generate strategic insights for this pick
        const insights: string[] = [];
        const currentCountsForInsight = {
            QB: keptCounts.QB + draftedByPos.QB,
            RB: keptCounts.RB + draftedByPos.RB,
            WR: keptCounts.WR + draftedByPos.WR,
            TE: keptCounts.TE + draftedByPos.TE,
        };

        // Analyze each position's board state
        const positionInsights: { pos: string; playersInTier: number; topValue: number; need: number; nextPickGap: number }[] = [];
        const nextPicksBefore = idx < picks.length - 1
            ? ((picks[idx + 1].pickNumber || 0) - (pick.pickNumber || 0) - 1)
            : numTeams;

        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const posPlayersLeft = remainingPool.filter(p => p.position === pos);
            if (posPlayersLeft.length === 0) return;
            const topValue = posPlayersLeft[0]?.fc_value || 0;
            const sameTier = posPlayersLeft.filter(p => (p.fc_value || 0) >= topValue * 0.65);
            const have = currentCountsForInsight[pos];
            const want = idealStarters[pos] || 0;
            const need = want - have;

            positionInsights.push({ pos, playersInTier: sameTier.length, topValue, need, nextPickGap: nextPicksBefore });
        });

        // Urgent tier breaks (positions about to dry up)
        const urgent = positionInsights.filter(p => p.playersInTier <= 2 && p.need > 0);
        urgent.forEach(u => {
            insights.push(`⚠️ Last ${u.playersInTier} quality ${u.pos}${u.playersInTier > 1 ? 's' : ''} in this tier — end of the line if you need one`);
        });

        // Positions where tier thins before your next pick
        const thinning = positionInsights.filter(p => p.playersInTier > 2 && p.playersInTier <= p.nextPickGap && p.need > 0);
        thinning.forEach(t => {
            insights.push(`${t.pos}: ${t.playersInTier} in tier but ${t.nextPickGap} picks until you're up again — may not survive`);
        });

        // Positions you can safely wait on
        const safe = positionInsights.filter(p => p.playersInTier > 5 && p.need > 0);
        if (safe.length > 0) {
            const safeNames = safe.map(s => `${s.pos} (${s.playersInTier} deep)`).join(', ');
            insights.push(`Can wait on: ${safeNames}`);
        }

        // If you have no needs, give board-level context
        if (insights.length === 0) {
            const bestValuePos = positionInsights.sort((a, b) => b.topValue - a.topValue)[0];
            if (bestValuePos) {
                insights.push(`Best value on board: ${bestValuePos.pos} at ${bestValuePos.topValue.toLocaleString()} — pure BPA territory`);
            }
        }

        // Build candidate list: best at each position from BEFORE this pick was made
        // Build candidates from FULL draft pool (not depleted sim pool)
        // Users want to see all top options with availability %, not just sim survivors
        const candidatesByPos: { player: Player; score: number; tag: string }[] = [];
        const currentCountsForCandidates = {
            QB: keptCounts.QB + draftedByPos.QB - (best && best.player.position === 'QB' ? 1 : 0),
            RB: keptCounts.RB + draftedByPos.RB - (best && best.player.position === 'RB' ? 1 : 0),
            WR: keptCounts.WR + draftedByPos.WR - (best && best.player.position === 'WR' ? 1 : 0),
            TE: keptCounts.TE + draftedByPos.TE - (best && best.player.position === 'TE' ? 1 : 0),
        };
        (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
            const posPlayers = draftPool.filter(p => p.position === pos).slice(0, 3);
            posPlayers.forEach(posPlayer => {
                const score = scoreForUs(posPlayer, currentCountsForCandidates);
                const have = currentCountsForCandidates[pos];
                const want = idealStarters[pos] || 0;
                let tag = 'VALUE';
                if (have < want) tag = 'NEED';
                else if (posPlayer.years_exp === 0) tag = 'UPSIDE';
                else if (posPlayer.redraft_auction_value && posPlayer.redraft_auction_value >= 15) tag = 'SAFE';
                candidatesByPos.push({ player: posPlayer, score, tag });
            });
        });
        const pickCandidates = candidatesByPos.sort((a, b) => b.score - a.score).slice(0, 8);

        pickSuggestions.push({ ...pick, suggestion, targetPos, best: best ? { player: best.player, score: best.score } : null, runnerUp: runnerUp && runnerUp.player ? { player: runnerUp.player, score: runnerUp.score } : null, insights, candidates: pickCandidates });
    }

    // Best available from draft pool (top 5 per position)
    const bestByPosition: Record<string, Player[]> = { QB: [], RB: [], WR: [], TE: [] };
    draftPool.forEach(p => {
        if (p.position && p.position in bestByPosition && bestByPosition[p.position].length < 5) {
            bestByPosition[p.position].push(p);
        }
    });

    // Scarcity from draft pool
    const scarcity: Record<string, { top5Avg: number; top15Avg: number; dropoff: number }> = {};
    (['QB', 'RB', 'WR', 'TE'] as const).forEach(pos => {
        const posPlayers = draftPool.filter(p => p.position === pos);
        const top5 = posPlayers.slice(0, 5);
        const top15 = posPlayers.slice(0, 15);
        const top5Avg = top5.reduce((s, p) => s + (p.fc_value || 0), 0) / (top5.length || 1);
        const top15Avg = top15.reduce((s, p) => s + (p.fc_value || 0), 0) / (top15.length || 1);
        const dropoff = top5Avg > 0 ? ((top5Avg - top15Avg) / top5Avg) * 100 : 0;
        scarcity[pos] = { top5Avg, top15Avg, dropoff };
    });

    // Allow user to select a player for a pick (adds to shortlist)
    const selectPlayerForPick = (pickIdx: number, player: Player) => {
        const newPicks = [...picks];
        const current = newPicks[pickIdx];
        const existing = current.targetPlayers || [];
        // Don't add duplicates
        if (!existing.includes(player.full_name)) {
            const updated = [...existing, player.full_name];
            newPicks[pickIdx] = { ...current, targetPlayer: updated[0], targetPlayers: updated, targetPosition: player.position };
        }
        setPicks(newPicks);
        setExpandedPickIdx(null); // collapse after selection
    };

    // Remove a specific player from a pick's shortlist
    const removePlayerFromPick = (pickIdx: number, playerName: string) => {
        const newPicks = [...picks];
        const current = newPicks[pickIdx];
        const updated = (current.targetPlayers || []).filter(n => n !== playerName);
        newPicks[pickIdx] = { ...current, targetPlayer: updated[0] || null, targetPlayers: updated, targetPosition: updated.length > 0 ? current.targetPosition : null };
        setPicks(newPicks);
    };

    const clearPick = (pickIdx: number) => {
        const newPicks = [...picks];
        newPicks[pickIdx] = { ...newPicks[pickIdx], targetPlayer: null, targetPlayers: [], targetPosition: null };
        setPicks(newPicks);
    };

    // Expanded pick state for search
    const [expandedPickIdx, setExpandedPickIdx] = useState<number | null>(null);
    const [pickSearchQuery, setPickSearchQuery] = useState('');

    // Monte Carlo simulation state
    const [simResult, setSimResult] = useState<SimResult | null>(null);
    const [simRunning, setSimRunning] = useState(false);
    const [simProgress, setSimProgress] = useState(0);
    const [expandedTierCell, setExpandedTierCell] = useState<string | null>(null);

    const runSimulation = () => {
        setSimRunning(true);
        setSimProgress(0);
        // Run asynchronously via setTimeout to not block UI
        setTimeout(() => {
            const result = runMonteCarloSim({
                draftPool: draftPool.map(p => ({ id: p.id, full_name: p.full_name, position: p.position, fc_value: p.fc_value, redraft_auction_value: p.redraft_auction_value })),
                userPicks: picks.map(p => ({ pickNumber: p.pickNumber, round: p.round, slot: p.slot })),
                numTeams,
                numSims: 100,
                sf,
                onProgress: (completed, total) => setSimProgress(Math.round((completed / total) * 100)),
            });
            setSimResult(result);
            setSimRunning(false);
            setSimProgress(100);
        }, 50);
    };

    // Calculate availability % — uses Monte Carlo results if available, falls back to heuristic
    const getAvailability = (player: Player, pickOverall: number): number => {
        // Try Monte Carlo first
        if (simResult) {
            const pickIdx = picks.findIndex(p => (p.pickNumber || ((p.round - 1) * numTeams + p.slot)) === pickOverall);
            if (pickIdx >= 0) {
                const mcAvail = getMonteCarloAvailability(simResult, player.id, pickIdx);
                if (mcAvail !== null) return mcAvail;
            }
        }

        // Fallback: heuristic
        // Find player's rank in the draft pool (sorted by value)
        const playerRank = draftPool.findIndex(p => p.id === player.id) + 1;
        if (playerRank === 0) return 0; // not in pool

        // Picks before this one = overall - 1
        const picksBefore = Math.max(0, pickOverall - 1);

        if (picksBefore === 0) return 100; // first pick, always available
        if (playerRank <= picksBefore * 0.5) return 5; // almost certainly gone
        if (playerRank <= picksBefore) return Math.round(20 + (playerRank / picksBefore - 0.5) * 60);
        if (playerRank <= picksBefore * 1.5) return Math.round(60 + ((playerRank - picksBefore) / (picksBefore * 0.5)) * 25);
        return Math.min(95, Math.round(75 + (playerRank - picksBefore * 1.5) / numTeams * 5));
    };

    // Search results for the expanded pick
    const searchResults = pickSearchQuery.length >= 2
        ? draftPool
            .filter(p => p.full_name.toLowerCase().includes(pickSearchQuery.toLowerCase()))
            .slice(0, 12)
        : [];

    // Calculate where a player would rank on your roster
    const getRosterFit = (player: Player) => {
        // Current kept roster + any already-selected picks
        const currentRoster: Player[] = [...keptPlayers];
        picks.forEach(pick => {
            if (pick.targetPlayer) {
                const p = draftPool.find(dp => dp.full_name === pick.targetPlayer);
                if (p) currentRoster.push(p);
            }
        });

        const pos = player.position || '';

        // Position rank by dynasty value
        const posPlayers = currentRoster.filter(p => p.position === pos);
        const posRankDynasty = posPlayers.filter(p => (p.fc_value || 0) > (player.fc_value || 0)).length + 1;

        // Position rank by auction value
        const posRankAuction = posPlayers.filter(p => (p.redraft_auction_value || 0) > (player.redraft_auction_value || 0)).length + 1;

        // Overall team rank by dynasty value
        const overallRank = currentRoster.filter(p => (p.fc_value || 0) > (player.fc_value || 0)).length + 1;
        const totalAfter = currentRoster.length + 1;

        return { pos, posRankDynasty, posRankAuction, posCount: posPlayers.length + 1, overallRank, totalAfter };
    };

    // Evaluation: analyze the planned roster as if the draft happened
    const [evaluation, setEvaluation] = useState<TeamAnalysis | null>(null);

    const evaluatePlan = () => {
        // Build the planned roster: keepers + selected/suggested picks
        const plannedPlayers: Player[] = [...keptPlayers];

        picks.forEach((pick, idx) => {
            if (pick.targetPlayer) {
                // User selected a player
                const player = draftPool.find(p => p.full_name === pick.targetPlayer);
                if (player) plannedPlayers.push(player);
            } else if (pickSuggestions[idx]?.best?.player) {
                // Use the system suggestion
                plannedPlayers.push(pickSuggestions[idx].best!.player);
            }
        });

        // Build comparison teams (other teams keep their top N)
        const compTeams = allTeams
            .filter(t => t.id !== activeTeam!.id)
            .map(t => {
                const kept = [...t.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)).slice(0, keeperCount || 10);
                return { id: t.id, name: t.name, players: kept };
            });

        // Our team with planned roster
        const ourTeam = { id: activeTeam!.id, name: activeTeam!.name || 'My Team', players: plannedPlayers };

        // Run analysis
        const results = analyzeLeaguePostDraft([ourTeam, ...compTeams], customRankingsMap);
        const myResult = results.find(r => r.teamId === activeTeam!.id) || null;
        setEvaluation(myResult);
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Roster Snapshot */}
            <div>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">Keepers by Position</h2>
                <div className="grid grid-cols-4 gap-2">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const have = keptCounts[pos];
                        const want = idealStarters[pos];
                        const isFull = have >= want;
                        const need = Math.max(0, want - have);
                        return (
                            <div key={pos} className={`rounded-lg p-2 text-center border ${
                                isFull ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/10'
                                : have === 0 ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10'
                                : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10'
                            }`}>
                                <span className={`text-xs font-bold ${posColor(pos)} px-1 rounded`}>{pos}</span>
                                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                                    {have > 0 ? `${have} kept` : '—'}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                    {isFull ? '✓ Set' : need > 0 ? `Draft ${need}` : ''}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Monte Carlo Simulation */}
            <div className="flex items-center gap-3">
                <button
                    onClick={runSimulation}
                    disabled={simRunning || draftPool.length === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        simResult && !simRunning
                            ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 ring-1 ring-green-200 dark:ring-green-800'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    } disabled:opacity-50`}
                >
                    {simRunning ? `Simulating... ${simProgress}%` : simResult ? '✓ Simulated (100 runs)' : '🎲 Run Monte Carlo (100 sims)'}
                </button>
                {simRunning && (
                    <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${simProgress}%` }} />
                    </div>
                )}
                {simResult && !simRunning && (
                    <span className="text-[10px] text-zinc-500">Availability % now based on simulated data</span>
                )}
            </div>

            {/* Position Scarcity Chart (same as mock/live draft) */}
            <PositionScarcityChart
                players={draftPool}
                format={format}
                onPlayerClick={() => {}}
                customRankingsMap={customRankingsMap}
                title="Draft Pool Scarcity"
                defaultCollapsed={false}
            />

            {/* Watchlist: starred players with availability across all picks */}
            {watchlist.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        Watchlist
                    </h2>
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                        <th className="text-left px-2 py-1.5 font-medium text-zinc-500 w-8"></th>
                                        <th className="text-left px-2 py-1.5 font-medium text-zinc-500">Player</th>
                                        {picks.slice(0, keeperCount || picks.length).map((p, i) => (
                                            <th key={i} className="text-center px-1.5 py-1.5 font-medium text-zinc-400 whitespace-nowrap">
                                                {p.round}.{String(p.slot).padStart(2, '0')}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {watchlist.map(playerId => {
                                        const player = draftPool.find(p => p.id === playerId);
                                        if (!player) return null;
                                        return (
                                            <tr key={playerId} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                                <td className="px-2 py-1.5">
                                                    <button onClick={() => toggleWatchlist(playerId)} className="p-0.5">
                                                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                                    </button>
                                                </td>
                                                <td className="px-2 py-1.5 whitespace-nowrap">
                                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded mr-1 ${posColor(player.position)}`}>{player.position}</span>
                                                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{player.full_name}</span>
                                                </td>
                                                {picks.slice(0, keeperCount || picks.length).map((pick, i) => {
                                                    const pickOverall = pick.pickNumber || ((pick.round - 1) * numTeams + pick.slot);
                                                    const avail = getAvailability(player, pickOverall);
                                                    return (
                                                        <td key={i} className="text-center px-1.5 py-1.5">
                                                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                                                                avail >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                                : avail >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                            }`}>{avail}%</span>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tier Availability Grid — where do tiers dry up? */}
            <div>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Tier Availability by Pick
                    <span className="ml-2 text-[10px] font-normal text-zinc-400">({tierSource === 'redraft' ? 'Redraft $' : tierSource === 'zap' ? 'ZAP' : 'Dynasty'})</span>
                </h2>
                <p className="text-[10px] text-zinc-400 mb-3">Shows the best tier likely available at each of your picks. Tap a cell to see who&apos;s there.</p>
                {(() => {
                    return (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                        <th className="text-left px-2 py-1.5 font-medium text-zinc-500">Position</th>
                                        {picks.map((p, i) => (
                                            <th key={i} className="text-center px-2 py-1.5 font-medium text-zinc-400 whitespace-nowrap">
                                                {p.round}.{String(p.slot).padStart(2, '0')}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                                        // Value function based on tier source
                                        const getVal = (p: Player): number => {
                                            if (tierSource === 'redraft') return p.redraft_auction_value || 0;
                                            return p.fc_value || 0;
                                        };

                                        const tierByPick = picks.map((pick, pickIdx) => {
                                            const overallPick = pick.pickNumber || ((pick.round - 1) * numTeams + pick.slot);
                                            const posPlayers = draftPool.filter(p => p.position === pos);

                                            if (simResult) {
                                                const available = posPlayers
                                                    .map(p => {
                                                        const counts = simResult.availability.get(p.id);
                                                        const prob = counts ? Math.round((counts[pickIdx] / simResult.totalSims) * 100) : 0;
                                                        return { ...p, prob };
                                                    })
                                                    .filter(p => p.prob >= 50)
                                                    .sort((a, b) => getVal(b) - getVal(a));
                                                const bestVal = available[0] ? getVal(available[0]) : 0;
                                                const inTier = available.filter(p => getVal(p) >= bestVal * 0.65);
                                                return { bestVal, count: inTier.length, players: inTier.slice(0, 5).map(p => ({ name: p.full_name, value: getVal(p), prob: p.prob })) };
                                            } else {
                                                const demandFactor = pos === 'RB' ? 0.30 : pos === 'WR' ? 0.35 : pos === 'QB' ? (sf ? 0.18 : 0.10) : 0.10;
                                                const estimatedGone = Math.floor(overallPick * demandFactor);
                                                const remaining = posPlayers.slice(estimatedGone);
                                                const bestVal = remaining[0] ? getVal(remaining[0]) : 0;
                                                const inTier = remaining.filter(p => getVal(p) >= bestVal * 0.65);
                                                return { bestVal, count: inTier.length, players: inTier.slice(0, 5).map(p => ({ name: p.full_name, value: getVal(p), prob: null as number | null })) };
                                            }
                                        });

                                        // Tier labels/colors adapt to the value scale
                                        const getTierLabel = (val: number): string => {
                                            if (tierSource === 'redraft') {
                                                // Auction values: $30+ elite, $20+ solid, $10+ startable
                                                if (val >= 30) return 'Elite';
                                                if (val >= 20) return 'Start';
                                                if (val >= 12) return 'Flex';
                                                if (val >= 5) return 'Bench';
                                                if (val >= 1) return 'Deep';
                                                return '—';
                                            }
                                            if (val >= 5000) return 'T1-3';
                                            if (val >= 3500) return 'T4-6';
                                            if (val >= 2500) return 'T7-9';
                                            if (val >= 1500) return 'T10-12';
                                            if (val >= 800) return 'T13+';
                                            return '—';
                                        };

                                        const getTierColor = (val: number): string => {
                                            if (tierSource === 'redraft') {
                                                if (val >= 30) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
                                                if (val >= 20) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
                                                if (val >= 12) return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
                                                if (val >= 5) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
                                                if (val >= 1) return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500';
                                                return 'text-zinc-300 dark:text-zinc-600';
                                            }
                                            if (val >= 5000) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
                                            if (val >= 3500) return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
                                            if (val >= 2500) return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
                                            if (val >= 1500) return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
                                            if (val >= 800) return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500';
                                            return 'text-zinc-300 dark:text-zinc-600';
                                        };

                                        return (
                                            <tr key={pos} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                                                <td className={`px-2 py-1.5 font-bold text-[10px] ${posColor(pos)}`}>{pos}</td>
                                                {tierByPick.map((tier, i) => {
                                                    const prevTier = i > 0 ? tierByPick[i - 1] : null;
                                                    const isCliff = prevTier && prevTier.bestVal >= 2500 && tier.bestVal < prevTier.bestVal * 0.65;
                                                    const isLastChance = tier.count <= 2 && tier.bestVal >= 1500;
                                                    const cellKey = `${pos}-${i}`;
                                                    const isExpanded = expandedTierCell === cellKey;

                                                    return (
                                                        <td key={i} className="text-center px-1 py-1.5 relative">
                                                            <button
                                                                onClick={() => setExpandedTierCell(isExpanded ? null : cellKey)}
                                                                className="w-full"
                                                            >
                                                                <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${getTierColor(tier.bestVal)}`}>
                                                                    {getTierLabel(tier.bestVal)}
                                                                    {(isCliff || isLastChance) && <span title="Cliff — tier dries up after this">⚠</span>}
                                                                </div>
                                                                <div className="text-[8px] text-zinc-400 mt-0.5">{tier.count} left</div>
                                                            </button>
                                                            {isExpanded && tier.players.length > 0 && (
                                                                <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-2 text-left">
                                                                    {tier.players.map((p, j) => (
                                                                        <div key={j} className="flex items-center justify-between text-[10px] py-0.5">
                                                                            <span className="text-zinc-900 dark:text-zinc-100 truncate">{p.name}</span>
                                                                            <span className="flex items-center gap-1 flex-shrink-0 ml-1">
                                                                                <span className="font-mono text-zinc-500">{p.value.toLocaleString()}</span>
                                                                                {p.prob !== null && (
                                                                                    <span className={`text-[8px] font-bold ${p.prob >= 70 ? 'text-green-600' : p.prob >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{p.prob}%</span>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}
            </div>

            {/* Draft Board - each pick with suggestion */}
            <div>
                <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Your Picks</h2>
                <div className="space-y-3">
                    {pickSuggestions.map((pick, idx) => {
                        const userSelections = picks[idx]?.targetPlayers || [];
                        const userSelection = picks[idx]?.targetPlayer;
                        const hasOverride = userSelections.length > 0;
                        const isExpanded = expandedPickIdx === idx;
                        const pickOverall = pick.pickNumber || ((pick.round - 1) * numTeams + pick.slot);

                        return (
                            <div key={idx} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                {/* Pick row - clickable to expand */}
                                <button
                                    onClick={() => setExpandedPickIdx(isExpanded ? null : idx)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors text-left"
                                >
                                    <span className="text-xs font-bold text-zinc-400 w-10 flex-shrink-0">
                                        {pick.round}.{String(pick.slot).padStart(2, '0')}
                                    </span>

                                    {hasOverride ? (
                                        <>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(picks[idx].targetPosition)}`}>
                                                {picks[idx].targetPosition}
                                            </span>
                                            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex-1 truncate">
                                                {userSelections.length === 1 ? userSelections[0] : `${userSelections.length} targets`}
                                            </span>
                                            {(() => {
                                                // Show best availability across all selections
                                                const avails = userSelections.map(name => {
                                                    const p = draftPool.find(dp => dp.full_name === name);
                                                    return p ? getAvailability(p, pickOverall) : 0;
                                                });
                                                const bestAvail = Math.max(...avails, 0);
                                                if (bestAvail === 0) return null;
                                                return (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                                        bestAvail >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                        : bestAvail >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                    }`}>{bestAvail}%</span>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(pick.targetPos === 'BPA' ? null : pick.targetPos)}`}>
                                                {pick.targetPos}
                                            </span>
                                            <span className="text-sm text-zinc-600 dark:text-zinc-400 flex-1 truncate italic">
                                                {pick.suggestion}
                                            </span>
                                            {pick.best && (() => {
                                                const avail = getAvailability(pick.best!.player, pickOverall);
                                                return (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                                        avail >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                        : avail >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                    }`}>{avail}%</span>
                                                );
                                            })()}
                                        </>
                                    )}
                                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Expanded: candidates + search */}
                                {isExpanded && (
                                    <div className="border-t border-zinc-100 dark:border-zinc-800 px-3 py-3 space-y-3">
                                        {/* Your selections */}
                                        {hasOverride && (
                                            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                                                {userSelections.map(name => (
                                                    <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs">
                                                        {name}
                                                        <button onClick={() => removePlayerFromPick(idx, name)} className="text-indigo-400 hover:text-red-500">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                                <button onClick={() => clearPick(idx)} className="text-[10px] text-zinc-400 hover:text-red-500 self-center ml-1">Clear</button>
                                            </div>
                                        )}

                                        {/* Simple ranked list — 30 players around this pick's range */}
                                        <div className="space-y-0.5 max-h-72 overflow-y-auto">
                                            {(() => {
                                                // Show players ranked around this pick position
                                                const pickPosition = pick.pickNumber || ((pick.round - 1) * numTeams + pick.slot);
                                                const startIdx = Math.max(0, pickPosition - 30);
                                                const endIdx = Math.min(draftPool.length, pickPosition + 30);
                                                const playersInRange = draftPool.slice(startIdx, endIdx);
                                                return playersInRange.map((player, i) => {
                                                    const avail = getAvailability(player, pickOverall);
                                                    return (
                                                        <button
                                                            key={player.id}
                                                            onClick={() => selectPlayerForPick(idx, player)}
                                                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs"
                                                        >
                                                            <span className="text-zinc-400 font-mono w-4">{startIdx + i + 1}</span>
                                                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${posColor(player.position)}`}>{player.position}</span>
                                                            <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{player.full_name}</span>
                                                            <span className="font-mono text-zinc-500 text-[10px]">{(player.fc_value || 0).toLocaleString()}</span>
                                                            {player.redraft_auction_value ? <span className="font-mono text-amber-600 text-[10px]">${player.redraft_auction_value}</span> : null}
                                                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${avail >= 80 ? 'bg-green-100 dark:bg-green-900/20 text-green-600' : avail >= 50 ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600' : 'bg-red-100 dark:bg-red-900/20 text-red-500'}`}>{avail}%</span>
                                                        </button>
                                                    );
                                                });
                                            })()}
                                        </div>

                                        {/* Player search */}
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Search draft pool..."
                                                value={pickSearchQuery}
                                                onChange={(e) => setPickSearchQuery(e.target.value)}
                                                className="w-full px-3 py-2 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                                                autoFocus
                                            />
                                            {searchResults.length > 0 && (
                                                <div className="mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg max-h-64 overflow-y-auto">
                                                    {searchResults.map(p => {
                                                        const availability = getAvailability(p, pickOverall);
                                                        const fit = getRosterFit(p);
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                onClick={() => {
                                                                    selectPlayerForPick(idx, p);
                                                                    setPickSearchQuery('');
                                                                }}
                                                                className="w-full flex flex-col px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                                                            >
                                                                <div className="flex items-center gap-2 w-full">
                                                                    <span
                                                                        onClick={(e) => { e.stopPropagation(); toggleWatchlist(p.id); }}
                                                                        className="flex-shrink-0 p-0.5 cursor-pointer"
                                                                    >
                                                                        <Star className={`w-3.5 h-3.5 ${watchlist.includes(p.id) ? 'fill-amber-400 text-amber-400' : 'text-zinc-300 dark:text-zinc-600'}`} />
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${posColor(p.position)}`}>
                                                                        {p.position}
                                                                    </span>
                                                                    <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{p.full_name}</span>
                                                                    <span className="text-xs font-mono text-zinc-500 tabular-nums">
                                                                        {(p.fc_value || 0).toLocaleString()}
                                                                    </span>
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                                        availability >= 80 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                                        : availability >= 50 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                                    }`}>
                                                                        {availability}%
                                                                    </span>
                                                                </div>
                                                                {/* Roster fit */}
                                                                <div className="flex items-center gap-3 mt-1 ml-7 text-[10px] text-zinc-500">
                                                                    <span>Dynasty: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fit.pos}{fit.posRankDynasty}</span> of {fit.posCount}</span>
                                                                    {p.redraft_auction_value ? (
                                                                        <span>Auction: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fit.pos}{fit.posRankAuction}</span> (${p.redraft_auction_value})</span>
                                                                    ) : null}
                                                                    <span>Team: <span className="font-medium text-zinc-700 dark:text-zinc-300">#{fit.overallRank}</span>/{fit.totalAfter}</span>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Top Targets by Position (collapsible) */}
            <details className="group">
                <summary className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 cursor-pointer list-none flex items-center gap-1">
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    Top Targets
                </summary>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => (
                        <div key={pos} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            <div className={`px-2 py-1 text-[10px] font-bold ${posColor(pos)}`}>{pos}</div>
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {bestByPosition[pos].slice(0, 3).map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-1.5 px-2 py-1.5">
                                        <span className="text-[10px] font-mono text-zinc-400">{i + 1}</span>
                                        <span className="text-xs text-zinc-900 dark:text-zinc-100 flex-1 truncate">{p.full_name}</span>
                                        <span className="text-[10px] font-mono text-zinc-500">{(p.fc_value || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </details>

            {/* Projected Roster — full team composition based on keepers + picks (collapsible) */}
            <details className="group">
                <summary className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3 cursor-pointer list-none flex items-center gap-1">
                    <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                    Projected Roster
                </summary>
                {(() => {
                    // Build projected roster: keepers + selected/suggested picks
                    const projectedRoster: Player[] = [...keptPlayers];
                    picks.forEach((pick, idx) => {
                        if (pick.targetPlayer) {
                            const player = draftPool.find(p => p.full_name === pick.targetPlayer);
                            if (player) projectedRoster.push(player);
                        } else if (pickSuggestions[idx]?.best?.player) {
                            projectedRoster.push(pickSuggestions[idx].best!.player);
                        }
                    });

                    const groups: { pos: string; players: Player[] }[] = [
                        { pos: 'QB', players: projectedRoster.filter(p => p.position === 'QB').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)) },
                        { pos: 'RB', players: projectedRoster.filter(p => p.position === 'RB').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)) },
                        { pos: 'WR', players: projectedRoster.filter(p => p.position === 'WR').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)) },
                        { pos: 'TE', players: projectedRoster.filter(p => p.position === 'TE').sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0)) },
                        { pos: 'DEF', players: projectedRoster.filter(p => p.position === 'DEF') },
                    ];

                    const keptIds = new Set(keeperIds);
                    const draftedNames = new Set(picks.filter(p => p.targetPlayer).map(p => p.targetPlayer));
                    const suggestedNames = new Set(picks.filter((p, i) => !p.targetPlayer && pickSuggestions[i]?.best?.player).map((_, i) => pickSuggestions[i]?.best?.player.full_name));

                    return (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                            {groups.filter(g => g.players.length > 0).map(group => (
                                <div key={group.pos} className="px-3 py-2.5">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${posColor(group.pos)}`}>{group.pos}</span>
                                        <span className="text-[10px] text-zinc-400">{group.players.length} players</span>
                                        <span className="text-[10px] font-mono text-zinc-500 ml-auto">
                                            {group.players.reduce((s, p) => s + (p.fc_value || 0), 0).toLocaleString()} total
                                        </span>
                                    </div>
                                    <div className="space-y-0.5">
                                        {group.players.map(p => {
                                            const isKept = keptIds.has(p.id);
                                            const isDrafted = draftedNames.has(p.full_name);
                                            const isSuggested = suggestedNames.has(p.full_name);
                                            return (
                                                <div key={p.id} className={`flex items-center gap-2 text-xs py-0.5 px-1 rounded ${
                                                    isDrafted ? 'bg-indigo-50 dark:bg-indigo-900/10' : isSuggested ? 'bg-zinc-50 dark:bg-zinc-800/30 italic' : ''
                                                }`}>
                                                    <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">
                                                        {p.full_name}
                                                    </span>
                                                    <span className="text-[9px] text-zinc-400">
                                                        {isKept ? 'KEPT' : isDrafted ? 'PICK' : isSuggested ? 'PROJ' : ''}
                                                    </span>
                                                    <span className="font-mono text-zinc-500 w-12 text-right text-[10px]">{(p.fc_value || 0).toLocaleString()}</span>
                                                    <span className="font-mono text-amber-600 dark:text-amber-400 w-8 text-right text-[10px]">{p.redraft_auction_value ? `$${p.redraft_auction_value}` : '—'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </details>

            {/* Evaluate Draft Plan */}
            <div>
                <button
                    onClick={evaluatePlan}
                    className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
                >
                    Evaluate Draft Plan
                </button>

                {evaluation && (
                    <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                        {/* Overall Grade */}
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Draft Grade</h3>
                                <p className="text-xs text-zinc-500 mt-0.5">Rank #{evaluation.powerRank} of {allTeams.length} teams</p>
                            </div>
                            <div className={`text-3xl font-bold ${
                                evaluation.overallGrade.startsWith('A') ? 'text-green-600 dark:text-green-400'
                                : evaluation.overallGrade.startsWith('B') ? 'text-blue-600 dark:text-blue-400'
                                : evaluation.overallGrade.startsWith('C') ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                                {evaluation.overallGrade}
                            </div>
                        </div>

                        {/* Position Grades */}
                        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {evaluation.positionGrades.map(pg => (
                                    <div key={pg.position} className="text-center">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(pg.position)}`}>{pg.position}</span>
                                        <div className={`text-lg font-bold mt-1 ${
                                            pg.grade.startsWith('A') ? 'text-green-600 dark:text-green-400'
                                            : pg.grade.startsWith('B') ? 'text-blue-600 dark:text-blue-400'
                                            : pg.grade.startsWith('C') ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-red-600 dark:text-red-400'
                                        }`}>{pg.grade}</div>
                                        <div className="text-[10px] text-zinc-500 mt-0.5">{pg.tierBreakdown}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">{evaluation.summary}</p>
                        </div>

                        {/* Strengths & Weaknesses */}
                        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {evaluation.strengths.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase mb-1.5">Strengths</h4>
                                    <ul className="space-y-1">
                                        {evaluation.strengths.map((s, i) => (
                                            <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                                                <span className="text-green-500 mt-0.5">+</span> {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {evaluation.weaknesses.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase mb-1.5">Weaknesses</h4>
                                    <ul className="space-y-1">
                                        {evaluation.weaknesses.map((w, i) => (
                                            <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                                                <span className="text-red-500 mt-0.5">−</span> {w}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Market Score */}
                        {evaluation.marketScoreAvg !== null && (
                            <div className="px-4 pb-4 flex items-center gap-3 text-xs text-zinc-500">
                                <span>Avg Market Score: <span className={`font-bold ${evaluation.marketScoreAvg >= 65 ? 'text-green-600' : evaluation.marketScoreAvg >= 50 ? 'text-zinc-700 dark:text-zinc-300' : 'text-red-500'}`}>{evaluation.marketScoreAvg.toFixed(1)}</span></span>
                                <span>·</span>
                                <span>Elite players (T1-5): <span className="font-bold text-zinc-700 dark:text-zinc-300">{evaluation.eliteCount}</span></span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Plan Results Section (compare mock draft outcomes across plans) ---

function PlanResultsSection({ leagueId, plans }: { leagueId: string; plans: SavedPlan[] }) {
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { sleeperUsername, fleaflickerUsername } = useAuth();
    const userId = sleeperUsername || fleaflickerUsername;

    useEffect(() => {
        if (!userId) { setLoading(false); return; }
        fetch(`/api/draft-history?leagueId=${leagueId}&userId=${userId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (Array.isArray(data)) setResults(data); })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [leagueId, userId]);

    if (loading) return <div className="p-6 text-center text-zinc-400">Loading results...</div>;
    if (results.length === 0) return (
        <div className="p-6 text-center text-zinc-400">
            <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No mock draft results yet.</p>
            <p className="text-xs mt-1">Run mock drafts with different plans to compare outcomes.</p>
        </div>
    );

    // Group results by plan
    const byPlan = new Map<string, { name: string; drafts: any[] }>();
    byPlan.set('unlinked', { name: 'No Plan', drafts: [] });
    plans.forEach(p => byPlan.set(p.id, { name: p.name, drafts: [] }));

    results.forEach(r => {
        const planId = r.plan_id || 'unlinked';
        const group = byPlan.get(planId);
        if (group) group.drafts.push(r);
        else byPlan.get('unlinked')!.drafts.push(r);
    });

    // Calculate averages per plan
    const planStats = Array.from(byPlan.entries())
        .filter(([, v]) => v.drafts.length > 0)
        .map(([id, { name, drafts }]) => {
            const grades = drafts.map(d => d.draft_data?.grade || '').filter(Boolean);
            const gradeToNum = (g: string) => {
                const map: Record<string, number> = { 'A+': 97, 'A': 93, 'A-': 90, 'B+': 87, 'B': 83, 'B-': 80, 'C+': 77, 'C': 73, 'C-': 70, 'D': 60, 'F': 50 };
                return map[g] || 75;
            };
            const avgGradeNum = grades.length > 0 ? grades.reduce((s, g) => s + gradeToNum(g), 0) / grades.length : 0;
            const numToGrade = (n: number) => n >= 95 ? 'A+' : n >= 91 ? 'A' : n >= 88 ? 'A-' : n >= 85 ? 'B+' : n >= 81 ? 'B' : n >= 78 ? 'B-' : n >= 75 ? 'C+' : n >= 71 ? 'C' : 'C-';
            
            return { id, name, count: drafts.length, avgGrade: numToGrade(avgGradeNum), avgGradeNum, drafts };
        })
        .sort((a, b) => b.avgGradeNum - a.avgGradeNum);

    return (
        <div className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Mock Draft Results by Plan</h2>
            <p className="text-sm text-zinc-500">Compare outcomes across different draft strategies.</p>

            <div className="space-y-3">
                {planStats.map(plan => (
                    <div key={plan.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50">
                            <div>
                                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{plan.name}</span>
                                <span className="text-xs text-zinc-500 ml-2">{plan.count} draft{plan.count !== 1 ? 's' : ''}</span>
                            </div>
                            <span className={`text-xl font-bold ${
                                plan.avgGrade.startsWith('A') ? 'text-green-600 dark:text-green-400'
                                : plan.avgGrade.startsWith('B') ? 'text-blue-600 dark:text-blue-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}>
                                {plan.avgGrade}
                            </span>
                        </div>
                        <div className="px-4 py-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                            {plan.drafts.slice(0, 5).map((d: any, i: number) => (
                                <div key={d.id || i} className="flex items-center justify-between py-1.5 text-xs">
                                    <span className="text-zinc-500">{new Date(d.created_at).toLocaleDateString()}</span>
                                    <span className={`font-bold ${
                                        d.draft_data?.grade?.startsWith('A') ? 'text-green-600'
                                        : d.draft_data?.grade?.startsWith('B') ? 'text-blue-600'
                                        : 'text-amber-600'
                                    }`}>{d.draft_data?.grade || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NotesSection({
    notes,
    setNotes,
}: {
    notes: string;
    setNotes: (notes: string) => void;
}) {
    return (
        <div className="p-4 sm:p-6">
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Draft Notes</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Strategy notes, tier breaks, sleeper picks, etc.
                </p>
            </div>
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Draft strategy notes...&#10;&#10;Example:&#10;- Target RB in rounds 1-2 if top 5 available&#10;- Avoid QB before round 3 unless elite falls&#10;- Sleeper: Player X in round 4+"
                rows={12}
                className="w-full px-4 py-3 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
        </div>
    );
}

// --- Keeper Selection Section (interactive, like mock draft) ---

function KeeperSelectionSection({
    players,
    keeperIds,
    setKeeperIds,
    keeperCount,
    format,
    leagueId,
    posColor,
}: {
    players: Player[];
    keeperIds: string[];
    setKeeperIds: (ids: string[]) => void;
    keeperCount: number;
    format: '1qb' | 'sf';
    leagueId: string;
    posColor: (pos: string | null) => string;
}) {
    const [dynastyWeight, setDynastyWeight] = useState(() => {
        if (typeof window === 'undefined') return 60;
        try {
            const saved = localStorage.getItem(`vff_keeper_weight_${leagueId}`);
            return saved ? parseInt(saved) : 60;
        } catch { return 60; }
    });

    const redraftWeight = 100 - dynastyWeight;

    const handleWeightChange = (val: number) => {
        setDynastyWeight(val);
        try { localStorage.setItem(`vff_keeper_weight_${leagueId}`, String(val)); } catch {}
    };

    // Effective value for sorting (blends dynasty + redraft)
    const getEffectiveValue = (p: Player) => {
        const dynVal = p.fc_value || 0;
        const rdRank = p.redraft_rank_overall;
        // Normalize redraft rank to a comparable scale (lower rank = higher value)
        const rdVal = rdRank ? Math.max(0, 10000 - (rdRank * 50)) : 0;
        return (dynVal * (dynastyWeight / 100)) + (rdVal * (redraftWeight / 100));
    };

    // Sort players by effective value
    const sortedPlayers = [...players].sort((a, b) => getEffectiveValue(b) - getEffectiveValue(a));

    const toggleKeeper = (id: string) => {
        if (keeperIds.includes(id)) {
            setKeeperIds(keeperIds.filter(k => k !== id));
        } else {
            if (keeperIds.length >= keeperCount) return;
            setKeeperIds([...keeperIds, id]);
        }
    };

    // Auto-select top N on first load if nothing selected
    useEffect(() => {
        if (keeperIds.length === 0 && sortedPlayers.length > 0) {
            const topIds = sortedPlayers.slice(0, keeperCount).map(p => p.id);
            setKeeperIds(topIds);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const keeperValue = players
        .filter(p => keeperIds.includes(p.id))
        .reduce((sum, p) => sum + (p.fc_value || 0), 0);

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Select Your Keepers</h2>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Click players to select/deselect. Your picks carry into mock draft.
                    </p>
                </div>
                <div className={`font-bold text-lg tabular-nums ${
                    keeperIds.length === keeperCount
                        ? 'text-green-600 dark:text-green-400'
                        : keeperIds.length > keeperCount
                            ? 'text-red-500'
                            : 'text-amber-500'
                }`}>
                    {keeperIds.length} / {keeperCount}
                </div>
            </div>

            {/* Dynasty/Redraft weight slider */}
            <div className="mb-5 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-purple-500 uppercase">Dynasty</span>
                    <span className="text-[10px] font-bold text-zinc-400">
                        {redraftWeight === 0 ? 'Pure Dynasty' : redraftWeight === 100 ? 'Pure Redraft' : `${dynastyWeight}% Dyn / ${redraftWeight}% RD`}
                    </span>
                    <span className="text-[10px] font-bold text-amber-500 uppercase">Redraft</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={dynastyWeight}
                    onChange={e => handleWeightChange(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-purple-500 via-zinc-400 to-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500"
                />
            </div>

            {/* Keeper value summary */}
            {keeperIds.length > 0 && (
                <div className="mb-4 text-xs text-zinc-500">
                    Keeper value: <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{keeperValue.toLocaleString()}</span>
                </div>
            )}

            {/* Player cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedPlayers.map((player, idx) => {
                    const isSelected = keeperIds.includes(player.id);
                    const isAtLimit = keeperIds.length >= keeperCount && !isSelected;

                    return (
                        <button
                            key={player.id}
                            onClick={() => toggleKeeper(player.id)}
                            disabled={isAtLimit}
                            className={`p-3 text-left border-2 rounded-lg transition-all ${
                                isSelected
                                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/20'
                                    : isAtLimit
                                        ? 'border-zinc-200 dark:border-zinc-700 opacity-40 cursor-not-allowed'
                                        : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                            }`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                    {player.full_name}
                                </div>
                                <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                    {(player.fc_value || 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${posColor(player.position)}`}>
                                    {player.position}
                                </span>
                                <span className="text-xs text-zinc-500">{player.team || 'FA'}</span>
                                {player.years_exp != null && (
                                    <span className="text-xs text-zinc-400">· Yr {player.years_exp}</span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-zinc-500">
                                {player.rank_overall && <span>VFF #{player.rank_overall}</span>}
                                {player.redraft_rank_overall && (
                                    <span className="text-amber-600 dark:text-amber-400">RD #{player.redraft_rank_overall}</span>
                                )}
                                {player.rank_tier && <span>Tier {player.rank_tier}</span>}
                                {player.zap_category && (
                                    <span className="text-emerald-600 dark:text-emerald-400">{player.zap_category}</span>
                                )}
                            </div>
                            {/* Keeper line indicator */}
                            {idx === keeperCount - 1 && !isSelected && (
                                <div className="mt-2 text-[9px] text-amber-600 dark:text-amber-400 font-medium">
                                    ── keeper line ──
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
