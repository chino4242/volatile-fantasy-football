'use client';

import { useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp } from 'lucide-react';

interface TradeAsset {
    name: string;
    position: string;
    value: number;
}

interface TradePick {
    season: string;
    round: number;
    value: number;
}

interface TradeData {
    id: string;
    created: number;
    otherTeamName: string;
    youSent: { players: TradeAsset[]; picks: TradePick[] };
    youReceived: { players: TradeAsset[]; picks: TradePick[] };
}

interface SleeperTradeHistoryProps {
    trades: TradeData[];
}

export function SleeperTradeHistory({ trades }: SleeperTradeHistoryProps) {
    const [expanded, setExpanded] = useState(true);

    if (trades.length === 0) return null;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm ring-1 ring-zinc-900/5 p-4 mb-6">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full"
            >
                <div className="flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Recent Trades</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold">
                        {trades.length}
                    </span>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
            </button>

            {expanded && (
                <div className="mt-3 space-y-3">
                    {trades.map(trade => (
                        <TradeCard key={trade.id} trade={trade} />
                    ))}
                </div>
            )}
        </div>
    );
}

function TradeCard({ trade }: { trade: TradeData }) {
    const sendTotal = trade.youSent.players.reduce((s, p) => s + p.value, 0)
        + trade.youSent.picks.reduce((s, p) => s + p.value, 0);
    const receiveTotal = trade.youReceived.players.reduce((s, p) => s + p.value, 0)
        + trade.youReceived.picks.reduce((s, p) => s + p.value, 0);
    const diff = receiveTotal - sendTotal;

    const date = new Date(trade.created);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Trade with <span className="font-bold">{trade.otherTeamName}</span>
                </span>
                <span className="text-[10px] text-zinc-500">{dateStr}</span>
            </div>

            {/* Two columns */}
            <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-700">
                {/* You Sent */}
                <div className="p-3">
                    <div className="text-[10px] font-bold text-red-500 uppercase mb-1.5">You Sent</div>
                    {trade.youSent.players.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100 truncate">
                                {p.name} <span className="text-zinc-400">{p.position}</span>
                            </span>
                            <span className="font-mono text-zinc-500 ml-1">{p.value.toLocaleString()}</span>
                        </div>
                    ))}
                    {trade.youSent.picks.map((pk, i) => (
                        <div key={`pk${i}`} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}</span>
                            <span className="font-mono text-zinc-500">~{pk.value.toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-[10px] text-zinc-500">
                        Total: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{sendTotal.toLocaleString()}</span>
                    </div>
                </div>

                {/* You Received */}
                <div className="p-3">
                    <div className="text-[10px] font-bold text-green-500 uppercase mb-1.5">You Received</div>
                    {trade.youReceived.players.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100 truncate">
                                {p.name} <span className="text-zinc-400">{p.position}</span>
                            </span>
                            <span className="font-mono text-zinc-500 ml-1">{p.value.toLocaleString()}</span>
                        </div>
                    ))}
                    {trade.youReceived.picks.map((pk, i) => (
                        <div key={`pk${i}`} className="flex items-center justify-between text-xs py-0.5">
                            <span className="text-zinc-900 dark:text-zinc-100">{pk.season} Rd {pk.round}</span>
                            <span className="font-mono text-zinc-500">~{pk.value.toLocaleString()}</span>
                        </div>
                    ))}
                    <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1.5 pt-1.5 text-[10px] text-zinc-500">
                        Total: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{receiveTotal.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Net value */}
            <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 text-[10px] text-zinc-500">
                Net: <span className={`font-mono font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                </span> dynasty value
            </div>
        </div>
    );
}
