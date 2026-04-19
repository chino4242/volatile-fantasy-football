"use client";

import { X } from "lucide-react";
import { useMemo, useState, useEffect } from "react";

type WeeklyStat = {
  week: number;
  targets: number | null;
  receptions: number | null;
  receiving_yards: number | null;
  receiving_tds: number | null;
  carries: number | null;
  rushing_yards: number | null;
  rushing_tds: number | null;
  completions: number | null;
  attempts: number | null;
  passing_yards: number | null;
  passing_tds: number | null;
  interceptions: number | null;
  // Advanced metrics
  target_share: string | null;
  air_yards_share: string | null;
  wopr: string | null;
  racr: string | null;
  fantasy_points: string | null;
  fantasy_points_ppr: string | null;
};

type PlayerStatsModalProps = {
  playerName: string;
  position: string;
  team: string | null;
  sleeperId: string;
  onClose: () => void;
  writeups?: { source: string; analysis_text: string }[] | null;
  zapScore?: number | null;
  zapCategory?: string | null;
  zapComps?: string | null;
  zapAnalysis?: string | null;
};

export function PlayerStatsModal({
  playerName,
  position,
  team,
  sleeperId,
  onClose,
  writeups,
  zapScore,
  zapCategory,
  zapComps,
  zapAnalysis,
}: PlayerStatsModalProps) {
  const [selectedSeason, setSelectedSeason] = useState(new Date().getFullYear() - 1);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeupTab, setWriteupTab] = useState('late_round');

  // Fetch stats when season changes
  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/player-stats?sleeperId=${sleeperId}&season=${selectedSeason}`);
        if (res.ok) {
          const data = await res.json();
          setWeeklyStats(data.stats || []);
        }
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [sleeperId, selectedSeason]);
  const seasonTotals = useMemo(() => {
    return weeklyStats.reduce(
      (acc, week) => ({
        targets: acc.targets + (week.targets || 0),
        receptions: acc.receptions + (week.receptions || 0),
        receiving_yards: acc.receiving_yards + (week.receiving_yards || 0),
        receiving_tds: acc.receiving_tds + (week.receiving_tds || 0),
        carries: acc.carries + (week.carries || 0),
        rushing_yards: acc.rushing_yards + (week.rushing_yards || 0),
        rushing_tds: acc.rushing_tds + (week.rushing_tds || 0),
        completions: acc.completions + (week.completions || 0),
        attempts: acc.attempts + (week.attempts || 0),
        passing_yards: acc.passing_yards + (week.passing_yards || 0),
        passing_tds: acc.passing_tds + (week.passing_tds || 0),
        interceptions: acc.interceptions + (week.interceptions || 0),
        fantasy_points_ppr: acc.fantasy_points_ppr + (parseFloat(week.fantasy_points_ppr || '0')),
        games: acc.games + 1,
      }),
      {
        targets: 0,
        receptions: 0,
        receiving_yards: 0,
        receiving_tds: 0,
        carries: 0,
        rushing_yards: 0,
        rushing_tds: 0,
        completions: 0,
        attempts: 0,
        passing_yards: 0,
        passing_tds: 0,
        interceptions: 0,
        fantasy_points_ppr: 0,
        games: 0,
      }
    );
  }, [weeklyStats]);

  const perGameAvg = useMemo(() => {
    if (seasonTotals.games === 0) return null;
    return {
      targets: (seasonTotals.targets / seasonTotals.games).toFixed(1),
      receptions: (seasonTotals.receptions / seasonTotals.games).toFixed(1),
      receiving_yards: (seasonTotals.receiving_yards / seasonTotals.games).toFixed(1),
      carries: (seasonTotals.carries / seasonTotals.games).toFixed(1),
      rushing_yards: (seasonTotals.rushing_yards / seasonTotals.games).toFixed(1),
    };
  }, [seasonTotals]);

  const isReceiver = position === "WR" || position === "TE";
  const isRB = position === "RB";

  // Calculate max values for chart scaling
  const maxYards = weeklyStats.length > 0 ? Math.max(...weeklyStats.map(w => (w.receiving_yards || 0) + (w.rushing_yards || 0))) : 0;
  const maxTargets = weeklyStats.length > 0 ? Math.max(...weeklyStats.map(w => w.targets || 0)) : 0;

  const hasStats = weeklyStats.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{playerName}</h2>
              <p className="text-sm sm:text-base text-gray-700">
                {position} {team && `• ${team}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          {/* Scouting Writeups */}
          {(zapAnalysis || (writeups && writeups.length > 0)) && (() => {
            const sources: { key: string; label: string; content: React.ReactNode }[] = [];
            if (zapAnalysis) sources.push({ key: 'late_round', label: 'Late Round', content: (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-medium text-zinc-500">{zapCategory}{zapScore ? ` · ZAP: ${zapScore.toFixed(1)}` : ''}</span>
                  {zapComps && <span className="text-xs text-zinc-400">Comps: {zapComps}</span>}
                </div>
                <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed">{zapAnalysis}</p>
              </>
            )});
            writeups?.forEach(w => sources.push({ key: w.source, label: w.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), content: (
              <p className="text-xs text-zinc-600 whitespace-pre-line leading-relaxed">{w.analysis_text}</p>
            )}));
            const active = sources.find(s => s.key === writeupTab) || sources[0];
            return (
              <div className="bg-zinc-50 rounded-lg p-4 mb-4">
                {sources.length > 1 && (
                  <div className="flex gap-1 mb-3">
                    {sources.map(s => <button key={s.key} onClick={() => setWriteupTab(s.key)} className={`px-2 py-1 text-[11px] font-medium rounded ${active.key === s.key ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-600'}`}>{s.label}</button>)}
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto">{active.content}</div>
              </div>
            );
          })()}

          {/* Season Selector */}
          <div className="flex gap-2">
            {[2025, 2024, 2023, 2022, 2021].map(year => (
              <button
                key={year}
                onClick={() => setSelectedSeason(year)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedSeason === year
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-4 sm:px-6 py-8 text-center text-gray-500">
            Loading stats...
          </div>
        ) : (
          <>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-4 sm:px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{playerName}</h2>
            <p className="text-sm sm:text-base text-gray-700">
              {position} {team && `• ${team}`} • 2024 Season
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
          </button>
        </div>

        {/* No Stats Available Message */}
        {!hasStats && (
          <div className="px-4 sm:px-6 py-12 text-center">
            <div className="text-gray-400 mb-2">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-2">No Stats Available</h3>
            <p className="text-sm sm:text-base text-gray-700">
              2024 NFL stats are not available for this player.
            </p>
          </div>
        )}

        {/* Season Totals */}
        {hasStats && (
          <div className="px-4 sm:px-6 py-4 border-b bg-gray-50">
            <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900">Season Totals ({seasonTotals.games} games)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {isReceiver && (
                <>
                  <StatCard label="Targets" value={seasonTotals.targets} perGame={perGameAvg?.targets} />
                  <StatCard label="Receptions" value={seasonTotals.receptions} perGame={perGameAvg?.receptions} />
                  <StatCard label="Rec Yards" value={seasonTotals.receiving_yards} perGame={perGameAvg?.receiving_yards} />
                  <StatCard label="Rec TDs" value={seasonTotals.receiving_tds} />
                </>
              )}
              {(isRB || position === "QB") && (
                <>
                  <StatCard label="Carries" value={seasonTotals.carries} perGame={perGameAvg?.carries} />
                  <StatCard label="Rush Yards" value={seasonTotals.rushing_yards} perGame={perGameAvg?.rushing_yards} />
                  <StatCard label="Rush TDs" value={seasonTotals.rushing_tds} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Weekly Chart - Yards */}
        {hasStats && (
          <div className="px-4 sm:px-6 py-4 border-b">
            <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900">Weekly Yards</h3>
            <div className="flex items-end gap-0.5 sm:gap-1 h-40 sm:h-48">
              {weeklyStats.map((week) => {
                const totalYards = (week.receiving_yards || 0) + (week.rushing_yards || 0);
                const heightPercent = maxYards > 0 ? (totalYards / maxYards) * 100 : 0;
                
                return (
                  <div key={week.week} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-32 sm:h-40 relative">
                      <div
                        className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600 flex items-start justify-center pt-1"
                        style={{ height: `${heightPercent}%`, minHeight: totalYards > 0 ? '20px' : '0' }}
                        title={`Week ${week.week}: ${totalYards} yards`}
                      >
                        {totalYards > 0 && (
                          <span className="text-[9px] sm:text-[10px] font-semibold text-white">{totalYards}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-700">{week.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weekly Chart - Targets (for receivers) */}
        {hasStats && isReceiver && (
          <div className="px-4 sm:px-6 py-4 border-b">
            <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900">Weekly Targets</h3>
            <div className="flex items-end gap-0.5 sm:gap-1 h-40 sm:h-48">
              {weeklyStats.map((week) => {
                const targets = week.targets || 0;
                const heightPercent = maxTargets > 0 ? (targets / maxTargets) * 100 : 0;
                
                return (
                  <div key={week.week} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-32 sm:h-40 relative">
                      <div
                        className="w-full bg-green-500 rounded-t transition-all hover:bg-green-600 flex items-start justify-center pt-1"
                        style={{ height: `${heightPercent}%`, minHeight: targets > 0 ? '20px' : '0' }}
                        title={`Week ${week.week}: ${targets} targets`}
                      >
                        {targets > 0 && (
                          <span className="text-[9px] sm:text-[10px] font-semibold text-white">{targets}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] sm:text-xs text-gray-700">{week.week}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Weekly Stats Table */}
        {hasStats && (
          <div className="px-4 sm:px-6 py-4">
            <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900">Week-by-Week</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-900">Week</th>
                    {isReceiver && (
                      <>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">Tgt</th>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">Rec</th>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">Yds</th>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">TD</th>
                      </>
                    )}
                    {(isRB || position === "QB") && (
                      <>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">Car</th>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">Yds</th>
                        <th className="px-2 sm:px-3 py-2 text-right font-semibold text-gray-900">TD</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {weeklyStats.map((week) => (
                    <tr key={week.week} className="border-t hover:bg-gray-50">
                      <td className="px-2 sm:px-3 py-2 text-gray-900">{week.week}</td>
                      {isReceiver && (
                        <>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.targets || 0}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.receptions || 0}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.receiving_yards || 0}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.receiving_tds || 0}</td>
                        </>
                      )}
                      {(isRB || position === "QB") && (
                        <>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.carries || 0}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.rushing_yards || 0}</td>
                          <td className="px-2 sm:px-3 py-2 text-right text-gray-900">{week.rushing_tds || 0}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, perGame }: { label: string; value: number; perGame?: string }) {
  return (
    <div className="bg-white border rounded-lg p-2.5 sm:p-3">
      <div className="text-xs sm:text-sm font-medium text-gray-700">{label}</div>
      <div className="text-xl sm:text-2xl font-bold text-gray-900">
        {value}{perGame === "%" ? "%" : ""}
      </div>
      {perGame && perGame !== "%" && <div className="text-[10px] sm:text-xs text-gray-600">{perGame}/game</div>}
    </div>
  );
}
