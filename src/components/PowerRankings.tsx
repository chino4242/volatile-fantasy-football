'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TeamTrend {
  teamId: string | number;
  teamName: string;
  currentValue: number;
  values: number[]; // array of total values over time (oldest first)
  change: number; // value change from first to last snapshot
}

interface PowerRankingsProps {
  teams: TeamTrend[];
}

function Sparkline({ values, change }: { values: number[]; change: number }) {
  if (values.length < 2) return null;

  const width = 80;
  const height = 24;
  const padding = 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const strokeColor =
    change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : '#a1a1aa';

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function PowerRankings({ teams }: PowerRankingsProps) {
  const [expanded, setExpanded] = useState(true);

  const sorted = [...teams].sort((a, b) => b.currentValue - a.currentValue);

  return (
    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100"
      >
        <span>📊 Power Rankings</span>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-zinc-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-zinc-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 pb-3">
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sorted.map((team, idx) => (
              <div
                key={team.teamId}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="w-6 text-right font-medium text-zinc-500 dark:text-zinc-400">
                  {idx + 1}
                </span>
                <span className="flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
                  {team.teamName}
                </span>
                <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {team.currentValue.toLocaleString()}
                </span>
                <Sparkline values={team.values} change={team.change} />
                <span
                  className={`w-16 text-right tabular-nums text-xs font-medium ${
                    team.change > 0
                      ? 'text-green-600 dark:text-green-400'
                      : team.change < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-zinc-500'
                  }`}
                >
                  {team.change > 0
                    ? `+${team.change.toLocaleString()}`
                    : team.change < 0
                      ? team.change.toLocaleString()
                      : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
