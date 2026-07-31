'use client';

import { ArrowRightLeft, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';

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
    yourTeamId: number;
    yourTeamName: string;
    otherTeamName: string;
    youSend: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
    youReceive: { players: EnrichedPlayer[]; picks: EnrichedPick[] };
}

interface TradeInboxProps {
    trades: EnrichedTrade[];
    currentRoster: EnrichedPlayer[];
    format: '1qb' | 'sf';
}

function formatDate(timestamp: number): string {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getPositionColor(pos: string): string {
    switch (pos) {
        case 'QB': return 'text-red-500 dark:text-red-400';
        case 'RB': return 'text-green-500 dark:text-green-400';
        case 'WR': return 'text-blue-500 dark:text-blue-400';
        case 'TE': return 'text-orange-500 dark:text-orange-400';
        default: return 'text-zinc-500';
    }
}

function getRecommendation(sendValue: number, receiveValue: number): { label: string; color: string; icon: React.ReactNode } {
    if (sendValue === 0 && receiveValue === 0) {
        return { label: 'EVEN', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: <Minus className="w-4 h-4" /> };
    }
    const diff = (receiveValue - sendValue) / Math.max(sendValue, 1);
    if (diff >= 0.10) {
        return { label: 'ACCEPT', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: <ThumbsUp className="w-4 h-4" /> };
    }
    if (diff <= -0.10) {
        return { label: 'DECLINE', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: <ThumbsDown className="w-4 h-4" /> };
    }
    return { label: 'EVEN', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: <Minus className="w-4 h-4" /> };
}

function computePositionGroups(roster: EnrichedPlayer[]): Record<string, number> {
    const groups: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const player of roster) {
        if (player.position in groups) {
            groups[player.position] += player.dynastyValue;
        }
    }
    return groups;
}

