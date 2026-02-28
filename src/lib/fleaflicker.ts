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

const BASE_URL = "https://www.fleaflicker.com/api";

export async function getFleaflickerLeague(leagueId: string): Promise<FleaflickerLeagueData> {
    const response = await fetch(`${BASE_URL}/FetchLeagueRosters?sport=NFL&league_id=${leagueId}`);
    
    if (!response.ok) {
        const text = await response.text();
        console.error('Fleaflicker API error:', response.status, text);
        throw new Error(`Failed to fetch Fleaflicker rosters: ${response.status} - ${text.substring(0, 200)}`);
    }
    
    const data = await response.json();
    
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
                display_name: r.team?.owners?.[0]?.displayName || 
                             r.owners?.[0]?.displayName || 
                             'Unknown'
            }],
            players,
            draftPicks
        };
    }));

    return {
        master_player_list: Array.from(allPlayers).map(name => ({ id: '', full_name: name })),
        rosters
    };
}

async function getFleaflickerTeamPicks(leagueId: string, teamId: number): Promise<FleaflickerDraftPick[]> {
    try {
        const response = await fetch(`${BASE_URL}/FetchTeamPicks?sport=NFL&league_id=${leagueId}&team_id=${teamId}`);
        
        if (!response.ok) {
            console.warn(`Failed to fetch picks for team ${teamId}`);
            return [];
        }
        
        const data = await response.json();
        
        return (data.picks || []).map((pick: any) => ({
            season: pick.season || 0,
            round: pick.slot?.round || 0,
            slot: pick.slot?.slot || 0,
            overall: pick.slot?.overall || 0,
            originalOwner: pick.original_owner?.id || teamId,
            currentOwner: pick.owned_by?.id || teamId
        }));
    } catch (error) {
        console.warn(`Error fetching picks for team ${teamId}:`, error);
        return [];
    }
}
