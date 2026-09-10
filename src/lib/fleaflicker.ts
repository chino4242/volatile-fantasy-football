export interface FleaflickerPlayer {
    id: string;
    full_name: string;
    team?: string;
}

export interface FleaflickerRosterPlayer extends FleaflickerPlayer {
    // Fleaflicker doesn't provide position, must merge from FantasyCalc.
    // Lineup slot / starter status is NOT here — it's in the boxscore.
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
        fetch(`${BASE_URL}/FetchLeagueRosters?sport=NFL&league_id=${leagueId}`, { cache: 'no-store' }),
        fetch(`${BASE_URL}/FetchLeagueStandings?sport=NFL&league_id=${leagueId}`, { cache: 'no-store' })
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
            // NOTE: the roster endpoint does NOT include lineup slot info — who is
            // *started* comes from the boxscore (see getFleaflickerLineup).
            const player = {
                id: p.proPlayer?.id?.toString() || '',
                full_name: p.proPlayer?.nameFull || '',
                team: p.proPlayer?.proTeamAbbreviation,
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
        const response = await fetch(`${BASE_URL}/FetchTeamPicks?sport=NFL&league_id=${leagueId}&team_id=${teamId}`, { cache: 'no-store' });

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

export interface FleaflickerLeagueInfo {
    id: string;
    name: string;
}

export async function getFleaflickerLeagueInfo(leagueId: string): Promise<FleaflickerLeagueInfo> {
    const cacheKey = `fleaflicker:league_info:${leagueId}`;
    const cached = cache.get<FleaflickerLeagueInfo>(cacheKey, TTL.FLEAFLICKER_LEAGUE);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/FetchLeagueStandings?sport=NFL&league_id=${leagueId}`, { cache: 'no-store' });
    if (!res.ok) {
        return { id: leagueId, name: `League ${leagueId}` };
    }
    const data = await res.json();
    const info: FleaflickerLeagueInfo = {
        id: String(data.league?.id ?? leagueId),
        name: data.league?.name ?? `League ${leagueId}`,
    };
    cache.set(cacheKey, info);
    return info;
}

export interface RosterSlots { QB: number; RB: number; WR: number; TE: number; FLEX: number; DST: number; PK: number; total?: number }


export async function getFleaflickerRosterSlots(leagueId: string): Promise<RosterSlots> {
    const cacheKey = `fleaflicker:slots:${leagueId}`;
    const cached = cache.get<RosterSlots>(cacheKey, TTL.FLEAFLICKER_LEAGUE);
    if (cached) return cached;

    const res = await fetch(`${BASE_URL}/FetchLeagueStandings?sport=NFL&league_id=${leagueId}`, { cache: 'no-store' });
    if (!res.ok) return { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, DST: 1, PK: 1 };
    const data = await res.json();
    const rosterReq = data?.league?.rosterRequirements || {};
    const positions = rosterReq.positions || [];
    const slots: RosterSlots = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, DST: 0, PK: 0 };
    // Normalize Fleaflicker eligibility tokens to our canonical slot keys.
    const norm = (t: string): keyof RosterSlots | null => {
        const u = (t || '').toUpperCase();
        if (u === 'QB' || u === 'RB' || u === 'WR' || u === 'TE') return u as keyof RosterSlots;
        if (u === 'D/ST' || u === 'DST' || u === 'DEF' || u === 'D') return 'DST';
        if (u === 'K' || u === 'PK') return 'PK';
        return null;
    };
    for (const p of positions) {
        if (p.group !== 'START' || !p.start) continue;
        const elig = p.eligibility || [];
        if (elig.length === 1) {
            const key = norm(elig[0]);
            if (key) slots[key] += p.start;
            else slots.FLEX += p.start; // unknown single-eligibility slot → treat as flex-ish
        } else if (elig.length > 1) {
            slots.FLEX += p.start;
        }
    }
    // Total draftable roster size (starters + bench, excludes IR/reserve). Fleaflicker exposes
    // rosterSize directly; used to cap how many picks a team can actually use.
    const rosterSize = typeof rosterReq.rosterSize === 'number' ? rosterReq.rosterSize : undefined;
    slots.total = rosterSize;
    cache.set(cacheKey, slots);
    return slots;
}

// --- Trades ---

export interface FleaflickerTradeTeam {
    teamId: number;
    teamName: string;
    playersObtained: { id: number; name: string; position: string; team: string }[];
    picksObtained: { season: number; round: number; originalOwnerName: string }[];
    playersReleased: { id: number; name: string; position: string }[];
}

export interface FleaflickerTrade {
    id: number;
    status: string;
    proposedOn: number;
    teams: FleaflickerTradeTeam[];
}

export async function getFleaflickerTrades(leagueId: string, filter: 'TRADES_OWNER_OPEN' | 'TRADES_UNDER_REVIEW' | 'TRADES_COMPLETED' = 'TRADES_OWNER_OPEN'): Promise<FleaflickerTrade[]> {
    try {
        const res = await fetch(`${BASE_URL}/FetchTrades?sport=NFL&league_id=${leagueId}&filter=${filter}`, { cache: 'no-store' });
        if (!res.ok) return [];

        const data = await res.json();
        if (!data.trades || !Array.isArray(data.trades)) return [];

        return data.trades.map((t: any) => ({
            id: t.id,
            status: t.status || 'TRADE_STATUS_OPEN',
            proposedOn: t.proposed_on ? parseInt(t.proposed_on) : 0,
            teams: (t.teams || []).map((tt: any) => ({
                teamId: tt.team?.id || 0,
                teamName: tt.team?.name || 'Unknown',
                playersObtained: (tt.players_obtained || []).map((p: any) => ({
                    id: p.pro_player?.id || 0,
                    name: p.pro_player?.name_full || p.pro_player?.name_short || '',
                    position: p.pro_player?.position || '',
                    team: p.pro_player?.pro_team_abbreviation || '',
                })),
                picksObtained: (tt.picks_obtained || []).map((pk: any) => ({
                    season: pk.season || 0,
                    round: pk.slot?.round || 0,
                    originalOwnerName: pk.original_owner?.name || '',
                })),
                playersReleased: (tt.players_released || []).map((p: any) => ({
                    id: p.pro_player?.id || 0,
                    name: p.pro_player?.name_full || p.pro_player?.name_short || '',
                    position: p.pro_player?.position || '',
                })),
            })),
        }));
    } catch (error) {
        console.error('Failed to fetch Fleaflicker trades:', error);
        return [];
    }
}



/**
 * A team's CURRENT starting lineup + true slot config for a week, from the
 * boxscore endpoint (the roster endpoint does NOT expose lineup slots). Returns
 * the set of starting pro-player ids and the ordered roster_positions tokens.
 *
 * The scoreboard lists games; each game has home/away team ids matching the
 * roster/team id. The boxscore's `lineups` has a START group whose slots carry
 * the position eligibility and the assigned player per side.
 */
export async function getFleaflickerLineup(
    leagueId: string,
    teamId: number,
    week: number,
): Promise<{ starterProIds: Set<string>; rosterPositions: string[] } | null> {
    const cacheKey = `fleaflicker:lineup:${leagueId}:${teamId}:${week}`;
    const cached = cache.get<{ starterProIds: string[]; rosterPositions: string[] }>(cacheKey, TTL.FLEAFLICKER_ROSTERS);
    if (cached) return { starterProIds: new Set(cached.starterProIds), rosterPositions: cached.rosterPositions };

    try {
        const sb = await fetch(`${BASE_URL}/FetchLeagueScoreboard?sport=NFL&league_id=${leagueId}&scoring_period=${week}`, { cache: 'no-store' }).then(r => r.json());
        // Find the game containing this team, and which side it is.
        let gameId: number | null = null;
        let side: 'home' | 'away' | null = null;
        for (const g of sb?.games || []) {
            if (g.home?.id === teamId) { gameId = g.id; side = 'home'; break; }
            if (g.away?.id === teamId) { gameId = g.id; side = 'away'; break; }
        }
        if (gameId == null || !side) return null;

        const box = await fetch(`${BASE_URL}/FetchLeagueBoxscore?sport=NFL&league_id=${leagueId}&fantasy_game_id=${gameId}`, { cache: 'no-store' }).then(r => r.json());
        const starterProIds = new Set<string>();
        const rosterPositions: string[] = [];
        for (const grp of box?.lineups || []) {
            if (grp.group !== 'START') continue;
            for (const slot of grp.slots || []) {
                const elig: string[] = (slot.position?.eligibility || []).map((e: string) => e.toUpperCase());
                rosterPositions.push(slotTokenFromEligibility(elig, slot.position?.label));
                const pid = slot[side]?.proPlayer?.id;
                if (pid != null) starterProIds.add(String(pid));
            }
        }
        if (rosterPositions.length === 0) return null;
        cache.set(cacheKey, { starterProIds: [...starterProIds], rosterPositions });
        return { starterProIds, rosterPositions };
    } catch {
        return null;
    }
}

/** All teams' current lineups for a week in one batch (1 scoreboard + N boxscore
 *  calls). Returns Map<teamId → {starterProIds, rosterPositions}>. Used by the
 *  portfolio so the roll-up's lineup alert is accurate for Fleaflicker. */
export async function getFleaflickerWeekLineups(
    leagueId: string,
    week: number,
): Promise<Map<number, { starterProIds: Set<string>; rosterPositions: string[] }>> {
    const out = new Map<number, { starterProIds: Set<string>; rosterPositions: string[] }>();
    try {
        const sb = await fetch(`${BASE_URL}/FetchLeagueScoreboard?sport=NFL&league_id=${leagueId}&scoring_period=${week}`, { cache: 'no-store' }).then(r => r.json());
        const games = sb?.games || [];
        await Promise.all(games.map(async (g: any) => {
            try {
                const box = await fetch(`${BASE_URL}/FetchLeagueBoxscore?sport=NFL&league_id=${leagueId}&fantasy_game_id=${g.id}`, { cache: 'no-store' }).then(r => r.json());
                for (const side of ['home', 'away'] as const) {
                    const teamId = g[side]?.id;
                    if (teamId == null) continue;
                    const starterProIds = new Set<string>();
                    const rosterPositions: string[] = [];
                    for (const grp of box?.lineups || []) {
                        if (grp.group !== 'START') continue;
                        for (const slot of grp.slots || []) {
                            const elig: string[] = (slot.position?.eligibility || []).map((e: string) => e.toUpperCase());
                            rosterPositions.push(slotTokenFromEligibility(elig, slot.position?.label));
                            const pid = slot[side]?.proPlayer?.id;
                            if (pid != null) starterProIds.add(String(pid));
                        }
                    }
                    if (rosterPositions.length > 0) out.set(teamId, { starterProIds, rosterPositions });
                }
            } catch { /* skip this game */ }
        }));
    } catch { /* no scoreboard */ }
    return out;
}

/** A week's head-to-head matchups with each side's STARTER player names (for
 *  name-bridging to sleeper_id). Returns one entry per game with both teams'
 *  ids + names + starter names. Used by the rooting guide. */
export interface FleaflickerMatchup {
    homeTeamId: number;
    awayTeamId: number;
    homeTeamName: string;
    awayTeamName: string;
    homeStarterNames: string[];
    awayStarterNames: string[];
    /** Live fantasy points per starter, keyed by player nameFull (bridged to
     *  sleeper_id by the caller). Present once games are live; empty pre-game. */
    pointsByName: Record<string, number>;
}

export async function getFleaflickerWeekMatchups(leagueId: string, week: number): Promise<FleaflickerMatchup[]> {
    const out: FleaflickerMatchup[] = [];
    try {
        const sb = await fetch(`${BASE_URL}/FetchLeagueScoreboard?sport=NFL&league_id=${leagueId}&scoring_period=${week}`, { cache: 'no-store' }).then(r => r.json());
        const games = sb?.games || [];
        await Promise.all(games.map(async (g: any) => {
            try {
                const box = await fetch(`${BASE_URL}/FetchLeagueBoxscore?sport=NFL&league_id=${leagueId}&fantasy_game_id=${g.id}`, { cache: 'no-store' }).then(r => r.json());
                const homeStarterNames: string[] = [];
                const awayStarterNames: string[] = [];
                const pointsByName: Record<string, number> = {};
                // Fleaflicker exposes live scored fantasy points per player as
                // `viewingActualPoints: {value}` (mirrors viewingProjectedPoints).
                const readPts = (side: any) => {
                    const name = side?.proPlayer?.nameFull;
                    const val = side?.viewingActualPoints?.value;
                    if (name && typeof val === 'number') pointsByName[name] = val;
                };
                for (const grp of box?.lineups || []) {
                    if (grp.group !== 'START') continue;
                    for (const slot of grp.slots || []) {
                        const hn = slot.home?.proPlayer?.nameFull;
                        const an = slot.away?.proPlayer?.nameFull;
                        if (hn) homeStarterNames.push(hn);
                        if (an) awayStarterNames.push(an);
                        readPts(slot.home);
                        readPts(slot.away);
                    }
                }
                out.push({
                    homeTeamId: g.home?.id,
                    awayTeamId: g.away?.id,
                    homeTeamName: g.home?.name || `Team ${g.home?.id}`,
                    awayTeamName: g.away?.name || `Team ${g.away?.id}`,
                    homeStarterNames,
                    awayStarterNames,
                    pointsByName,
                });
            } catch { /* skip this game */ }
        }));
    } catch { /* no scoreboard */ }
    return out;
}

/** Map a Fleaflicker slot's eligibility set → an optimizer roster_positions token. */
function slotTokenFromEligibility(elig: string[], label?: string): string {
    // Fleaflicker's flex eligibility often includes K; the optimizer's FLEX is
    // RB/WR/TE — K in a flex is rare in practice, so treat multi-eligibility
    // (non-QB) as FLEX, QB-inclusive as SUPER_FLEX.
    if (elig.length <= 1) return (label || elig[0] || 'BN').toUpperCase();
    const set = new Set(elig);
    if (set.has('QB')) return 'SUPER_FLEX';
    if (set.has('WR') && set.has('TE') && !set.has('RB')) return 'WR/TE';
    if (set.has('RB') && set.has('WR') && !set.has('TE')) return 'WR/RB';
    return 'FLEX';
}
