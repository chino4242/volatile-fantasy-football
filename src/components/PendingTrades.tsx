'use client';

import { useState, useEffect } from 'react';
import { ArrowRightLeft, Settings, ThumbsUp, ThumbsDown, Minus, AlertCircle } from 'lucide-react';

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
    allLeaguePlayers?: { name: string; position: string; dynastyValue: number; auctionValue: number | null; teamName: string }[];
}

export function PendingTrades({ leagueId, teamId, teamName, playerValueMap, allLeaguePlayers }: Props) {
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

                const enrichPick = (pk: any) => ({
                    season: pk.season || 0,
                    round: pk.slot?.round || 0,
                    originalOwnerName: pk.originalOwner?.name || '',
                    estimatedValue: pk.slot?.round === 1 ? 3000 : pk.slot?.round === 2 ? 1500 : 800,
                });

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

            {trades.map(trade => <TradeCard key={trade.id} trade={trade} allLeaguePlayers={allLeaguePlayers} />)}
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

function TradeCard({ trade, allLeaguePlayers }: { trade: EnrichedTrade; allLeaguePlayers?: { name: string; position: string; dynastyValue: number; auctionValue: number | null; teamName: string }[] }) {
    const [showCounter, setShowCounter] = useState(false);
    const sendTotal = trade.youSend.players.reduce((s, p) => s + p.dynastyValue, 0) + trade.youSend.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const receiveTotal = trade.youReceive.players.reduce((s, p) => s + p.dynastyValue, 0) + trade.youReceive.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const sendAuction = trade.youSend.players.reduce((s, p) => s + (p.auctionValue || 0), 0);
    const receiveAuction = trade.youReceive.players.reduce((s, p) => s + (p.auctionValue || 0), 0);
    const diff = receiveTotal - sendTotal;
    const pct = sendTotal > 0 ? (diff / sendTotal) * 100 : 0;
    const verdict = pct >= 10 ? 'accept' : pct <= -10 ? 'decline' : 'even';

    // Get the other team's assets for counter suggestions
    const otherTeamPlayers = allLeaguePlayers?.filter(p => p.teamName === trade.otherTeamName) || [];
    const otherTeamSorted = [...otherTeamPlayers].sort((a, b) => b.dynastyValue - a.dynastyValue);

    // Suggest a counter: find assets from their team that would close the value gap
    const suggestedAsk = (() => {
        if (diff >= 0) return []; // trade is already in our favor
        const gap = Math.abs(diff);
        const candidates = otherTeamSorted.filter(p =>
            !trade.youReceive.players.some(rp => rp.name.toLowerCase() === p.name.toLowerCase()) &&
            p.dynastyValue > 0
        );

        // Find the single player closest to the gap (within 50% over or under)
        const closeMatch = candidates
            .filter(p => p.dynastyValue >= gap * 0.5 && p.dynastyValue <= gap * 1.5)
            .sort((a, b) => Math.abs(a.dynastyValue - gap) - Math.abs(b.dynastyValue - gap))[0];

        if (closeMatch) return [closeMatch];

        // If no close single match, try a combination of cheaper players
        const cheaperCandidates = candidates.filter(p => p.dynastyValue < gap && p.dynastyValue >= gap * 0.3);
        if (cheaperCandidates.length > 0) {
            // Take the most valuable one under the gap
            return [cheaperCandidates[0]];
        }

        // Last resort: suggest upgrading a pick round (if picks are involved)
        if (trade.youReceive.picks.length > 0) {
            return []; // suggest asking for a higher pick instead
        }

        return [];
    })();

    // Calculate what the trade would look like with the suggestion
    const suggestedValue = suggestedAsk.reduce((s, p) => s + p.dynastyValue, 0);
    const newDiff = diff + suggestedValue;

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
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}</span>
                            <span className="font-mono text-zinc-500">~{pk.estimatedValue.toLocaleString()}</span>
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
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}</span>
                            <span className="font-mono text-zinc-500">~{pk.estimatedValue.toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-[10px] text-zinc-500">
                        Dynasty: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{receiveTotal.toLocaleString()}</span>
                        {receiveAuction > 0 && <span className="ml-2">Auction: <span className="font-mono text-amber-600">${receiveAuction}</span></span>}
                    </div>
                </div>
            </div>

            {/* Value summary */}
            <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-500 flex items-center gap-3">
                <span>Net: <span className={`font-mono font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{diff.toLocaleString()}</span> dynasty value</span>
                {sendAuction > 0 || receiveAuction > 0 ? (
                    <span>Auction: <span className={`font-mono font-bold ${receiveAuction >= sendAuction ? 'text-green-600' : 'text-red-500'}`}>{receiveAuction >= sendAuction ? '+' : ''}{receiveAuction - sendAuction > 0 ? `$${receiveAuction - sendAuction}` : `-$${sendAuction - receiveAuction}`}</span></span>
                ) : null}
                <button onClick={() => setShowCounter(!showCounter)} className="ml-auto text-[10px] text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    {showCounter ? 'Hide Counter' : 'Counter →'}
                </button>
            </div>

            {/* Counter section */}
            {showCounter && (
                <div className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
                    {/* Suggestion */}
                    {suggestedAsk.length > 0 && diff < 0 && (
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/10 rounded-lg border border-indigo-200 dark:border-indigo-800">
                            <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-1">Suggested Counter: Ask for more</div>
                            <div className="text-xs text-zinc-700 dark:text-zinc-300">
                                Ask them to add:
                                {suggestedAsk.map((p, i) => (
                                    <span key={i} className="ml-1 font-medium">
                                        {p.name} ({p.position}, {p.dynastyValue.toLocaleString()})
                                        {p.auctionValue ? ` $${p.auctionValue}` : ''}
                                        {i < suggestedAsk.length - 1 ? ' +' : ''}
                                    </span>
                                ))}
                            </div>
                            <div className="text-[9px] text-zinc-500 mt-1">
                                Gap: {Math.abs(diff).toLocaleString()} → With counter: <span className={newDiff >= 0 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{newDiff >= 0 ? '+' : ''}{newDiff.toLocaleString()}</span> for you
                            </div>
                        </div>
                    )}
                    {diff < 0 && suggestedAsk.length === 0 && trade.youReceive.picks.length > 0 && (
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                            <div className="text-[10px] font-bold text-amber-600 uppercase mb-1">Suggestion</div>
                            <div className="text-xs text-zinc-700 dark:text-zinc-300">
                                Ask for a higher round pick to close the {Math.abs(diff).toLocaleString()} value gap
                            </div>
                        </div>
                    )}

                    {/* Other team's full roster */}
                    <div>
                        <div className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5">{trade.otherTeamName}&apos;s Assets</div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
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
