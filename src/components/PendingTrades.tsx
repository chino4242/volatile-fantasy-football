'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Settings, ThumbsUp, ThumbsDown, Minus, AlertCircle } from 'lucide-react';
import { analyzeTradeAdvisor } from '@/lib/trade-advisor';

interface EnrichedPlayer {
    name: string;
    position: string;
    team: string;
    dynastyValue: number;
    auctionValue: number | null;
}

interface EnrichedPick {
    season: number;
    round: number;
    slot: number;
    originalOwnerName: string;
    estimatedValue: number;
}

interface EnrichedTrade {
    id: number;
    status: string;
    proposedOn: number;
    yourTeamName: string;
    otherTeamName: string;
    youSend: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
    youReceive: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
}

interface Props {
    leagueId: string;
    teamId: string;
    teamName: string;
    playerValueMap: Record<string, { dynastyValue: number; auctionValue: number | null; position: string }>;
    allLeaguePlayers?: { name: string; position: string; dynastyValue: number; auctionValue: number | null; teamName: string; sleeper_id?: string | null; age?: number | null; signal?: string | null }[];
    allLeaguePicks?: { season: number; round: number; slot: number; teamName: string; estimatedValue: number }[];
    onOpenInEvaluator?: (trade: { myAssets: string[]; theirAssets: string[]; theirPlayerId?: string }) => void;
}

