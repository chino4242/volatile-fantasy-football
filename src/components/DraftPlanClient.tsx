'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Target, Users, ClipboardList, StickyNote, ChevronDown, Check, X } from 'lucide-react';

// --- Types ---

interface Player {
    id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    fc_value: number | null;
    rank_overall?: number | null;
    rank_tier?: number | null;
    years_exp?: number | null;
    redraft_rank_overall?: number | null;
    redraft_auction_value?: number | null;
    rank_sf_tier?: number | null;
    rank_1qb_tier?: number | null;
    zap_category?: string | null;
    zap_score?: number | null;
    zap_stale?: boolean;
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    rank_sf_overall?: number | null;
    rank_1qb_overall?: number | null;
}

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
    targetPlayer: string | null; // player name
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
}

// --- Component ---

export function DraftPlanClient({
    leagueId,
    platform,
    format,
    myTeam,
    allTeams,
    freeAgents,
    keeperCount,
    customRankingsMap,
}: DraftPlanClientProps) {
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
    const [activeSection, setActiveSection] = useState<'keepers' | 'suggestions' | 'picks' | 'notes'>('keepers');

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

    // Load existing plan (picks are NOT loaded — always computed fresh from draft board)
    useEffect(() => {
        async function loadPlan() {
            try {
                const res = await fetch(`/api/draft-plans?league_id=${leagueId}`);
                if (res.ok) {
                    const { plan } = await res.json();
                    if (plan) {
                        setKeeperIds(JSON.parse(plan.keeper_ids || '[]'));
                        setRosterTargets(JSON.parse(plan.roster_targets || '{}'));
                        setTierSource(plan.tier_source || 'dynasty');
                        setNotes(plan.notes || '');
                    }
                }
            } catch (e) {
                console.error('Failed to load draft plan:', e);
            } finally {
                setLoading(false);
            }
        }
        loadPlan();
    }, [leagueId]);

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
                    notes: '',
                })));
            }
        }
    }, [loading, activeTeam, keeperCount]);

    // Save plan
    const savePlan = useCallback(async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/draft-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    league_id: leagueId,
                    platform,
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
            }
        } catch (e) {
            console.error('Failed to save draft plan:', e);
        } finally {
            setSaving(false);
        }
    }, [leagueId, platform, keeperIds, rosterTargets, picks, tierSource, notes]);

    // Position color helper
    const posColor = (pos: string | null) => {
        switch (pos) {
            case 'QB': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
            case 'RB': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20';
            case 'WR': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
            case 'TE': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20';
            default: return 'text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800';
        }
    };

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="animate-pulse text-zinc-400">Loading draft plan...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
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
                    { key: 'suggestions' as const, label: 'Suggestions', icon: Target },
                    { key: 'picks' as const, label: 'Pick Plan', icon: ClipboardList },
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
                {activeSection === 'suggestions' && (
                    <DraftSuggestionsSection
                        activeTeam={activeTeam}
                        keeperIds={keeperIds}
                        freeAgents={freeAgents}
                        picks={picks}
                        format={format}
                        numTeams={allTeams.length}
                        allTeams={allTeams}
                        keeperCount={keeperCount}
                        customRankingsMap={customRankingsMap}
                        posColor={posColor}
                    />
                )}
                {activeSection === 'picks' && (
                    <PickPlanSection
                        picks={picks}
                        setPicks={setPicks}
                        freeAgents={freeAgents}
                        posColor={posColor}
                    />
                )}
                {activeSection === 'notes' && (
                    <NotesSection notes={notes} setNotes={setNotes} />
                )}
            </div>
        </div>
    );
}

// --- Draft Suggestions Section ---

