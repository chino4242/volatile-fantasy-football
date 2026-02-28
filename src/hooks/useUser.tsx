'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AuthState {
    sleeperUsername: string | null;
    sleeperUserId: string | null;
    fleaflickerUsername: string | null;
    fleaflickerLeagueIds: string[];
    isLoading: boolean;
}

interface AuthContextType extends AuthState {
    loginSleeper: (username: string, userId: string) => void;
    loginFleaflicker: (username: string) => void;
    addFleaflickerLeague: (leagueId: string) => void;
    removeFleaflickerLeague: (leagueId: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEYS = {
    sleeperUsername: 'vff_sleeper_username',
    sleeperUserId: 'vff_sleeper_user_id',
    fleaflickerUsername: 'vff_fleaflicker_username',
    fleaflickerLeagueIds: 'vff_fleaflicker_league_ids',
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        sleeperUsername: null,
        sleeperUserId: null,
        fleaflickerUsername: null,
        fleaflickerLeagueIds: [],
        isLoading: true,
    });

    useEffect(() => {
        try {
            const sUser = localStorage.getItem(STORAGE_KEYS.sleeperUsername);
            const sId = localStorage.getItem(STORAGE_KEYS.sleeperUserId);
            const fUser = localStorage.getItem(STORAGE_KEYS.fleaflickerUsername);
            const fLeagues = localStorage.getItem(STORAGE_KEYS.fleaflickerLeagueIds);

            setState({
                sleeperUsername: sUser,
                sleeperUserId: sId,
                fleaflickerUsername: fUser,
                fleaflickerLeagueIds: fLeagues ? JSON.parse(fLeagues) : [],
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

    const addFleaflickerLeague = (leagueId: string) => {
        try {
            setState(prev => {
                if (prev.fleaflickerLeagueIds.includes(leagueId)) return prev;
                const next = [...prev.fleaflickerLeagueIds, leagueId];
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueIds, JSON.stringify(next));
                return { ...prev, fleaflickerLeagueIds: next };
            });
        } catch (err) {
            console.error('Failed to add fleaflicker league', err);
        }
    };

    const removeFleaflickerLeague = (leagueId: string) => {
        try {
            setState(prev => {
                const next = prev.fleaflickerLeagueIds.filter(id => id !== leagueId);
                localStorage.setItem(STORAGE_KEYS.fleaflickerLeagueIds, JSON.stringify(next));
                return { ...prev, fleaflickerLeagueIds: next };
            });
        } catch (err) {
            console.error('Failed to remove fleaflicker league', err);
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
                isLoading: false,
            });
        } catch (err) {
            console.error('Failed to clear auth from local storage', err);
        }
    };

    return (
        <AuthContext.Provider value={{ ...state, loginSleeper, loginFleaflicker, addFleaflickerLeague, removeFleaflickerLeague, logout }}>
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
