export interface SleeperUser {
    user_id: string;
    display_name: string;
    avatar: string | null;
}

export interface SleeperRoster {
    roster_id: number;
    owner_id: string;
    players: string[]; // List of Sleeper IDs
    starters: string[];
    settings: {
        wins: number;
        losses: number;
        ties: number;
        fpts: number;
    };
}

export interface SleeperTradedPick {
    season: string;
    round: number;
    roster_id: number;
    previous_owner_id: number;
    owner_id: number;
}

export interface DraftPick {
    season: string;
    round: number;
    originalOwner: number;
    currentOwner: number;
}

export interface LeagueData {
    users: SleeperUser[];
    rosters: SleeperRoster[];
    tradedPicks: SleeperTradedPick[];
}

import { cache, TTL } from './cache';

const BASE_URL = "https://api.sleeper.app/v1";

export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    const cacheKey = `sleeper:users:${leagueId}`;
    const cached = cache.get<SleeperUser[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/users`);
    if (!res.ok) throw new Error("Failed to fetch users");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    const cacheKey = `sleeper:rosters:${leagueId}`;
    const cached = cache.get<SleeperRoster[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/rosters`);
    if (!res.ok) throw new Error("Failed to fetch rosters");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    const cacheKey = `sleeper:picks:${leagueId}`;
    const cached = cache.get<SleeperTradedPick[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/traded_picks`);
    if (!res.ok) throw new Error("Failed to fetch traded picks");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getLeagueData(leagueId: string): Promise<LeagueData> {
    const [users, rosters, tradedPicks] = await Promise.all([
        getLeagueUsers(leagueId),
        getLeagueRosters(leagueId),
        getTradedPicks(leagueId),
    ]);
    return { users, rosters, tradedPicks };
}

export function getPickFantasyCalcId(season: string, round: number): string {
    return `FP_${season}_${round}`;
}

export interface SleeperDraft {
    draft_id: string;
    league_id: string;
    season: string;
    status: string;
    type: string; // 'snake' | 'linear'
    settings: { rounds: number; reversal_round: number; teams: number };
    slot_to_roster_id: Record<string, number> | null;
    draft_order: Record<string, number> | null;
}

export interface SleeperDraftTradedPick {
    season: string;
    round: number;
    roster_id: number;
    previous_owner_id: number;
    owner_id: number;
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
    const cacheKey = `sleeper:drafts:${leagueId}`;
    const cached = cache.get<SleeperDraft[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/drafts`);
    if (!res.ok) throw new Error("Failed to fetch drafts");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getDraftTradedPicks(draftId: string): Promise<SleeperDraftTradedPick[]> {
    const cacheKey = `sleeper:draft_traded_picks:${draftId}`;
    const cached = cache.get<SleeperDraftTradedPick[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/draft/${draftId}/traded_picks`);
    if (!res.ok) return [];
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export function getAllDraftPicks(rosters: SleeperRoster[], tradedPicks: SleeperTradedPick[], currentYear: number = 2026): DraftPick[] {
    const picks: DraftPick[] = [];
    const numTeams = rosters.length;
    const numRounds = 5; // Standard dynasty draft rounds
    const yearsAhead = 3; // Show picks for next 3 years
    
    // Generate all picks for each team for the next few years
    for (let yearOffset = 0; yearOffset < yearsAhead; yearOffset++) {
        const season = (currentYear + yearOffset).toString();
        for (let round = 1; round <= numRounds; round++) {
            rosters.forEach(roster => {
                picks.push({
                    season,
                    round,
                    originalOwner: roster.roster_id,
                    currentOwner: roster.roster_id
                });
            });
        }
    }
    
    // Apply trades
    tradedPicks.forEach(trade => {
        const pick = picks.find(p => 
            p.season === trade.season && 
            p.round === trade.round && 
            p.originalOwner === trade.roster_id
        );
        if (pick) {
            pick.currentOwner = trade.owner_id;
        }
    });
    
    return picks;
}
