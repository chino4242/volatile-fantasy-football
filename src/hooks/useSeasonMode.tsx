'use client';

/**
 * Off-season vs in-season mode. A lot of the app (mock drafts, draft plans,
 * cheat sheet, prospects) only matters before the season; other features (game
 * day, trades) only matter once games are being played. This toggle simply
 * HIDES the nav links for the features that don't apply to the current mode —
 * the pages themselves stay reachable by direct URL, nothing is disabled.
 *
 * Persisted in localStorage (solo tool, no backend sync needed), mirroring the
 * useMyTeams/useAuth pattern. A custom event keeps every consumer (AppHeader,
 * home dashboard, LeagueSubNav) in sync the instant the toggle flips.
 */

import { useCallback, useEffect, useState } from 'react';

export type SeasonMode = 'off-season' | 'in-season';
/** Which mode(s) a feature belongs to. 'both' always shows. */
export type FeatureSeason = 'off-season' | 'in-season' | 'both';

const STORAGE_KEY = 'vff_season_mode';
const CHANGE_EVENT = 'vff-season-mode-change';
const DEFAULT_MODE: SeasonMode = 'in-season';

function readMode(): SeasonMode {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw === 'off-season' || raw === 'in-season' ? raw : DEFAULT_MODE;
    } catch {
        return DEFAULT_MODE;
    }
}

export function useSeasonMode() {
    const [mode, setModeState] = useState<SeasonMode>(DEFAULT_MODE);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        setModeState(readMode());
        setLoaded(true);

        // Sync across components (custom event) and across tabs (storage event).
        const onChange = () => setModeState(readMode());
        window.addEventListener(CHANGE_EVENT, onChange);
        window.addEventListener('storage', onChange);
        return () => {
            window.removeEventListener(CHANGE_EVENT, onChange);
            window.removeEventListener('storage', onChange);
        };
    }, []);

    const setMode = useCallback((next: SeasonMode) => {
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            /* ignore quota/availability errors */
        }
        setModeState(next);
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }, []);

    const toggle = useCallback(() => {
        setMode(readMode() === 'in-season' ? 'off-season' : 'in-season');
    }, [setMode]);

    /** Whether a feature tagged with `season` should be visible in the current mode. */
    const showFor = useCallback(
        (season: FeatureSeason): boolean => season === 'both' || season === mode,
        [mode],
    );

    return { mode, setMode, toggle, showFor, loaded };
}
