/**
 * Game-Day Rooting Guide — pure aggregation engine.
 *
 * Given, per league, my STARTING players and my head-to-head OPPONENT's starting
 * players for the current week, plus a lookup that maps each player to their real
 * NFL game, produce a per-game list of who I'm rooting FOR (on my team) and
 * AGAINST (my opponent started them) — deduped across leagues, overlap-aware.
 *
 * A single NFL player can be FOR in one league and AGAINST in another; that
 * overlap is the whole point and must be preserved (side = 'both').
 *
 * This module is PURE (no I/O) so it's directly unit-testable. The route feeds
 * it resolved starter sets + the weekly game/team lookup.
 */

export type RootingSide = 'for' | 'against' | 'both' | 'bench';

/** Per-league resolved input: my starters vs my weekly opponent's starters. */
export interface LeagueMatchupInput {
    leagueId: string;
    leagueName: string;
    platform: string;
    /** sleeper_ids in MY starting lineup this week. */
    myStarterIds: string[];
    /** sleeper_ids in my H2H OPPONENT's starting lineup this week. */
    oppStarterIds: string[];
    /** sleeper_ids on MY bench this week (rostered by me, not started). Only the
     *  platforms that expose the full roster populate this (Sleeper/Yahoo/MyFFPC);
     *  Fleaflicker omits it. Used for the "My bench" strip on each game card. */
    myBenchIds?: string[];
    /** Opponent team display name (for context), optional. */
    opponentName?: string;
    /** Data freshness: ISO date string of the last DB sync (Yahoo/MyFFPC), or
     *  'live' for API-backed platforms (Sleeper/Fleaflicker) fetched per request. */
    lastSynced?: string | 'live' | null;
    /** Live per-player fantasy points (sleeper_id → points) for this league, when
     *  the platform exposes them (Sleeper/Fleaflicker). Absent → no live points. */
    pointsById?: Record<string, number>;
}

/** Minimal player metadata + NFL-game placement for a sleeper_id. */
export interface PlayerGameInfo {
    full_name: string;
    position: string | null;
    /** The player's NFL team abbr. */
    nflTeam: string | null;
    /** The player's opponent NFL team abbr this week (for game grouping). */
    nflOpponent: string | null;
}

export interface RootingPlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    nflTeam: string | null;
    side: RootingSide;
    /** League names where this player is on MY starting lineup. */
    forLeagues: string[];
    /** League names where this player is my opponent's starter. */
    againstLeagues: string[];
    /** League names where this player is on MY bench (rostered, not started).
     *  Only meaningful when the player is NOT also a FOR/AGAINST starter — a
     *  starter always takes precedence over bench. */
    benchLeagues: string[];
    /** Live fantasy points for this player (computed half-PPR from ESPN box
     *  scores), or null when not playing / no stats yet. */
    points: number | null;
    /** Light usage signal (targets + carries) and a short label, when available. */
    usage?: number | null;
    usageLabel?: string | null;
}

export interface RootingGame {
    /** Unordered NFL team pair key, e.g. "DET@GB". */
    gameKey: string;
    /** The two NFL teams in the game (sorted). "UNK" bucket for unknown game. */
    teams: [string, string];
    players: RootingPlayer[];
    /** Convenience counts for sorting/urgency. */
    forCount: number;
    againstCount: number;
    /** Live fantasy-point totals: sum of points for players I'm rooting FOR /
     *  AGAINST in this game (a 'both' player counts on both sides). null-safe. */
    forPoints: number;
    againstPoints: number;
    /** Day/slot metadata (stamped from the NFL schedule, when available). */
    slot?: string | null;
    slotOrder?: number | null;
    weekday?: string | null;
    gametime?: string | null;
    kickoffSort?: number | null;
    /** Live NFL game-state (stamped from ESPN scoreboard by the route). */
    live?: {
        state: 'pre' | 'in' | 'post';
        homeScore: number | null;
        awayScore: number | null;
        /** Whether teams[0]/teams[1] are home — for aligning scores to the pair. */
        shortLabel: string;
        /** Score aligned to teams[0] and teams[1] respectively. */
        teamScores: [number | null, number | null];
    } | null;
}

/** One data source (league) + how fresh its data is, for the freshness line. */
export interface RootingSource {
    leagueName: string;
    platform: string;
    /** ISO date of last sync (Yahoo/MyFFPC), or 'live' (Sleeper/Fleaflicker). */
    lastSynced: string | 'live' | null;
}

export interface RootingGuide {
    week: number | null;
    games: RootingGame[];
    /** Leagues that couldn't be resolved (no matchup/my-team), for UI hinting. */
    unresolvedLeagues: string[];
    /** Per-league data-freshness, for the "last refreshed" line. */
    sources: RootingSource[];
}

const UNKNOWN_GAME = 'UNKNOWN';

/** Unordered NFL-game key from a team + its opponent. */
export function gameKeyFor(team: string | null, opponent: string | null): string {
    if (!team && !opponent) return UNKNOWN_GAME;
    if (!team) return UNKNOWN_GAME;
    if (!opponent) return team; // team known but no opponent → its own bucket
    return [team.toUpperCase(), opponent.toUpperCase()].sort().join('@');
}

/**
 * Build the rooting guide. `gameInfo` maps sleeper_id → PlayerGameInfo; players
 * missing from it fall into the UNKNOWN game bucket (never dropped).
 */
/** Live per-player scoring (computed centrally, e.g. from ESPN box scores). */
export interface LivePoints {
    points: number;
    usage?: number | null;
    usageLabel?: string | null;
}

