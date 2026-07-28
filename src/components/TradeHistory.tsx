'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TradeSide {
  teamName: string;
  playersObtained: { name: string; position: string | null; value: number | null }[];
  picksObtained: { label: string; value: number | null }[];
  totalValue: number;
}

interface Trade {
  id: string;
  timestamp: string;
  sides: [TradeSide, TradeSide];
}

interface TradeHistoryProps {
  trades: Trade[];
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getPositionColor(position: string | null): string {
  switch (position) {
    case 'QB':
      return 'bg-red-500/20 text-red-400';
    case 'RB':
      return 'bg-green-500/20 text-green-400';
    case 'WR':
      return 'bg-blue-500/20 text-blue-400';
    case 'TE':
      return 'bg-orange-500/20 text-orange-400';
    default:
      return 'bg-zinc-500/20 text-zinc-400';
  }
}

function getVerdict(sides: [TradeSide, TradeSide]): { label: string; className: string } {
  const [sideA, sideB] = sides;
  const diff = Math.abs(sideA.totalValue - sideB.totalValue);
  const maxValue = Math.max(sideA.totalValue, sideB.totalValue);

  if (maxValue === 0) {
    return { label: 'Fair Trade', className: 'bg-zinc-500/20 text-zinc-400' };
  }

  const percentage = diff / Math.min(sideA.totalValue, sideB.totalValue);

  if (percentage >= 0.15) {
    const winner = sideA.totalValue > sideB.totalValue ? sideA.teamName : sideB.teamName;
    return { label: `${winner} wins`, className: 'bg-green-500/20 text-green-400' };
  }

  return { label: 'Fair Trade', className: 'bg-zinc-500/20 text-zinc-400' };
}

export default function TradeHistory({ trades }: TradeHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (trades.length === 0) return null;

  return (
    <div className="rounded-xl bg-zinc-900 shadow-sm ring-1 ring-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <h2 className="text-lg font-semibold text-zinc-100">
          🔄 Recent Trades
          <span className="ml-2 text-sm font-normal text-zinc-500">({trades.length})</span>
        </h2>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-zinc-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-zinc-400" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-4 px-5 pb-5">
          {trades.map((trade) => {
            const verdict = getVerdict(trade.sides);
            return (
              <div
                key={trade.id}
                className="rounded-xl bg-zinc-800/50 p-4 ring-1 ring-zinc-700/50"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{formatDate(trade.timestamp)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${verdict.className}`}>
                    {verdict.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {trade.sides.map((side, idx) => (
                    <div key={idx} className="space-y-2">
                      <h4 className="text-sm font-medium text-zinc-300">
                        {side.teamName} receives
                      </h4>

                      <div className="space-y-1">
                        {side.playersObtained.map((player, pIdx) => (
                          <div key={pIdx} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-1.5">
                              {player.position && (
                                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${getPositionColor(player.position)}`}>
                                  {player.position}
                                </span>
                              )}
                              <span className="text-zinc-200">{player.name}</span>
                            </div>
                            {player.value !== null && (
                              <span className="text-zinc-500">{player.value.toLocaleString()}</span>
                            )}
                          </div>
                        ))}

                        {side.picksObtained.map((pick, pkIdx) => (
                          <div key={pkIdx} className="flex items-center justify-between text-sm">
                            <span className="text-cyan-400">{pick.label}</span>
                            {pick.value !== null && (
                              <span className="text-zinc-500">{pick.value.toLocaleString()}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-zinc-700 pt-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-500">Total</span>
                          <span className="font-medium text-zinc-200">
                            {side.totalValue.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
