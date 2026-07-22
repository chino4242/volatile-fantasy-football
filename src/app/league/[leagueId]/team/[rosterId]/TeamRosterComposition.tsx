'use client';

import { PositionScarcityChart } from '@/components/PositionScarcityChart';

export function TeamRosterComposition({ players, format, customRankingsMap }: { players: any[]; format: string; customRankingsMap?: Map<string, any[]> }) {
    const rosterPlayers = players.filter(p => p.position !== 'PICK');
    if (rosterPlayers.length === 0) return null;

    return (
        <PositionScarcityChart
            players={rosterPlayers}
            format={format}
            onPlayerClick={() => {}}
            title="Roster Composition"
            topN={30}
            customRankingsMap={customRankingsMap}
        />
    );
}
