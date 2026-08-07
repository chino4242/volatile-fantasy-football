'use client';

import { useState } from 'react';
import TradeEvaluator from './TradeEvaluator';
import { PendingTrades } from './PendingTrades';
import { BasePlayer as Player } from '@/types/player';

interface TradeSectionProps {
    leagueId: string;
    teamId: string;
    teamName: string;
    format: '1qb' | 'sf';
    platform: 'sleeper' | 'fleaflicker';
    keeperCount?: number;
    playerValueMap: Record<string, { dynastyValue: number; auctionValue: number | null; position: string }>;
    allLeaguePlayers: any[];
    allLeaguePicks: any[];
    myPlayers: Player[];
    allLeaguePlayersForEvaluator: Player[];
    playerOwnershipMap: Map<string, number>;
    rosterToOwnerMap: Map<number, string>;
    currentRosterId: number;
}

export default function TradeSection({
    leagueId, teamId, teamName, format, platform, keeperCount,
    playerValueMap, allLeaguePlayers, allLeaguePicks,
    myPlayers, allLeaguePlayersForEvaluator, playerOwnershipMap, rosterToOwnerMap, currentRosterId,
}: TradeSectionProps) {
    const [initialTrade, setInitialTrade] = useState<{ myAssets: string[]; theirAssets: string[]; theirPlayerId?: string } | undefined>(undefined);

    const handleOpenInEvaluator = (trade: { myAssets: string[]; theirAssets: string[]; theirPlayerId?: string }) => {
        // Force re-trigger by creating a new object reference
        setInitialTrade({ ...trade });
        // Scroll to trade evaluator
        document.getElementById('trade-evaluator-section')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <>
            <PendingTrades
                leagueId={leagueId}
                teamId={teamId}
                teamName={teamName}
                playerValueMap={playerValueMap}
                allLeaguePlayers={allLeaguePlayers}
                allLeaguePicks={allLeaguePicks}
                onOpenInEvaluator={handleOpenInEvaluator}
            />
            <div id="trade-evaluator-section">
                <TradeEvaluator
                    myPlayers={myPlayers}
                    allLeaguePlayers={allLeaguePlayersForEvaluator}
                    playerOwnershipMap={playerOwnershipMap}
                    rosterToOwnerMap={rosterToOwnerMap}
                    currentRosterId={currentRosterId}
                    scoringFormat={format}
                    leagueId={leagueId}
                    platform={platform}
                    keeperCount={keeperCount}
                    initialTrade={initialTrade}
                />
            </div>
        </>
    );
}
