import { describe, it, expect, afterEach, vi } from 'vitest';
import { getStartedTeams, startedTeamsFromStates, type LiveGameState } from '@/lib/nfl-live';

function gs(state: LiveGameState['state'], home: string, away: string): LiveGameState {
    return { eventId: `${home}${away}`, state, home, away, homeScore: null, awayScore: null, period: null, clock: null, shortLabel: '' };
}

describe('startedTeamsFromStates', () => {
    it('includes both teams of any game whose state is not "pre"', () => {
        const map = new Map<string, LiveGameState>([
            ['a', gs('in', 'GB', 'DET')],
            ['b', gs('post', 'WAS', 'PHI')],
            ['c', gs('pre', 'LAR', 'SF')],
        ]);
        const started = startedTeamsFromStates(map);
        expect([...started].sort()).toEqual(['DET', 'GB', 'PHI', 'WAS']);
    });

    it('returns an empty set when there are no games', () => {
        expect(startedTeamsFromStates(new Map()).size).toBe(0);
    });
});

describe('getStartedTeams (fail open)', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('returns an empty set when the scoreboard request fails', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }) as any);
        const started = await getStartedTeams();
        expect(started).toBeInstanceOf(Set);
        expect(started.size).toBe(0);
    });
});
