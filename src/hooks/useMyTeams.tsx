'use client';

/**
 * "My team" per-league memory. The portfolio's team-level insights (weakest
 * starter, contender/rebuild) are about CHINO's team, but which roster is his
 * isn't reliably knowable across all 4 platforms — so he picks it once per
 * league and we persist the choice, mirroring the useAuth localStorage pattern.
 *
 * Key: `${platform}:${leagueId}` → rosterId (the PortfolioTeam.rosterId string).
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'vff_my_teams';

function keyFor(platform: string, leagueId: string): string {
    return `${platform}:${leagueId}`;
}

export function useMyTeams() {
    const [map, setMap] = useState<Record<string, string>>({});
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            setMap(raw ? JSON.parse(raw) : {});
        } catch {
            setMap({});
        } finally {
            setLoaded(true);
        }
    }, []);

    const getMyTeam = useCallback(
        (platform: string, leagueId: string): string | null => map[keyFor(platform, leagueId)] ?? null,
        [map],
    );

    const setMyTeam = useCallback((platform: string, leagueId: string, rosterId: string) => {
        setMap(prev => {
            const next = { ...prev, [keyFor(platform, leagueId)]: rosterId };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                /* ignore quota/availability errors */
            }
            return next;
        });
    }, []);

    return { getMyTeam, setMyTeam, loaded };
}
