'use client';

import { useState } from 'react';
import ViewToggle from '@/components/ViewToggle';
import PlayerCard from '@/components/PlayerCard';
import { TeamRosterTable } from './TeamRosterTable';

interface Player {
  sleeper_id: string;
  full_name: string;
  position: string | null;
  team: string | null;
  fc_value: number | null;
  fc_rank_sf: number | null;
  fc_rank_1qb: number | null;
  fc_position_rank_sf: number | null;
  fc_position_rank_1qb: number | null;
  fc_trend_30_day: number | null;
  rank_sf_tier: number | null;
  rank_1qb_tier: number | null;
}

export default function TeamRosterView(props: any) {
  const [displayMode, setDisplayMode] = useState<'table' | 'card'>('table');
  const scoringFormat = props.scoringFormat || 'sf';
  const players: Player[] = props.players || [];

  return (
    <div>
      {/* Toggle — visible on small screens */}
      <div className="flex justify-end mb-2 md:hidden">
        <ViewToggle storageKey="vff_roster_view" onChange={setDisplayMode} />
      </div>

      {displayMode === 'card' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {players.map(player => (
            <PlayerCard
              key={player.sleeper_id}
              name={player.full_name}
              position={player.position}
              team={player.team}
              value={scoringFormat === 'sf' ? player.fc_value : (player as any).fc_value_1qb || player.fc_value}
              rank={scoringFormat === 'sf' ? player.fc_rank_sf : player.fc_rank_1qb}
              posRank={scoringFormat === 'sf' ? player.fc_position_rank_sf : player.fc_position_rank_1qb}
              trend={player.fc_trend_30_day}
              tier={scoringFormat === 'sf' ? player.rank_sf_tier : player.rank_1qb_tier}
            />
          ))}
        </div>
      ) : (
        <TeamRosterTable {...props} />
      )}
    </div>
  );
}
