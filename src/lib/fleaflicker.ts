export interface FleaflickerPlayer {
    id: string;
    full_name: string;
    team?: string;
}

export interface FleaflickerRosterPlayer extends FleaflickerPlayer {
    // Fleaflicker doesn't provide position, must merge from FantasyCalc
}

export interface FleaflickerDraftPick {
    season: number;
    round: number;
    slot: number;
    overall: number;
    originalOwner: number;
    currentOwner: number;
}

export interface FleaflickerRoster {
    id: number;
    name: string;
    owners: Array<{ display_name: string }>;
    players: FleaflickerRosterPlayer[];
    draftPicks: FleaflickerDraftPick[];
}

export interface FleaflickerLeagueData {
    master_player_list: FleaflickerPlayer[];
    rosters: FleaflickerRoster[];
}

import { cache, TTL } from './cache';

const BASE_URL = "https://www.fleaflicker.com/api";

export async function getFleaflickerLeague(leagueId: string): Promise<FleaflickerLeagueData> {
    const cacheKey = `fleaflicker:league:${leagueId}`;
    const cached = cache.get<FleaflickerLeagueData>(cacheKey, TTL.FLEAFLICKER_LEAGUE);
    if (cached) return cached;

    const [rostersResponse, standingsResponse] = await Promise.all([
        fetch(`${BASE_URL}/FetchLeagueRosters?sport=NFL&league_id=${leagueId}`),
        fetch(`${BASE_URL}/FetchLeagueStandings?sport=NFL&league_id=${leagueId}`)
    ]);

    if (!rostersResponse.ok || !standingsResponse.ok) {
        const text = await rostersResponse.text();
        console.error('Fleaflicker API error:', rostersResponse.status, text);
        throw new Error(`Failed to fetch Fleaflicker data: ${rostersResponse.status} - ${text.substring(0, 200)}`);
    }

    const [data, standingsData] = await Promise.all([
        rostersResponse.json(),
        standingsResponse.json()
    ]);

    const ownerMap = new Map<number, string>();
    if (standingsData.divisions) {
        standingsData.divisions.forEach((d: any) => {
            (d.teams || []).forEach((t: any) => {
                if (t.owners && t.owners[0]) {
                    ownerMap.set(t.id, t.owners[0].displayName);
                }
            });
        });
    } else if (standingsData.teams) {
        standingsData.teams.forEach((t: any) => {
            if (t.owners && t.owners[0]) {
                ownerMap.set(t.id, t.owners[0].displayName);
            }
        });
    }

    // Extract all unique players from rosters
    const allPlayers = new Set<string>();
    const rosters = await Promise.all((data.rosters || []).map(async (r: any) => {
        const teamId = r.team?.id || r.id;
        const players = (r.players || []).map((p: any) => {
            const player = {
                id: p.proPlayer?.id?.toString() || '',
                full_name: p.proPlayer?.nameFull || '',
                team: p.proPlayer?.proTeamAbbreviation
            };
            if (player.full_name) allPlayers.add(player.full_name);
            return player;
        });

        // Fetch draft picks for this team
        const draftPicks = await getFleaflickerTeamPicks(leagueId, teamId);

        return {
            id: teamId,
            name: r.team?.name || '',
            owners: [{
                display_name: ownerMap.get(teamId) ||
                    r.team?.owners?.[0]?.displayName ||
                    r.owners?.[0]?.displayName ||
                    'Unknown'
            }],
            players,
            draftPicks
        };
    }));

    const result = {
        master_player_list: Array.from(allPlayers).map(name => ({ id: '', full_name: name })),
        rosters
    };

    cache.set(cacheKey, result);
    return result;
}

export async function getFleaflickerTeamPicks(leagueId: string, teamId: number): Promise<FleaflickerDraftPick[]> {
    const cacheKey = `fleaflicker:picks:${leagueId}:${teamId}`;
    const cached = cache.get<FleaflickerDraftPick[]>(cacheKey, TTL.FLEAFLICKER_ROSTERS);
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/FetchTeamPicks?sport=NFL&league_id=${leagueId}&team_id=${teamId}`);

        if (!response.ok) {
            console.warn(`Failed to fetch picks for team ${teamId}`);
            return [];
        }

        const data = await response.json();

        const picks = (data.picks || [])
            .filter((pick: any) => (pick.ownedBy?.id || teamId) === teamId) // Only keep picks currently owned by this team
            .map((pick: any) => ({
                season: pick.season || 0,
                round: pick.slot?.round || 0,
                slot: pick.slot?.slot || 0,
                overall: pick.slot?.overall || 0,
                originalOwner: pick.originalOwner?.id || teamId,
                currentOwner: pick.ownedBy?.id || teamId
            }));

        cache.set(cacheKey, picks);
        return picks;
    } catch (error) {
        console.warn(`Error fetching picks for team ${teamId}:`, error);
        return [];
    }
}
