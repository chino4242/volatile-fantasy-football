import { describe, it, expect } from 'vitest';
import { buildRootingGuide, gameKeyFor, type LeagueMatchupInput, type PlayerGameInfo } from '@/lib/rooting-guide';

const info = (full_name: string, position: string, nflTeam: string, nflOpponent: string): PlayerGameInfo =>
    ({ full_name, position, nflTeam, nflOpponent });

describe('gameKeyFor', () => {
    it('is order-independent', () => {
        expect(gameKeyFor('DET', 'GB')).toBe(gameKeyFor('GB', 'DET'));
        expect(gameKeyFor('DET', 'GB')).toBe('DET@GB');
    });
    it('handles unknowns', () => {
        expect(gameKeyFor(null, null)).toBe('UNKNOWN');
        expect(gameKeyFor('DET', null)).toBe('DET');
    });
});

describe('buildRootingGuide', () => {
    const gameInfo = new Map<string, PlayerGameInfo>([
        ['gibbs', info('Jahmyr Gibbs', 'RB', 'DET', 'GB')],
        ['arsb', info('Amon-Ra St. Brown', 'WR', 'DET', 'GB')],
        ['love', info('Jordan Love', 'QB', 'GB', 'DET')],
        ['chase', info('Ja\'Marr Chase', 'WR', 'CIN', 'CLE')],
    ]);

    it('marks FOR / AGAINST / BOTH with league counts and buckets by NFL game', () => {
        const leagues: LeagueMatchupInput[] = [
            // League A: I start Gibbs + Chase; opponent starts Love.
            { leagueId: 'a', leagueName: 'League A', platform: 'sleeper', myStarterIds: ['gibbs', 'chase'], oppStarterIds: ['love'] },
            // League B: I start Chase; opponent starts Gibbs (so Gibbs is BOTH) + ARSB.
            { leagueId: 'b', leagueName: 'League B', platform: 'fleaflicker', myStarterIds: ['chase'], oppStarterIds: ['gibbs', 'arsb'] },
        ];
        const guide = buildRootingGuide(leagues, gameInfo, 1);

        // Games: DET@GB (gibbs, arsb, love) and CIN@CLE (chase).
        const det = guide.games.find(g => g.gameKey === 'DET@GB');
        const cin = guide.games.find(g => g.gameKey === 'CIN@CLE');
        expect(det).toBeTruthy();
        expect(cin).toBeTruthy();

        const gibbs = det!.players.find(p => p.sleeper_id === 'gibbs')!;
        expect(gibbs.side).toBe('both'); // FOR in A, AGAINST in B
        expect(gibbs.forLeagues).toEqual(['League A']);
        expect(gibbs.againstLeagues).toEqual(['League B']);

        const love = det!.players.find(p => p.sleeper_id === 'love')!;
        expect(love.side).toBe('against');

        const arsb = det!.players.find(p => p.sleeper_id === 'arsb')!;
        expect(arsb.side).toBe('against');

        const chase = cin!.players.find(p => p.sleeper_id === 'chase')!;
        expect(chase.side).toBe('for');
        expect(chase.forLeagues).toEqual(['League A', 'League B']); // FOR in both leagues
    });

    it('aggregates multi-league FOR counts', () => {
        const leagues: LeagueMatchupInput[] = [
            { leagueId: 'a', leagueName: 'A', platform: 'sleeper', myStarterIds: ['gibbs'], oppStarterIds: [] },
            { leagueId: 'b', leagueName: 'B', platform: 'sleeper', myStarterIds: ['gibbs'], oppStarterIds: [] },
            { leagueId: 'c', leagueName: 'C', platform: 'fleaflicker', myStarterIds: ['gibbs'], oppStarterIds: [] },
        ];
        const g = buildRootingGuide(leagues, gameInfo, 2);
        const gibbs = g.games.flatMap(x => x.players).find(p => p.sleeper_id === 'gibbs')!;
        expect(gibbs.side).toBe('for');
        expect(gibbs.forLeagues).toEqual(['A', 'B', 'C']);
    });

    it('buckets players with no game info into UNKNOWN, never drops them', () => {
        const leagues: LeagueMatchupInput[] = [
            { leagueId: 'a', leagueName: 'A', platform: 'sleeper', myStarterIds: ['mystery'], oppStarterIds: [] },
        ];
        const g = buildRootingGuide(leagues, new Map(), 3);
        const unknown = g.games.find(x => x.gameKey === 'UNKNOWN');
        expect(unknown).toBeTruthy();
        expect(unknown!.players[0].sleeper_id).toBe('mystery');
        // UNKNOWN sorts last.
        expect(g.games[g.games.length - 1].gameKey).toBe('UNKNOWN');
    });
});