function PlayerRow({ player }: { player: EnrichedPlayer }) {
    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold w-6 ${getPositionColor(player.position)}`}>
                    {player.position}
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {player.name}
                </span>
                {player.team && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {player.team}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3 text-xs">
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                    {player.dynastyValue.toLocaleString()}
                </span>
                {player.auctionValue !== null && (
                    <span className="font-mono text-amber-600 dark:text-amber-400">
                        ${player.auctionValue}
                    </span>
                )}
            </div>
        </div>
    );
}

function PickRow({ pick }: { pick: EnrichedPick }) {
    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/50">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold w-6 text-purple-500 dark:text-purple-400">
                    PKN
                </span>
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {pick.season} Rd {pick.round}
                </span>
                {pick.originalOwnerName && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        ({pick.originalOwnerName})
                    </span>
                )}
            </div>
            <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
                {pick.estimatedValue.toLocaleString()}
            </span>
        </div>
    );
}

function TradeCard({ trade, currentRoster }: { trade: EnrichedTrade; currentRoster: EnrichedPlayer[] }) {
    // Calculate total values
    const sendDynastyTotal = trade.youSend.players.reduce((s, p) => s + p.dynastyValue, 0)
        + trade.youSend.picks.reduce((s, p) => s + p.estimatedValue, 0);
    const receiveDynastyTotal = trade.youReceive.players.reduce((s, p) => s + p.dynastyValue, 0)
        + trade.youReceive.picks.reduce((s, p) => s + p.estimatedValue, 0);

    const sendAuctionTotal = trade.youSend.players.reduce((s, p) => s + (p.auctionValue || 0), 0);
    const receiveAuctionTotal = trade.youReceive.players.reduce((s, p) => s + (p.auctionValue || 0), 0);

    const recommendation = getRecommendation(sendDynastyTotal, receiveDynastyTotal);

    // Before/After position groups
    const beforeGroups = computePositionGroups(currentRoster);
    const afterRoster = currentRoster
        .filter(p => !trade.youSend.players.some(sp => sp.name === p.name))
        .concat(trade.youReceive.players);
    const afterGroups = computePositionGroups(afterRoster);

    const dynastyDiff = receiveDynastyTotal - sendDynastyTotal;

    return (
        <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {trade.yourTeamName} ↔ {trade.otherTeamName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(trade.proposedOn)}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${recommendation.color}`}>
                        {recommendation.icon}
                        {recommendation.label}
                    </span>
                </div>
            </div>

            {/* Trade columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x divide-zinc-200 dark:divide-zinc-800">
                {/* You Send */}
                <div className="p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-3">
                        You Send
                    </h4>
                    <div className="space-y-1.5">
                        {trade.youSend.players.map((player, i) => (
                            <PlayerRow key={`send-p-${i}`} player={player} />
                        ))}
                        {trade.youSend.picks.map((pick, i) => (
                            <PickRow key={`send-pk-${i}`} pick={pick} />
                        ))}
                        {trade.youSend.players.length === 0 && trade.youSend.picks.length === 0 && (
                            <p className="text-xs text-zinc-400 italic">Nothing</p>
                        )}
                    </div>
                </div>

                {/* You Receive */}
                <div className="p-4 border-t md:border-t-0 border-zinc-200 dark:border-zinc-800">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-3">
                        You Receive
                    </h4>
                    <div className="space-y-1.5">
                        {trade.youReceive.players.map((player, i) => (
                            <PlayerRow key={`recv-p-${i}`} player={player} />
                        ))}
                        {trade.youReceive.picks.map((pick, i) => (
                            <PickRow key={`recv-pk-${i}`} pick={pick} />
                        ))}
                        {trade.youReceive.players.length === 0 && trade.youReceive.picks.length === 0 && (
                            <p className="text-xs text-zinc-400 italic">Nothing</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Value Summary */}
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Dynasty Sent</p>
                        <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                            {sendDynastyTotal.toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Dynasty Received</p>
                        <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                            {receiveDynastyTotal.toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Auction Sent</p>
                        <p className="text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                            ${sendAuctionTotal}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">Auction Received</p>
                        <p className="text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                            ${receiveAuctionTotal}
                        </p>
                    </div>
                </div>
                <div className="mt-2 text-center">
                    <span className={`text-xs font-mono ${dynastyDiff >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        Net: {dynastyDiff >= 0 ? '+' : ''}{dynastyDiff.toLocaleString()} dynasty value
                    </span>
                </div>
            </div>

            {/* Before/After Position Groups */}
            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                    Position Group Impact
                </h4>
                <div className="grid grid-cols-4 gap-2">
                    {(['QB', 'RB', 'WR', 'TE'] as const).map(pos => {
                        const before = beforeGroups[pos] || 0;
                        const after = afterGroups[pos] || 0;
                        const diff = after - before;
                        return (
                            <div key={pos} className="text-center">
                                <span className={`text-xs font-semibold ${getPositionColor(pos)}`}>{pos}</span>
                                <div className="text-[10px] text-zinc-500 mt-0.5">
                                    {before.toLocaleString()} → {after.toLocaleString()}
                                </div>
                                <div className={`text-[10px] font-mono ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-zinc-400'}`}>
                                    {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Status badge */}
            {trade.status && trade.status !== 'TRADE_STATUS_OPEN' && (
                <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800">
                    <span className="text-[10px] uppercase tracking-wider text-indigo-500 dark:text-indigo-400 font-semibold">
                        {trade.status.replace('TRADE_STATUS_', '').replace(/_/g, ' ')}
                    </span>
                </div>
            )}
        </div>
    );
}

export function TradeInbox({ trades, currentRoster, format }: TradeInboxProps) {
    if (trades.length === 0) {
        return (
            <div className="text-center py-12">
                <ArrowRightLeft className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">No Pending Trades</h2>
                <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
                    Check back when trade offers come in.
                </p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Trade Inbox</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {trades.length} pending trade{trades.length !== 1 ? 's' : ''} • {format === 'sf' ? 'Superflex' : '1QB'} values
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {trades.map(trade => (
                    <TradeCard key={trade.id} trade={trade} currentRoster={currentRoster} />
                ))}
            </div>
        </div>
    );
}
