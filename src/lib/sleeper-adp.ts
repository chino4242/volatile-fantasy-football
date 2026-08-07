/**
 * Fetch Sleeper ADP (Average Draft Position) data.
 * Uses the projections endpoint which includes ADP for multiple formats.
 */

import { cache } from './cache';

const TTL = 60 * 60 * 1000; // 1 hour cache

export interface SleeperADP {
    player_id: string;
    adp_half_ppr: number | null;
    adp_ppr: number | null;
    adp_std: number | null;
    adp_2qb: number | null;
    adp_dynasty: number | null;
    adp_dynasty_2qb: number | null;
}

export async function getSleeperADP(season?: number): Promise<Map<string, SleeperADP>> {
    const year = season || new Date().getFullYear();
    const cacheKey = `sleeper_adp_${year}`;
    const cached = cache.get<Map<string, SleeperADP>>(cacheKey, TTL);
    if (cached) return cached;

    const positions = ['QB', 'RB', 'WR', 'TE', 'DEF'];
    const adpMap = new Map<string, SleeperADP>();

    await Promise.all(positions.map(async (pos) => {
        try {
            const res = await fetch(`https://api.sleeper.app/projections/nfl/${year}?season_type=regular&position=${pos}`);
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;

            for (const entry of data) {
                const playerId = entry.player_id;
                const stats = entry.stats || {};
                if (!playerId) continue;

                adpMap.set(playerId, {
                    player_id: playerId,
                    adp_half_ppr: stats.adp_half_ppr || null,
                    adp_ppr: stats.adp_ppr || null,
                    adp_std: stats.adp_std || null,
                    adp_2qb: stats.adp_2qb || null,
                    adp_dynasty: stats.adp_dynasty || null,
                    adp_dynasty_2qb: stats.adp_dynasty_2qb || null,
                });
            }
        } catch {}
    }));

    cache.set(cacheKey, adpMap);
    return adpMap;
}