export function buildRootingGuide(
    leagues: LeagueMatchupInput[],
    gameInfo: Map<string, PlayerGameInfo>,
    week: number | null,
    livePoints?: Map<string, LivePoints>,
): RootingGuide {
    // Accumulate per-sleeper_id: which leagues have it FOR vs AGAINST vs BENCH, + points.
    interface Acc { forLeagues: string[]; againstLeagues: string[]; benchLeagues: string[]; points: number | null; usage: number | null; usageLabel: string | null; }
    const acc = new Map<string, Acc>();
    const ensure = (id: string): Acc => {
        let a = acc.get(id);
        if (!a) { a = { forLeagues: [], againstLeagues: [], benchLeagues: [], points: null, usage: null, usageLabel: null }; acc.set(id, a); }
        return a;
    };

    for (const lg of leagues) {
        for (const id of new Set(lg.myStarterIds)) ensure(id).forLeagues.push(lg.leagueName);
        for (const id of new Set(lg.oppStarterIds)) ensure(id).againstLeagues.push(lg.leagueName);
        // My bench (rostered, not started) — shown as a distinct strip per game.
        // These ARE players I want surfaced, so ensure() here is intentional.
        for (const id of new Set(lg.myBenchIds || [])) ensure(id).benchLeagues.push(lg.leagueName);
        // Fallback live points from a platform (only used when no central
        // livePoints map is supplied for that player). ONLY annotate players who
        // are already a rooting interest — pointsById covers a platform's entire
        // roster (Sleeper players_points includes bench), so ensure() here would
        // inject every bench player into the guide (no side, no game → UNKNOWN).
        if (lg.pointsById) {
            for (const [id, pts] of Object.entries(lg.pointsById)) {
                if (typeof pts !== 'number') continue;
                const a = acc.get(id);
                if (!a) continue;
                a.points = a.points == null ? pts : Math.max(a.points, pts);
            }
        }
    }

    // Central live points (computed uniformly from ESPN) take precedence — a
    // consistent number for every player regardless of platform. Only ANNOTATE
    // players who are already a rooting interest (FOR/AGAINST in some league);
    // never create new acc entries here, or every ESPN-scored player league-wide
    // would leak into the guide (with no side + no gameInfo → UNKNOWN bucket).
    if (livePoints) {
        for (const [id, lp] of livePoints) {
            const a = acc.get(id);
            if (!a) continue;
            a.points = lp.points;
            a.usage = lp.usage ?? null;
            a.usageLabel = lp.usageLabel ?? null;
        }
    }

    // Build RootingPlayers, then bucket into games.
    const gamesByKey = new Map<string, RootingGame>();
    const ensureGame = (key: string, teams: [string, string]): RootingGame => {
        let g = gamesByKey.get(key);
        if (!g) { g = { gameKey: key, teams, players: [], forCount: 0, againstCount: 0, forPoints: 0, againstPoints: 0 }; gamesByKey.set(key, g); }
        return g;
    };

    for (const [id, a] of acc) {
        const info = gameInfo.get(id);
        const isFor = a.forLeagues.length > 0;
        const isAgainst = a.againstLeagues.length > 0;
        const isStarter = isFor || isAgainst;
        // A starter (FOR/AGAINST) always takes precedence over bench. A player is
        // only 'bench' when I roster them somewhere but start them nowhere and
        // they aren't an opponent's starter either.
        const side: RootingSide = isFor && isAgainst ? 'both' : isFor ? 'for' : isAgainst ? 'against' : 'bench';

        const nflTeam = info?.nflTeam ?? null;
        const nflOpp = info?.nflOpponent ?? null;
        const key = gameKeyFor(nflTeam, nflOpp);
        const teams: [string, string] = key === UNKNOWN_GAME
            ? ['UNK', 'UNK']
            : (key.includes('@') ? key.split('@') as [string, string] : [key, '']);

        const game = ensureGame(key, teams);
        game.players.push({
            sleeper_id: id,
            full_name: info?.full_name ?? id,
            position: info?.position ?? null,
            nflTeam,
            side,
            forLeagues: a.forLeagues,
            againstLeagues: a.againstLeagues,
            benchLeagues: isStarter ? [] : a.benchLeagues, // starter wins → clear bench
            points: a.points,
            usage: a.usage,
            usageLabel: a.usageLabel,
        });
        // Bench players don't count toward the FOR/AGAINST tallies or point totals.
        if (isFor) game.forCount++;
        if (isAgainst) game.againstCount++;
        if (a.points != null) {
            if (isFor) game.forPoints += a.points;
            if (isAgainst) game.againstPoints += a.points;
        }
    }

    // Sort players within a game: by NFL team, then side (both, then for, then
    // against), then most leagues.
    const sideRank = (s: RootingSide) => (s === 'both' ? 0 : s === 'for' ? 1 : 2);
    for (const g of gamesByKey.values()) {
        g.players.sort((p1, p2) => {
            if ((p1.nflTeam || '') !== (p2.nflTeam || '')) return (p1.nflTeam || '').localeCompare(p2.nflTeam || '');
            if (sideRank(p1.side) !== sideRank(p2.side)) return sideRank(p1.side) - sideRank(p2.side);
            const c1 = p1.forLeagues.length + p1.againstLeagues.length;
            const c2 = p2.forLeagues.length + p2.againstLeagues.length;
            return c2 - c1;
        });
    }

    // Sort games: most total rooting interest first; UNKNOWN bucket last.
    const games = [...gamesByKey.values()].sort((a, b) => {
        if (a.gameKey === UNKNOWN_GAME) return 1;
        if (b.gameKey === UNKNOWN_GAME) return -1;
        return (b.forCount + b.againstCount) - (a.forCount + a.againstCount);
    });

    const sources: RootingSource[] = leagues.map(lg => ({
        leagueName: lg.leagueName,
        platform: lg.platform,
        lastSynced: lg.lastSynced ?? null,
    }));

    return { week, games, unresolvedLeagues: [], sources };
}