describe('buildRootingGuide — sources (data freshness)', () => {
    it('reports lastSynced per league (live for API platforms, ISO for DB)', () => {
        const leagues: LeagueMatchupInput[] = [
            { leagueId: 's', leagueName: 'Sleeper Lg', platform: 'sleeper', myStarterIds: [], oppStarterIds: [], lastSynced: 'live' },
            { leagueId: 'y', leagueName: 'Yahoo Lg', platform: 'yahoo', myStarterIds: [], oppStarterIds: [], lastSynced: '2026-09-10T09:00:00.000Z' },
            { leagueId: 'm', leagueName: 'MyFFPC Lg', platform: 'myffpc', myStarterIds: [], oppStarterIds: [], lastSynced: null },
        ];
        const g = buildRootingGuide(leagues, new Map(), 1);
        expect(g.sources).toHaveLength(3);
        expect(g.sources.find(s => s.platform === 'sleeper')!.lastSynced).toBe('live');
        expect(g.sources.find(s => s.platform === 'yahoo')!.lastSynced).toBe('2026-09-10T09:00:00.000Z');
        expect(g.sources.find(s => s.platform === 'myffpc')!.lastSynced).toBeNull();
    });
});


describe('buildRootingGuide — live points', () => {
    const gi = new Map<string, PlayerGameInfo>([
        ['cmc', info('Christian McCaffrey', 'RB', 'SF', 'LAR')],
        ['puka', info('Puka Nacua', 'WR', 'LAR', 'SF')],
    ]);

    it('folds per-player points onto RootingPlayer + FOR/AGAINST game totals', () => {
        const leagues: LeagueMatchupInput[] = [
            // I start CMC (FOR); opponent starts Puka (AGAINST). Points supplied.
            {
                leagueId: 'a', leagueName: 'A', platform: 'sleeper',
                myStarterIds: ['cmc'], oppStarterIds: ['puka'],
                pointsById: { cmc: 12.4, puka: 18.1 },
            },
        ];
        const g = buildRootingGuide(leagues, gi, 1);
        const game = g.games.find(x => x.gameKey === 'LAR@SF')!;
        expect(game).toBeTruthy();
        const cmc = game.players.find(p => p.sleeper_id === 'cmc')!;
        const puka = game.players.find(p => p.sleeper_id === 'puka')!;
        expect(cmc.points).toBe(12.4);
        expect(puka.points).toBe(18.1);
        expect(game.forPoints).toBeCloseTo(12.4);
        expect(game.againstPoints).toBeCloseTo(18.1);
    });

    it('a BOTH player contributes points to both sides; missing points → null', () => {
        const leagues: LeagueMatchupInput[] = [
            { leagueId: 'a', leagueName: 'A', platform: 'sleeper', myStarterIds: ['cmc'], oppStarterIds: [], pointsById: { cmc: 10 } },
            { leagueId: 'b', leagueName: 'B', platform: 'fleaflicker', myStarterIds: [], oppStarterIds: ['cmc'] }, // no points here
        ];
        const g = buildRootingGuide(leagues, gi, 1);
        const cmc = g.games.flatMap(x => x.players).find(p => p.sleeper_id === 'cmc')!;
        expect(cmc.side).toBe('both');
        expect(cmc.points).toBe(10); // max across leagues (B reported none)
        const game = g.games.find(x => x.players.some(p => p.sleeper_id === 'cmc'))!;
        expect(game.forPoints).toBeCloseTo(10);
        expect(game.againstPoints).toBeCloseTo(10); // both-side player counts on both
    });

    it('leaves points null when no platform reports them', () => {
        const leagues: LeagueMatchupInput[] = [
            { leagueId: 'a', leagueName: 'A', platform: 'yahoo', myStarterIds: ['cmc'], oppStarterIds: [] },
        ];
        const g = buildRootingGuide(leagues, gi, 1);
        const cmc = g.games.flatMap(x => x.players).find(p => p.sleeper_id === 'cmc')!;
        expect(cmc.points).toBeNull();
        const game = g.games.find(x => x.players.some(p => p.sleeper_id === 'cmc'))!;
        expect(game.forPoints).toBe(0);
    });
});
