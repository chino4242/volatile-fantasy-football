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

export interface LeagueData {
    users: SleeperUser[];
    rosters: SleeperRoster[];
}

const BASE_URL = "https://api.sleeper.app/v1";

export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
    const res = await fetch(`${BASE_URL}/league/${leagueId}/users`);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
    const res = await fetch(`${BASE_URL}/league/${leagueId}/rosters`);
    if (!res.ok) throw new Error("Failed to fetch rosters");
    return res.json();
}

export async function getLeagueData(leagueId: string): Promise<LeagueData> {
    const [users, rosters] = await Promise.all([
        getLeagueUsers(leagueId),
        getLeagueRosters(leagueId),
    ]);
    return { users, rosters };
}
