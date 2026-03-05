'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AuthState {
    sleeperUsername: string | null;
    sleeperUserId: string | null;
    fleaflickerUsername: string | null;
    fleaflickerLeagueIds: string[];
    fleaflickerLeagueFormats: Record<string, '1qb' | 'sf'>; // leagueId -> format
    sleeperLeagueFormats: Record<string, '1qb' | 'sf'>; // leagueId -> format
    leagueTypes: Record<string, 'dynasty' | 'keeper' | 'redraft'>; // leagueId -> type
    keeperCounts: Record<string, number>; // leagueId -> keeper count
    isLoading: boolean;
}

interface AuthContextType extends AuthState {
    loginSleeper: (username: string, userId: string) => void;
    loginFleaflicker: (username: string) => void;
    addFleaflickerLeague: (leagueId: string, format: '1qb' | 'sf') => void;
    removeFleaflickerLeague: (leagueId: string) => void;
    setLeagueFormat: (leagueId: string, platform: 'sleeper' | 'fleaflicker', format: '1qb' | 'sf') => void;
    setLeagueType: (leagueId: string, type: 'dynasty' | 'keeper' | 'redraft') => void;
    setKeeperCount: (leagueId: string, count: number) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
    sleeperUsername: 'vff_sleeper_username',
    sleeperUserId: 'vff_sleeper_user_id',
    fleaflickerUsername: 'vff_fleaflicker_username',
    fleaflickerLeagueIds: 'vff_fleaflicker_league_ids',
    fleaflickerLeagueFormats: 'vff_fleaflicker_league_formats',
    sleeperLeagueFormats: 'vff_sleeper_league_formats',
    leagueTypes: 'vff_league_types',
    keeperCounts: 'vff_keeper_counts',
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        sleeperUsername: null,
        sleeperUserId: null,
        fleaflickerUsername: null,
        fleaflickerLeagueIds: [],
        fleaflickerLeagueFormats: {},
        sleeperLeagueFormats: {},
        leagueTypes: {},
        keeperCounts: {},
        isLoading: true,
    });

    useEffect(() => {
        try {
            const sUser = localStorage.getItem(STORAGE_KEYS.sleeperUsername);
            const sId = localStorage.getItem(STORAGE_KEYS.sleeperUserId);
            const fUser = localStorage.getItem(STORAGE_KEYS.fleaflickerUsername);
            const fLeagues = localStorage.getItem(STORAGE_KEYS.fleaflickerLeagueIds);
            const fFormats = localStorage.getItem(STORAGE_KEYS.fleaflickerLeagueFormats);
            const sFormats = localStorage.getItem(STORAGE_KEYS.sleeperLeagueFormats);
            const lTypes = localStorage.getItem(STORAGE_KEYS.leagueTypes);
            const kCounts = localStorage.getItem(STORAGE_KEYS.keeperCounts);

            setState({
                sleeperUsername: sUser,
                sleeperUserId: sId,
                fleaflickerUsername: fUser,
                fleaflickerLeagueIds: fLeagues ? JSON.parse(fLeagues) : [],
                fleaflickerLeagueFormats: fFormats ? JSON.parse(fFormats) : {},
                sleeperLeagueFormats: sFormats ? JSON.parse(sFormats) : {},
                leagueTypes: lTypes ? JSON.parse(lTypes) : {},
                keeperCounts: kCounts ? JSON.parse(kCounts) : {},
                isLoading: false,
            });
        } catch (err) {
            console.error('Failed to load auth from local storage', err);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, []);

    const loginSleeper = (username: string, userId: string) => {
        try {
            localStorage.setItem(STORAGE_KEYS.sleeperUsername, username);
            localStorage.setItem(STORAGE_KEYS.sleeperUserId, userId);
            setState(prev => ({ ...prev, sleeperUsername: username, sleeperUserId: userId }));
        } catch (err) {
            console.error('Failed to save sleeper auth', err);
        }
    };

    const loginFleaflicker = (username: string) => {
        try {
            localStorage.setItem(STORAGE_KEYS.fleaflickerUsername, username);
            setState(prev => ({ ...prev, fleaflickerUsername: username }));
        } catch (err) {
            console.error('Failed to save fleaflicker auth', err);
        }
    };

    const addFleaflickerLeague = (leagueId: string, format: '1qb' | 'sf' = '1qb') => {
        try {
            setState(prev => {
                if (prev.fleaflickerLeagueIds.includes(leagueId)) return prev;
                const nextIds = [...prev.fleaflickerLeagueIds, leagueId];
                const nextFormats = { ...prev.fleaflickerLeagueFormats, [leagueId]: format };
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueIds, JSON.stringify(nextIds));
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueFormats, JSON.stringify(nextFormats));
                return { ...prev, fleaflickerLeagueIds: nextIds, fleaflickerLeagueFormats: nextFormats };
            });
        } catch (err) {
            console.error('Failed to add fleaflicker league', err);
        }
    };

    const removeFleaflickerLeague = (leagueId: string) => {
        try {
            setState(prev => {
                const nextIds = prev.fleaflickerLeagueIds.filter(id => id !== leagueId);
                const nextFormats = { ...prev.fleaflickerLeagueFormats };
                delete nextFormats[leagueId];
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueIds, JSON.stringify(nextIds));
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueFormats, JSON.stringify(nextFormats));
                return { ...prev, fleaflickerLeagueIds: nextIds, fleaflickerLeagueFormats: nextFormats };
            });
        } catch (err) {
            console.error('Failed to remove fleaflicker league', err);
        }
    };

    const setLeagueFormat = (leagueId: string, platform: 'sleeper' | 'fleaflicker', format: '1qb' | 'sf') => {
        try {
            setState(prev => {
                if (platform === 'sleeper') {
                    const nextFormats = { ...prev.sleeperLeagueFormats, [leagueId]: format };
                    localStorage.setItem(STORAGE_KEYS.sleeperLeagueFormats, JSON.stringify(nextFormats));
                    return { ...prev, sleeperLeagueFormats: nextFormats };
                } else {
                    const nextFormats = { ...prev.fleaflickerLeagueFormats, [leagueId]: format };
                    localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueFormats, JSON.stringify(nextFormats));
                    return { ...prev, fleaflickerLeagueFormats: nextFormats };
                }
            });
        } catch (err) {
            console.error('Failed to set league format', err);
        }
    };

    const setLeagueType = (leagueId: string, type: 'dynasty' | 'keeper' | 'redraft') => {
        try {
            setState(prev => {
                const nextTypes = { ...prev.leagueTypes, [leagueId]: type };
                localStorage.setItem(STORAGE_KEYS.leagueTypes, JSON.stringify(nextTypes));
                return { ...prev, leagueTypes: nextTypes };
            });
        } catch (err) {
            console.error('Failed to set league type', err);
        }
    };

    const setKeeperCount = (leagueId: string, count: number) => {
        try {
            setState(prev => {
                const nextCounts = { ...prev.keeperCounts, [leagueId]: count };
                localStorage.setItem(STORAGE_KEYS.keeperCounts, JSON.stringify(nextCounts));
                return { ...prev, keeperCounts: nextCounts };
            });
        } catch (err) {
            console.error('Failed to set keeper count', err);
        }
    };

    const logout = () => {
        try {
            Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
            setState({
                sleeperUsername: null,
                sleeperUserId: null,
                fleaflickerUsername: null,
                fleaflickerLeagueIds: [],
                fleaflickerLeagueFormats: {},
                sleeperLeagueFormats: {},
                leagueTypes: {},
                keeperCounts: {},
                isLoading: false,
            });
        } catch (err) {
            console.error('Failed to clear auth from local storage', err);
        }
    };

    return (
        <AuthContext.Provider value={{ ...state, loginSleeper, loginFleaflicker, addFleaflickerLeague, removeFleaflickerLeague, setLeagueFormat, setLeagueType, setKeeperCount, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
