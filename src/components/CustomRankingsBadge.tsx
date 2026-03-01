"use client";

import { CustomRanking } from "@/lib/custom-rankings";

interface CustomRankingsBadgeProps {
  rankings: CustomRanking[];
}

const SIGNAL_COLORS: Record<string, string> = {
  "Super Buy": "bg-green-600 text-white",
  "Buy": "bg-green-500 text-white",
  "Hold": "bg-zinc-400 text-white",
  "Sell": "bg-red-500 text-white",
  "Super Sell": "bg-red-600 text-white",
};

export function CustomRankingsBadge({ rankings }: CustomRankingsBadgeProps) {
  if (rankings.length === 0) return null;

  return (
    <div className="space-y-1">
      {rankings.map((ranking, idx) => (
        <div key={idx} className="text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-400">
              {ranking.source_display_name}:
            </span>
            <span className="font-semibold">#{ranking.rank}</span>
            {ranking.signal && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  SIGNAL_COLORS[ranking.signal] || "bg-zinc-600 text-white"
                }`}
              >
                {ranking.signal}
              </span>
            )}
          </div>
          {ranking.notes && (
            <p className="text-zinc-500 mt-0.5 text-[11px] leading-tight">
              {ranking.notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