function DraftSuggestionsSection({
    activeTeam,
    keeperIds,
    freeAgents,
    picks,
    format,
    numTeams,
    allTeams,
    keeperCount,
    customRankingsMap,
    posColor,
}: {
    activeTeam: TeamData | null;
    keeperIds: string[];
    freeAgents: Player[];
    picks: PickPlanEntry[];
    format: '1qb' | 'sf';
    numTeams: number;
    allTeams: TeamData[];
    keeperCount?: number;
    customRankingsMap?: Record<string, { rank: number | null; signal: string | null; notes: string | null; source: string; marketScore: number | null; tier: number | null }[]>;
    posColor: (pos: string | null) => string;
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
    // Simulate keeper cuts: other teams keep their top N, dropped players enter the pool
    const droppedPlayers: Player[] = [];
    if (keeperCount && keeperCount > 0) {
        allTeams.forEach(team => {
            if (team.id === activeTeam.id) return; // skip our team
            const sorted = [...team.players].sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
            const dropped = sorted.slice(keeperCount);
            droppedPlayers.push(...dropped);
        });
    }

    // Draft pool = free agents + dropped players from other teams, sorted by value
    const draftPool = [...freeAgents, ...droppedPlayers]
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));

    // === ANALYZE KEPT ROSTER ===
    const keptPlayers = activeTeam.players.filter(p => keeperIds.includes(p.id));
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

        const score = valueWithProspect * needMultiplier;
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
    const pickSuggestions: (typeof picks[number] & { suggestion: string; targetPos: string })[] = [];

    // For each of our picks, simulate all picks before it, then pick for us
    let lastOverall = 0;
    for (const pick of picks) {
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

        pickSuggestions.push({ ...pick, suggestion, targetPos });
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

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Roster Snapshot */}
            <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Roster After Keepers</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const have = keptCounts[pos];
                        const want = idealStarters[pos];
                        const isFull = have >= want;
                        return (
                            <div key={pos} className={`rounded-lg p-3 border ${
                                isFull
                                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20'
                                    : have === 0
                                        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                                        : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(pos)}`}>{pos}</span>
                                    <span className="text-xs font-mono text-zinc-500">{have}/{want}</span>
                                </div>
                                <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                                    {keptValues[pos].toLocaleString()}
                                </div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                    {isFull ? '✓ Set' : have === 0 ? '⚠ Empty' : `Need ${want - have} more`}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Positional Needs */}
            {needs.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Draft Priorities</h2>
                    <div className="space-y-2">
                        {needs.map((need, idx) => (
                            <div key={need.pos} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                                <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                                    need.urgency === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                    : need.urgency === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                    : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                                }`}>
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(need.pos)}`}>{need.pos}</span>
                                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {need.gap > 0 ? `Draft ${need.gap}` : 'Upgrade target'}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                            need.urgency === 'high' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                            : need.urgency === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                            : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                                        }`}>
                                            {need.urgency}
                                        </span>
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-0.5">{need.reason}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Scarcity Alert */}
            <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Position Scarcity</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const s = scarcity[pos];
                        const isScarce = s.dropoff > 40;
                        return (
                            <div key={pos} className="rounded-lg p-3 bg-zinc-50 dark:bg-zinc-800/50">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${posColor(pos)}`}>{pos}</span>
                                    {isScarce && <span className="text-[9px] font-bold text-red-500">SCARCE</span>}
                                </div>
                                <div className="text-xs text-zinc-500">
                                    Top 5 avg: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{Math.round(s.top5Avg).toLocaleString()}</span>
                                </div>
                                <div className="text-xs text-zinc-500">
                                    Top 15 avg: <span className="font-mono text-zinc-600 dark:text-zinc-400">{Math.round(s.top15Avg).toLocaleString()}</span>
                                </div>
                                <div className={`text-[10px] font-medium mt-1 ${s.dropoff > 40 ? 'text-red-500' : s.dropoff > 25 ? 'text-amber-500' : 'text-green-600'}`}>
                                    {Math.round(s.dropoff)}% value drop
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Round-by-Round Strategy */}
            {pickSuggestions.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Pick-by-Pick Strategy</h2>
                    <div className="space-y-2">
                        {pickSuggestions.map((pick, idx) => (
                            <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700">
                                <span className="text-xs font-bold text-zinc-400 w-12 flex-shrink-0">
                                    {pick.round}.{String(pick.slot).padStart(2, '0')}
                                </span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${posColor(pick.targetPos === 'BPA' ? null : pick.targetPos)}`}>
                                    {pick.targetPos}
                                </span>
                                <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{pick.suggestion}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Best Available by Position */}
            <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-3">Top Targets by Position</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => (
                        <div key={pos} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            <div className={`px-3 py-1.5 text-xs font-bold ${posColor(pos)}`}>{pos} Targets</div>
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {bestByPosition[pos].map((p, i) => (
                                    <div key={p.id} className="flex items-center gap-2 px-3 py-2">
                                        <span className="text-[10px] font-mono text-zinc-400 w-4">{i + 1}</span>
                                        <span className="text-sm text-zinc-900 dark:text-zinc-100 flex-1 truncate">{p.full_name}</span>
                                        <span className="text-xs font-mono text-zinc-500 tabular-nums">{(p.fc_value || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- Pick Plan Section ---

function PickPlanSection({
    picks,
    setPicks,
    freeAgents,
    posColor,
}: {
    picks: PickPlanEntry[];
    setPicks: (picks: PickPlanEntry[]) => void;
    freeAgents: Player[];
    posColor: (pos: string | null) => string;
}) {
    const [expandedPick, setExpandedPick] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const updatePick = (idx: number, updates: Partial<PickPlanEntry>) => {
        const newPicks = [...picks];
        newPicks[idx] = { ...newPicks[idx], ...updates };
        setPicks(newPicks);
    };

    const filteredPlayers = searchQuery.length >= 2
        ? freeAgents
            .filter(p => p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 10)
        : [];

    const positionOptions = ['QB', 'RB', 'WR', 'TE', 'BPA'];

    return (
        <div className="p-4 sm:p-6">
            <div className="mb-4">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pick-by-Pick Plan</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Assign a position target or specific player to each pick
                </p>
            </div>

            {picks.length === 0 ? (
                <div className="text-center py-8 text-zinc-400">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No draft picks found for your team.</p>
                    <p className="text-xs mt-1">Make sure you&apos;re viewing your team&apos;s page.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {picks.map((pick, idx) => (
                        <div key={idx} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                            {/* Pick header */}
                            <button
                                onClick={() => setExpandedPick(expandedPick === idx ? null : idx)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
                            >
                                <span className="text-xs font-bold text-zinc-400 w-12">
                                    {pick.round}.{String(pick.slot).padStart(2, '0')}
                                </span>
                                {pick.targetPosition && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor(pick.targetPosition === 'BPA' ? null : pick.targetPosition)}`}>
                                        {pick.targetPosition}
                                    </span>
                                )}
                                {pick.targetPlayer && (
                                    <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                                        {pick.targetPlayer}
                                    </span>
                                )}
                                {!pick.targetPosition && !pick.targetPlayer && (
                                    <span className="text-sm text-zinc-400 italic">No target set</span>
                                )}
                                <ChevronDown className={`w-4 h-4 ml-auto text-zinc-400 transition-transform ${expandedPick === idx ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Expanded detail */}
                            {expandedPick === idx && (
                                <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
                                    {/* Position target buttons */}
                                    <div>
                                        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Position Target</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {positionOptions.map(pos => (
                                                <button
                                                    key={pos}
                                                    onClick={() => updatePick(idx, { targetPosition: pick.targetPosition === pos ? null : pos })}
                                                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                                        pick.targetPosition === pos
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                                    }`}
                                                >
                                                    {pos}
                                                </button>
                                            ))}
                                            {pick.targetPosition && (
                                                <button
                                                    onClick={() => updatePick(idx, { targetPosition: null })}
                                                    className="px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Player target search */}
                                    <div>
                                        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Target Player</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Search players..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                onFocus={() => setSearchQuery(pick.targetPlayer || '')}
                                                className="w-full px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                                            />
                                            {filteredPlayers.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                                                    {filteredPlayers.map(p => (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => {
                                                                updatePick(idx, { targetPlayer: p.full_name, targetPosition: p.position });
                                                                setSearchQuery('');
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm"
                                                        >
                                                            <span className={`text-xs font-bold px-1 py-0.5 rounded ${posColor(p.position)}`}>
                                                                {p.position}
                                                            </span>
                                                            <span className="text-zinc-900 dark:text-zinc-100">{p.full_name}</span>
                                                            <span className="ml-auto text-xs text-zinc-400 tabular-nums">
                                                                {(p.fc_value || 0).toLocaleString()}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {pick.targetPlayer && (
                                            <div className="mt-1.5 flex items-center gap-2">
                                                <span className="text-xs text-zinc-500">Target:</span>
                                                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{pick.targetPlayer}</span>
                                                <button
                                                    onClick={() => updatePick(idx, { targetPlayer: null })}
                                                    className="text-zinc-400 hover:text-zinc-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Pick notes */}
                                    <div>
                                        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Notes</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Reach if top RB gone..."
                                            value={pick.notes}
                                            onChange={(e) => updatePick(idx, { notes: e.target.value })}
                                            className="w-full px-3 py-1.5 text-sm rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Notes Section ---

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
