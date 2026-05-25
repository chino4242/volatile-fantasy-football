'use client';

interface PlayerCardProps {
  name: string;
  position: string | null;
  team: string | null;
  value: number | null;
  rank: number | null;
  posRank: number | null;
  trend: number | null;
  tier: number | null;
  signal?: string | null;
  onClick?: () => void;
}

const POS_COLORS: Record<string, string> = {
  QB: 'bg-red-500/20 text-red-400 border-red-500/30',
  RB: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  WR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  TE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  PICK: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

const SIGNAL_COLORS: Record<string, string> = {
  'STRONG BUY': 'text-green-400',
  'BUY': 'text-green-500',
  'HOLD': 'text-zinc-400',
  'SELL': 'text-red-500',
  'STRONG SELL': 'text-red-400',
};

export default function PlayerCard({ name, position, team, value, rank, posRank, trend, tier, signal, onClick }: PlayerCardProps) {
  const posColor = POS_COLORS[position || ''] || 'bg-zinc-700/20 text-zinc-400 border-zinc-600/30';

  return (
    <div onClick={onClick} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition cursor-pointer">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${posColor}`}>{position}</span>
          <span className="text-sm font-semibold text-white truncate">{name}</span>
          {team && <span className="text-[10px] text-zinc-500">{team}</span>}
        </div>
        {signal && <span className={`text-[9px] font-bold uppercase ${SIGNAL_COLORS[signal] || 'text-zinc-500'}`}>{signal}</span>}
      </div>
      <div className="flex items-center gap-4 text-xs">
        <div>
          <span className="text-zinc-500">Value: </span>
          <span className="text-white font-semibold">{value?.toLocaleString() || '—'}</span>
        </div>
        {rank && (
          <div>
            <span className="text-zinc-500">#</span>
            <span className="text-zinc-300">{rank}</span>
          </div>
        )}
        {posRank && (
          <div>
            <span className="text-zinc-500">{position}</span>
            <span className="text-zinc-300">{posRank}</span>
          </div>
        )}
        {trend !== null && trend !== undefined && trend !== 0 && (
          <div className={trend > 0 ? 'text-emerald-400' : 'text-red-400'}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}
          </div>
        )}
        {tier && (
          <div>
            <span className="text-zinc-500">T</span>
            <span className="text-zinc-300">{tier}</span>
          </div>
        )}
      </div>
    </div>
  );
}
