export interface FleaflickerPlayer {
    id: string;
    full_name: string;
    team?: string;
}

export interface FleaflickerRosterPlayer extends FleaflickerPlayer {
    // Fleaflicker doesn't provide position, must merge from FantasyCalc
}

export interface FleaflickerRoster {
    id: number;
    name: string;
    owners: Array<{ display_name: string }>;
    players: FleaflickerRosterPlayer[];
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
    const rosters = (data.rosters || []).map((r: any) => {
        const players = (r.players || []).map((p: any) => {
            const player = {
                id: p.proPlayer?.id?.toString() || '',
                full_name: p.proPlayer?.nameFull || '',
                team: p.proPlayer?.proTeamAbbreviation
            };
            if (player.full_name) allPlayers.add(player.full_name);
            return player;
        });
        
        return {
            id: r.team?.id || r.id,
            name: r.team?.name || '',
            owners: [{
                display_name: r.team?.owners?.[0]?.displayName || 
                             r.owners?.[0]?.displayName || 
                             'Unknown'
            }],
            players
        };
    });

    return {
        master_player_list: Array.from(allPlayers).map(name => ({ id: '', full_name: name })),
        rosters
    };
}