export function PendingTrades({ leagueId, teamId, teamName, playerValueMap, allLeaguePlayers, allLeaguePicks, onOpenInEvaluator }: Props) {
    const [trades, setTrades] = useState<EnrichedTrade[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [cookieValue, setCookieValue] = useState<string>('');
    const [cookieLoaded, setCookieLoaded] = useState(false);

    // Get user ID for DB storage
    const getUserId = () => {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('vff_sleeper_username') || localStorage.getItem('vff_fleaflicker_username') || null;
    };

    // Load cookie from DB on mount
    useEffect(() => {
        const userId = getUserId();
        if (!userId) { setCookieLoaded(true); return; }

        fetch(`/api/user-settings?user_id=${userId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.fleaflicker_cookie) {
                    setCookieValue(data.fleaflicker_cookie);
                    fetchTrades(data.fleaflicker_cookie);
                }
            })
            .catch(() => {})
            .finally(() => setCookieLoaded(true));
    }, [leagueId]);

    const saveCookie = () => {
        if (!cookieValue.trim()) return;
        const trimmed = cookieValue.trim();
        // Save to DB
        const userId = getUserId();
        if (userId) {
            fetch('/api/user-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                body: JSON.stringify({ fleaflicker_cookie: trimmed }),
            }).catch(() => {});
        }
        fetchTrades(trimmed);
        setShowSettings(false);
    };

    const fetchTrades = async (cookie: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/fleaflicker/trades?league_id=${leagueId}&filter=TRADES_OWNER_OPEN`, {
                headers: { 'x-ff-cookie': cookie },
            });
            if (!res.ok) {
                if (res.status === 401) setError('Cookie expired — update in settings');
                else setError('Failed to fetch trades');
                setTrades([]);
                return;
            }
            const data = await res.json();
            const rawTrades = data.trades || [];

            // Enrich trades
            const enriched: EnrichedTrade[] = rawTrades.map((t: any) => {
                const myTeam = t.teams?.find((tt: any) => tt.team?.id === parseInt(teamId));
                const otherTeam = t.teams?.find((tt: any) => tt.team?.id !== parseInt(teamId));
                if (!myTeam || !otherTeam) return null;

                const enrichPlayer = (p: any) => {
                    const name = p.proPlayer?.nameFull || p.proPlayer?.nameShort || '';
                    const pos = p.proPlayer?.position || '';
                    const team = p.proPlayer?.proTeamAbbreviation || '';
                    const key = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '').replace(/\s+/g, ' ').trim();
                    const data = playerValueMap[key];
                    return { name, position: pos || data?.position || '', team, dynastyValue: data?.dynastyValue || 0, auctionValue: data?.auctionValue || null };
                };

                const enrichPick = (pk: any) => {
                    const season = pk.season || 0;
                    const round = pk.slot?.round || 0;
                    const slot = pk.slot?.slot || 0;
                    // Try to find specific value from allLeaguePicks
                    const matchedPick = allLeaguePicks?.find(lp => lp.season === season && lp.round === round && lp.slot === slot);
                    const estimatedValue = matchedPick?.estimatedValue || (round === 1 ? 3000 : round === 2 ? 1500 : 800);
                    return {
                        season,
                        round,
                        slot,
                        originalOwnerName: pk.originalOwner?.name || '',
                        estimatedValue,
                    };
                };

                return {
                    id: t.id,
                    status: t.status || 'open',
                    proposedOn: t.proposed_on ? parseInt(t.proposed_on) : 0,
                    yourTeamName: myTeam.team?.name || teamName,
                    otherTeamName: otherTeam.team?.name || 'Other Team',
                    youSend: {
                        players: (otherTeam.playersObtained || []).map(enrichPlayer),
                        picks: (otherTeam.picksObtained || []).map(enrichPick),
                    },
                    youReceive: {
                        players: (myTeam.playersObtained || []).map(enrichPlayer),
                        picks: (myTeam.picksObtained || []).map(enrichPick),
                    },
                };
            }).filter(Boolean);

            setTrades(enriched);
        } catch {
            setError('Failed to fetch trades');
            setTrades([]);
        } finally {
            setLoading(false);
        }
    };

    const hasCookie = cookieLoaded && !!cookieValue;

    if (!cookieLoaded) return null; // wait for DB load

    if (!hasCookie && trades.length === 0 && !showSettings) {
        return (
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 p-4 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pending Trades</span>
                    </div>
                    <button onClick={() => setShowSettings(true)} className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                        Connect
                    </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">Connect your Fleaflicker session to see pending trade offers with value analysis.</p>
                {showSettings && <CookieInput cookieValue={cookieValue} setCookieValue={setCookieValue} onSave={saveCookie} />}
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pending Trades</span>
                    {trades.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold">{trades.length}</span>}
                </div>
                <button onClick={() => setShowSettings(!showSettings)} className="text-zinc-400 hover:text-zinc-600 p-1">
                    <Settings className="w-4 h-4" />
                </button>
            </div>

            {showSettings && <CookieInput cookieValue={cookieValue} setCookieValue={setCookieValue} onSave={saveCookie} />}

            {error && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mb-3">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{error}</span>
                    <button onClick={() => setShowSettings(true)} className="underline">Update cookie</button>
                </div>
            )}

            {loading && <p className="text-xs text-zinc-500 text-center py-4">Loading trades...</p>}

            {!loading && trades.length === 0 && !error && (
                <p className="text-xs text-zinc-500 text-center py-2">No pending trades</p>
            )}

            {trades.map(trade => <TradeCard key={trade.id} trade={trade} allLeaguePlayers={allLeaguePlayers} allLeaguePicks={allLeaguePicks} onOpenInEvaluator={onOpenInEvaluator} />)}
        </div>
    );
}

function CookieInput({ cookieValue, setCookieValue, onSave }: { cookieValue: string; setCookieValue: (v: string) => void; onSave: () => void }) {
    return (
        <div className="mb-3 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg space-y-2">
            <p className="text-[10px] text-zinc-500">
                Paste your Fleaflicker cookie value. In Chrome: DevTools → Application → Cookies → www.fleaflicker.com → copy the <strong>cookieId</strong> value.
            </p>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={cookieValue}
                    onChange={(e) => setCookieValue(e.target.value)}
                    placeholder="paste cookie string here..."
                    className="flex-1 text-xs px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
                />
                <button onClick={onSave} className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    Save
                </button>
            </div>
        </div>
    );
}

function TradeCard({ trade, allLeaguePlayers, allLeaguePicks, onOpenInEvaluator }: { trade: EnrichedTrade; allLeaguePlayers?: { name: string; position: string; dynastyValue: number; auctionValue: number | null; teamName: string; sleeper_id?: string | null; age?: number | null; signal?: string | null }[]; allLeaguePicks?: { season: number; round: number; slot: number; teamName: string; estimatedValue: number; sleeper_id?: string }[]; onOpenInEvaluator?: (trade: { myAssets: string[]; theirAssets: string[]; theirPlayerId?: string }) => void }) {
    const [showCounter, setShowCounter] = useState(false);
    const [showImpact, setShowImpact] = useState(false);
    const sendTotal = trade.youSend.players.reduce((s, p) => s + p.dynastyValue, 0) + trade.youSend.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const receiveTotal = trade.youReceive.players.reduce((s, p) => s + p.dynastyValue, 0) + trade.youReceive.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const sendAuction = trade.youSend.players.reduce((s, p) => s + (p.auctionValue || 0), 0);
    const receiveAuction = trade.youReceive.players.reduce((s, p) => s + (p.auctionValue || 0), 0);
    const diff = receiveTotal - sendTotal;
    const pct = sendTotal > 0 ? (diff / sendTotal) * 100 : 0;
    const verdict = pct >= 10 ? 'accept' : pct <= -10 ? 'decline' : 'even';

    // Roster impact: before/after by position
    const rosterImpact = useMemo(() => {
        const myPlayers = allLeaguePlayers?.filter(p => p.teamName === trade.yourTeamName) || [];
        const positions = ['QB', 'RB', 'WR', 'TE'] as const;
        
        // Before: current roster
        const before: Record<string, { dynasty: number; auction: number; count: number }> = {};
        let beforeTotal = { dynasty: 0, auction: 0 };
        positions.forEach(pos => { before[pos] = { dynasty: 0, auction: 0, count: 0 }; });
        myPlayers.forEach(p => {
            if (p.position && p.position in before) {
                before[p.position].dynasty += p.dynastyValue;
                before[p.position].auction += p.auctionValue || 0;
                before[p.position].count++;
            }
            beforeTotal.dynasty += p.dynastyValue;
            beforeTotal.auction += p.auctionValue || 0;
        });

        // After: remove what you send, add what you receive
        const after: Record<string, { dynasty: number; auction: number; count: number }> = {};
        positions.forEach(pos => { after[pos] = { ...before[pos] }; });
        let afterTotal = { ...beforeTotal };

        trade.youSend.players.forEach(p => {
            const pos = p.position as string;
            if (pos in after) {
                after[pos].dynasty -= p.dynastyValue;
                after[pos].auction -= (p.auctionValue || 0);
                after[pos].count--;
            }
            afterTotal.dynasty -= p.dynastyValue;
            afterTotal.auction -= (p.auctionValue || 0);
        });

        trade.youReceive.players.forEach(p => {
            const pos = p.position as string;
            if (pos in after) {
                after[pos].dynasty += p.dynastyValue;
                after[pos].auction += (p.auctionValue || 0);
                after[pos].count++;
            }
            afterTotal.dynasty += p.dynastyValue;
            afterTotal.auction += (p.auctionValue || 0);
        });

        // Picks impact on total
        afterTotal.dynasty -= trade.youSend.picks.reduce((s, pk) => s + pk.estimatedValue, 0);
        afterTotal.dynasty += trade.youReceive.picks.reduce((s, pk) => s + pk.estimatedValue, 0);

        return { before, after, beforeTotal, afterTotal, positions };
    }, [allLeaguePlayers, trade]);

    // Trade advisor recommendation
    const advisorResult = useMemo(() => {
        const myPlayers = allLeaguePlayers?.filter(p => p.teamName === trade.yourTeamName) || [];
        const findPlayer = (name: string) => allLeaguePlayers?.find(p => p.name.toLowerCase() === name.toLowerCase());
        return analyzeTradeAdvisor({
            myRoster: myPlayers.map(p => ({ position: p.position, dynastyValue: p.dynastyValue, auctionValue: p.auctionValue || 0, age: p.age || null })),
            sending: trade.youSend.players.map(p => {
                const match = findPlayer(p.name);
                return { position: p.position, dynastyValue: p.dynastyValue, auctionValue: p.auctionValue || 0, age: match?.age || null, name: p.name, signal: match?.signal || null };
            }),
            receiving: trade.youReceive.players.map(p => {
                const match = findPlayer(p.name);
                return { position: p.position, dynastyValue: p.dynastyValue, auctionValue: p.auctionValue || 0, age: match?.age || null, name: p.name, signal: match?.signal || null };
            }),
            sendingPickValue: trade.youSend.picks.reduce((s, pk) => s + pk.estimatedValue, 0),
            receivingPickValue: trade.youReceive.picks.reduce((s, pk) => s + pk.estimatedValue, 0),
        });
    }, [allLeaguePlayers, trade]);

    // Get the other team's assets for counter suggestions
    const otherTeamPlayers = allLeaguePlayers?.filter(p => p.teamName === trade.otherTeamName) || [];
    const otherTeamSorted = [...otherTeamPlayers].sort((a, b) => b.dynastyValue - a.dynastyValue);
    const otherTeamPicks = allLeaguePicks?.filter(p => p.teamName === trade.otherTeamName)?.sort((a, b) => a.round - b.round || a.season - b.season) || [];

    // Suggest a counter: prefer pick upgrades/additions for small gaps, players for large gaps
    const suggestedAsk = (() => {
        if (diff >= 0) return { players: [], picks: [] };
        const gap = Math.abs(diff);

        // For smaller gaps (< 2000), suggest a pick upgrade or addition first
        const availablePicks = otherTeamPicks.filter(pk =>
            !trade.youReceive.picks.some(rp => rp.season === pk.season && rp.round === pk.round)
        );
        
        if (gap < 2500 && availablePicks.length > 0) {
            // Find a pick that closely matches the gap
            const pickMatch = availablePicks
                .filter(pk => pk.estimatedValue >= gap * 0.4 && pk.estimatedValue <= gap * 1.5)
                .sort((a, b) => Math.abs(a.estimatedValue - gap) - Math.abs(b.estimatedValue - gap))[0];
            if (pickMatch) return { players: [], picks: [pickMatch] };
        }

        // For larger gaps, suggest a player
        const candidates = otherTeamSorted.filter(p =>
            !trade.youReceive.players.some(rp => rp.name.toLowerCase() === p.name.toLowerCase()) &&
            p.dynastyValue > 0
        );

        const closeMatch = candidates
            .filter(p => p.dynastyValue >= gap * 0.5 && p.dynastyValue <= gap * 1.5)
            .sort((a, b) => Math.abs(a.dynastyValue - gap) - Math.abs(b.dynastyValue - gap))[0];

        if (closeMatch) return { players: [closeMatch], picks: [] };

        // Fallback: cheaper player + a pick
        const cheapPlayer = candidates.find(p => p.dynastyValue >= gap * 0.3 && p.dynastyValue < gap);
        if (cheapPlayer && availablePicks.length > 0) {
            const remainingGap = gap - cheapPlayer.dynastyValue;
            const pickFill = availablePicks.find(pk => pk.estimatedValue >= remainingGap * 0.5);
            if (pickFill) return { players: [cheapPlayer], picks: [pickFill] };
            return { players: [cheapPlayer], picks: [] };
        }

        return { players: [], picks: [] };
    })();

    const suggestedValue = suggestedAsk.players.reduce((s, p) => s + p.dynastyValue, 0) + suggestedAsk.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const newDiff = diff + suggestedValue;
    const hasSuggestion = suggestedAsk.players.length > 0 || suggestedAsk.picks.length > 0;

    // Generate alternative deal structures ("they want X, here's what makes it fair")
    const reframedDeals = (() => {
        // Identify what they want (players they're obtaining from us)
        const theyWant = trade.youSend.players;
        if (theyWant.length === 0) return [];
        const theyWantValue = theyWant.reduce((s, p) => s + p.dynastyValue, 0);
        const theyWantNames = theyWant.map(p => p.name).join(' + ');

        const deals: { label: string; youGive: string; youGet: string; netValue: number }[] = [];

        // Option 1: Straight pick swap — find a pick from them worth ~same as what we send
        const pickMatch = otherTeamPicks.find(pk =>
            pk.estimatedValue >= theyWantValue * 0.8 && pk.estimatedValue <= theyWantValue * 1.3 &&
            !trade.youReceive.picks.some(rp => rp.season === pk.season && rp.round === pk.round)
        );
        if (pickMatch) {
            deals.push({
                label: 'Pick swap',
                youGive: theyWantNames,
                youGet: `${pickMatch.season} ${pickMatch.round}.${String(pickMatch.slot).padStart(2, '0')}`,
                netValue: pickMatch.estimatedValue - theyWantValue,
            });
        }

        // Option 2: Their player of similar value
        const playerMatch = otherTeamSorted.find(p =>
            p.dynastyValue >= theyWantValue * 0.75 && p.dynastyValue <= theyWantValue * 1.25 &&
            !trade.youReceive.players.some(rp => rp.name.toLowerCase() === p.name.toLowerCase())
        );
        if (playerMatch) {
            deals.push({
                label: 'Player swap',
                youGive: theyWantNames,
                youGet: `${playerMatch.name} (${playerMatch.position})`,
                netValue: playerMatch.dynastyValue - theyWantValue,
            });
        }

        // Option 3: Their cheaper player + pick to make up difference
        const cheaperPlayer = otherTeamSorted.find(p =>
            p.dynastyValue >= theyWantValue * 0.4 && p.dynastyValue < theyWantValue * 0.75 &&
            !trade.youReceive.players.some(rp => rp.name.toLowerCase() === p.name.toLowerCase())
        );
        if (cheaperPlayer) {
            const remainder = theyWantValue - cheaperPlayer.dynastyValue;
            const fillPick = otherTeamPicks.find(pk =>
                pk.estimatedValue >= remainder * 0.6 && pk.estimatedValue <= remainder * 1.5 &&
                !trade.youReceive.picks.some(rp => rp.season === pk.season && rp.round === pk.round)
            );
            if (fillPick) {
                deals.push({
                    label: 'Player + pick',
                    youGive: theyWantNames,
                    youGet: `${cheaperPlayer.name} (${cheaperPlayer.position}) + ${fillPick.season} ${fillPick.round}.${String(fillPick.slot).padStart(2, '0')}`,
                    netValue: (cheaperPlayer.dynastyValue + fillPick.estimatedValue) - theyWantValue,
                });
            }
        }

        return deals.slice(0, 3);
    })();

    return (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden mb-3 last:mb-0">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Trade with <span className="font-bold">{trade.otherTeamName}</span></span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    verdict === 'accept' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : verdict === 'decline' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                }`}>
                    {verdict === 'accept' ? '👍 ACCEPT' : verdict === 'decline' ? '👎 DECLINE' : '⚖️ EVEN'}
                </span>
            </div>

            {/* Advisor Recommendation */}
            <div className={`px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 ${
                advisorResult.verdict === 'strong-accept' || advisorResult.verdict === 'accept' ? 'bg-green-50/50 dark:bg-green-950/10' :
                advisorResult.verdict === 'strong-decline' || advisorResult.verdict === 'decline' ? 'bg-red-50/50 dark:bg-red-950/10' :
                'bg-zinc-50/50 dark:bg-zinc-800/10'
            }`}>
                <div className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">{advisorResult.summary}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {advisorResult.reasons.slice(0, 4).map((reason, i) => (
                        <span key={i} className="text-[9px] text-zinc-500">{reason}</span>
                    ))}
                </div>
                {advisorResult.pitch && (
                    <div className="mt-1.5 pt-1.5 border-t border-zinc-200/50 dark:border-zinc-700/50">
                        <div className="text-[9px] font-bold text-zinc-400 uppercase mb-0.5">Negotiation angle</div>
                        <div className="text-[10px] text-zinc-600 dark:text-zinc-400 italic">&ldquo;{advisorResult.pitch}&rdquo;</div>
                    </div>
                )}
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-700">
                {/* You Send */}
                <div className="p-3">
                    <div className="text-[10px] font-bold text-red-500 uppercase mb-1.5">You Send</div>
                    {trade.youSend.players.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100 truncate">{p.name} <span className="text-zinc-400">{p.position}</span></span>
                            <span className="font-mono text-zinc-500 ml-1">{p.dynastyValue.toLocaleString()}</span>
                        </div>
                    ))}
                    {trade.youSend.picks.map((pk, i) => (
                        <div key={`pk${i}`} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}{pk.slot ? `.${String(pk.slot).padStart(2, '0')}` : ''}</span>
                            <span className="font-mono text-zinc-500">{pk.estimatedValue.toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-[10px] text-zinc-500">
                        Dynasty: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{sendTotal.toLocaleString()}</span>
                        {sendAuction > 0 && <span className="ml-2">Auction: <span className="font-mono text-amber-600">${sendAuction}</span></span>}
                    </div>
                </div>

                {/* You Receive */}
                <div className="p-3">
                    <div className="text-[10px] font-bold text-green-500 uppercase mb-1.5">You Receive</div>
                    {trade.youReceive.players.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100 truncate">{p.name} <span className="text-zinc-400">{p.position}</span></span>
                            <span className="font-mono text-zinc-500 ml-1">{p.dynastyValue.toLocaleString()}</span>
                        </div>
                    ))}
                    {trade.youReceive.picks.map((pk, i) => (
                        <div key={`pk${i}`} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}{pk.slot ? `.${String(pk.slot).padStart(2, '0')}` : ''}</span>
                            <span className="font-mono text-zinc-500">{pk.estimatedValue.toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-[10px] text-zinc-500">
                        Dynasty: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{receiveTotal.toLocaleString()}</span>
                        {receiveAuction > 0 && <span className="ml-2">Auction: <span className="font-mono text-amber-600">${receiveAuction}</span></span>}
                    </div>
                </div>
            </div>

            {/* Value summary */}
            <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-500 flex items-center gap-3 flex-wrap">
                <span>Net: <span className={`font-mono font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{diff.toLocaleString()}</span> dynasty value</span>
                {sendAuction > 0 || receiveAuction > 0 ? (
                    <span>Auction: <span className={`font-mono font-bold ${receiveAuction >= sendAuction ? 'text-green-600' : 'text-red-500'}`}>{receiveAuction >= sendAuction ? '+' : ''}{receiveAuction - sendAuction > 0 ? `$${receiveAuction - sendAuction}` : `-$${sendAuction - receiveAuction}`}</span></span>
                ) : null}
                <div className="ml-auto flex gap-2">
                    <button onClick={() => setShowImpact(!showImpact)} className="text-[10px] text-zinc-600 dark:text-zinc-400 font-medium hover:underline">
                        {showImpact ? 'Hide Impact' : 'Impact ↕'}
                    </button>
                    <button onClick={() => setShowCounter(!showCounter)} className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                        {showCounter ? 'Hide Counter' : 'Counter →'}
                    </button>
                </div>
            </div>

            {/* Roster Impact */}
            {showImpact && (
                <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/20">
                    <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Team Impact (Before → After)</div>
                    {/* Totals */}
                    <div className="flex gap-4 mb-2 text-[10px]">
                        <div>
                            <span className="text-zinc-400">Dynasty: </span>
                            <span className="font-mono text-zinc-600 dark:text-zinc-400">{rosterImpact.beforeTotal.dynasty.toLocaleString()}</span>
                            <span className="text-zinc-400"> → </span>
                            <span className={`font-mono font-medium ${rosterImpact.afterTotal.dynasty >= rosterImpact.beforeTotal.dynasty ? 'text-green-600' : 'text-red-500'}`}>{rosterImpact.afterTotal.dynasty.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="text-zinc-400">Auction: </span>
                            <span className="font-mono text-zinc-600 dark:text-zinc-400">${rosterImpact.beforeTotal.auction}</span>
                            <span className="text-zinc-400"> → </span>
                            <span className={`font-mono font-medium ${rosterImpact.afterTotal.auction >= rosterImpact.beforeTotal.auction ? 'text-green-600' : 'text-red-500'}`}>${rosterImpact.afterTotal.auction}</span>
                        </div>
                    </div>
                    {/* Position breakdown */}
                    <div className="grid grid-cols-4 gap-2">
                        {rosterImpact.positions.map(pos => {
                            const b = rosterImpact.before[pos];
                            const a = rosterImpact.after[pos];
                            const dynDelta = a.dynasty - b.dynasty;
                            const aucDelta = a.auction - b.auction;
                            return (
                                <div key={pos} className="text-center bg-white dark:bg-zinc-900 rounded-lg p-1.5 border border-zinc-100 dark:border-zinc-800">
                                    <div className="text-[9px] font-bold text-zinc-400">{pos}</div>
                                    <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400">{b.dynasty.toLocaleString()}</div>
                                    {dynDelta !== 0 && (
                                        <div className={`text-[9px] font-mono font-bold ${dynDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {dynDelta > 0 ? '+' : ''}{dynDelta.toLocaleString()}
                                        </div>
                                    )}
                                    <div className={`text-[10px] font-mono font-medium ${dynDelta > 0 ? 'text-green-700 dark:text-green-400' : dynDelta < 0 ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'}`}>{a.dynasty.toLocaleString()}</div>
                                    {aucDelta !== 0 && (
                                        <div className={`text-[8px] font-mono ${aucDelta > 0 ? 'text-amber-600' : 'text-amber-500'}`}>
                                            {aucDelta > 0 ? '+' : ''}${aucDelta}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Counter section */}
            {showCounter && (
                <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                    {/* Suggestion */}
                    {hasSuggestion && diff < 0 && (
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Suggested Counter: Ask for more</div>
                            <div className="text-xs text-zinc-700 dark:text-zinc-300">
                                Ask them to add:
                                {suggestedAsk.picks.map((pk, i) => (
                                    <span key={`pk${i}`} className="ml-1 font-medium">{pk.season} Round {pk.round} pick (~{pk.estimatedValue.toLocaleString()}){suggestedAsk.players.length > 0 ? ' +' : ''}</span>
                                ))}
                                {suggestedAsk.players.map((p, i) => (
                                    <span key={i} className="ml-1 font-medium">
                                        {p.name} ({p.position}, {p.dynastyValue.toLocaleString()})
                                        {p.auctionValue ? ` $${p.auctionValue}` : ''}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                                <div className="text-[9px] text-zinc-500">
                                    Gap: {Math.abs(diff).toLocaleString()} → With counter: <span className={newDiff >= 0 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{newDiff >= 0 ? '+' : ''}{newDiff.toLocaleString()}</span> for you
                                </div>
                                <button
                                    onClick={() => {
                                        // Build asset IDs for the counter: original trade + suggested additions
                                        const myAssetIds = trade.youSend.players.map(p => allLeaguePlayers?.find(lp => lp.name === p.name)?.sleeper_id).filter(Boolean) as string[];
                                        const theirAssetIds = [
                                            ...trade.youReceive.players.map(p => allLeaguePlayers?.find(lp => lp.name === p.name)?.sleeper_id).filter(Boolean) as string[],
                                            ...suggestedAsk.players.map(p => allLeaguePlayers?.find(lp => lp.name === p.name)?.sleeper_id).filter(Boolean) as string[],
                                        ];
                                        window.dispatchEvent(new CustomEvent('vff:open-trade-evaluator', { detail: { myAssets: myAssetIds, theirAssets: theirAssetIds } }));
                                        document.getElementById('trade-evaluator')?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-[9px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    Open in Evaluator →
                                </button>
                            </div>
                        </div>
                    )}
                    {diff < 0 && !hasSuggestion && trade.youReceive.picks.length > 0 && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                            <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Suggestion</div>
                            <div className="text-xs text-zinc-700 dark:text-zinc-300">
                                Ask for a higher round pick to close the {Math.abs(diff).toLocaleString()} value gap
                            </div>
                        </div>
                    )}

                    {/* Reframed deal alternatives */}
                    {reframedDeals.length > 0 && (
                        <div className="p-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg">
                            <div className="text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase mb-1.5">
                                Alternative Deals (they get what they want)
                            </div>
                            <div className="space-y-1.5">
                                {reframedDeals.map((deal, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium flex-shrink-0">{deal.label}</span>
                                        <span className="text-zinc-500">You give:</span>
                                        <span className="text-zinc-900 dark:text-zinc-100 truncate">{deal.youGive}</span>
                                        <span className="text-zinc-400">→</span>
                                        <span className="text-zinc-900 dark:text-zinc-100 truncate">{deal.youGet}</span>
                                        <span className={`font-mono text-[10px] flex-shrink-0 ${deal.netValue >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {deal.netValue >= 0 ? '+' : ''}{deal.netValue.toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => {
                                    // Open evaluator with the original trade's assets as starting point
                                    const myAssetIds = trade.youSend.players.map(p => allLeaguePlayers?.find(lp => lp.name === p.name)?.sleeper_id).filter(Boolean) as string[];
                                    const theirAssetIds = trade.youReceive.players.map(p => allLeaguePlayers?.find(lp => lp.name === p.name)?.sleeper_id).filter(Boolean) as string[];
                                    window.dispatchEvent(new CustomEvent('vff:open-trade-evaluator', { detail: { myAssets: myAssetIds, theirAssets: theirAssetIds } }));
                                    document.getElementById('trade-evaluator')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="mt-2 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                                Open in Evaluator →
                            </button>
                        </div>
                    )}

                    {/* Other team's full roster */}
                    <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5">{trade.otherTeamName}&apos;s Assets</div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {otherTeamPicks.length > 0 && (
                                <div className="mb-2">
                                    <div className="text-[9px] font-semibold text-zinc-400 uppercase mb-0.5">Draft Picks</div>
                                    {otherTeamPicks.map((pk, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                            <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600">PICK</span>
                                            <span className="text-zinc-900 dark:text-zinc-100 flex-1">{pk.season} {pk.round}.{String(pk.slot).padStart(2, '0')}</span>
                                            <span className="font-mono text-zinc-500 text-[10px]">~{pk.estimatedValue.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="text-[9px] font-semibold text-zinc-400 uppercase mb-0.5">Players</div>
                            {otherTeamSorted.slice(0, 20).map((p, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                        p.position === 'QB' ? 'bg-red-50 text-red-600 dark:bg-red-900/20' :
                                        p.position === 'RB' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' :
                                        p.position === 'WR' ? 'bg-green-50 text-green-600 dark:bg-green-900/20' :
                                        'bg-purple-50 text-purple-600 dark:bg-purple-900/20'
                                    }`}>{p.position}</span>
                                    <span className="text-zinc-900 dark:text-zinc-100 flex-1 truncate">{p.name}</span>
                                    <span className="font-mono text-zinc-500 text-[10px]">{p.dynastyValue.toLocaleString()}</span>
                                    {p.auctionValue && <span className="font-mono text-amber-600 text-[10px]">${p.auctionValue}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
