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
    const [rosters, players] = await Promise.all([
        fetch(`${BASE_URL}/FetchLeagueRosters?sport=NFL&league_id=${leagueId}`).then(r => {
            if (!r.ok) throw new Error("Failed to fetch Fleaflicker rosters");
            return r.json();
        }),
        fetch(`${BASE_URL}/FetchLeaguePlayers?sport=NFL&league_id=${leagueId}`).then(r => {
            if (!r.ok) throw new Error("Failed to fetch Fleaflicker players");
            return r.json();
        })
    ]);

    return {
        master_player_list: players.players || [],
        rosters: (rosters.rosters || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            owners: r.owners || [],
            players: (r.players || []).map((p: any) => ({
                id: p.proPlayer?.id?.toString() || '',
                full_name: p.proPlayer?.nameFull || '',
                team: p.proPlayer?.proTeamAbbreviation
            }))
        }))
    };
}
