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

    const res = await fetch(`${BASE_URL}/league/${leagueId}/users`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch users");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    const cacheKey = `sleeper:rosters:${leagueId}`;
    const cached = cache.get<SleeperRoster[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/rosters`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch rosters");
    const data = await res.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
    const cacheKey = `sleeper:picks:${leagueId}`;
    const cached = cache.get<SleeperTradedPick[]>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/league/${leagueId}/traded_picks`, { cache: 'no-store' });
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

/**
 * Resolve the current season's league ID by following the Sleeper league chain.
 * Sleeper creates a new league_id each season linked via previous_league_id.
 * Returns the current season's draft if available, otherwise null.
 */
export async function getCurrentSeasonDraft(leagueId: string): Promise<{ draft: SleeperDraft; leagueId: string } | null> {
    const cacheKey = `sleeper:current_season_draft:${leagueId}`;
    const cached = cache.get<{ draft: SleeperDraft; leagueId: string }>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    // Check if this league's draft is already current
    const drafts = await getLeagueDrafts(leagueId);
    const upcoming = drafts.find(d => d.status === 'pre_draft' || d.status === 'drafting');
    if (upcoming) {
        const result = { draft: upcoming, leagueId };
        cache.set(cacheKey, result);
        return result;
    }

    // League is complete — find the current season's league via a user
    const users = await getLeagueUsers(leagueId);
    if (!users.length) return null;

    const currentYear = new Date().getFullYear();
    const res = await fetch(`${BASE_URL}/user/${users[0].user_id}/leagues/nfl/${currentYear}`);
    if (!res.ok) return null;
    const userLeagues = await res.json();
    if (!Array.isArray(userLeagues)) return null;

    const nextLeague = userLeagues.find((l: any) => l.previous_league_id === leagueId);
    if (!nextLeague) return null;

    const nextDrafts = await getLeagueDrafts(nextLeague.league_id);
    const nextDraft = nextDrafts.find(d => d.status === 'pre_draft' || d.status === 'drafting') || nextDrafts[0];
    if (!nextDraft) return null;

    // Fetch draft directly to get full details (slot_to_roster_id not always in list endpoint)
    const draftRes = await fetch(`${BASE_URL}/draft/${nextDraft.draft_id}`);
    if (!draftRes.ok) return null;
    const fullDraft = await draftRes.json() as SleeperDraft;

    const result = { draft: fullDraft, leagueId: nextLeague.league_id };
    cache.set(cacheKey, result);
    return result;
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
