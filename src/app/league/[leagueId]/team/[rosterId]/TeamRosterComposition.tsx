'use client';

import { PositionScarcityChart } from '@/components/PositionScarcityChart';

export function TeamRosterComposition({ players, format }: { players: any[]; format: string }) {
    const rosterPlayers = players.filter(p => p.position !== 'PICK');
    if (rosterPlayers.length === 0) return null;

    return (
        <PositionScarcityChart
            players={rosterPlayers}
            format={format}
            onPlayerClick={() => {}}
            title="Roster Composition"
            topN={30}
        />
    );
}
