import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getLiveGameStates } from '@/lib/nfl-live';
import { gameKeyFor } from '@/lib/rooting-guide';

// Sample ESPN scoreboard payload (trimmed to the fields the mapper reads).
const payload = {
    events: [
        {
            id: '401001',
            status: { period: 3, displayClock: '10:32', type: { state: 'in', shortDetail: 'Q3 10:32' } },
            competitions: [{
                competitors: [
                    { homeAway: 'home', team: { abbreviation: 'GB' }, score: '21' },
                    { homeAway: 'away', team: { abbreviation: 'DET' }, score: '17' },
                ],
            }],
        },
        {
            status: { period: 4, displayClock: '0:00', type: { state: 'post', shortDetail: 'Final' } },
            competitions: [{
                competitors: [
                    { homeAway: 'home', team: { abbreviation: 'WSH' }, score: '28' }, // WSH → WAS
                    { homeAway: 'away', team: { abbreviation: 'PHI' }, score: '31' },
                ],
            }],
        },
        {
            status: { period: 0, displayClock: '0:00', type: { state: 'pre', shortDetail: 'Sun 1:00 PM' } },
            competitions: [{
                competitors: [
                    { homeAway: 'home', team: { abbreviation: 'LAR' }, score: '0' },
                    { homeAway: 'away', team: { abbreviation: 'SF' }, score: '0' },
                ],
            }],
        },
    ],
};

describe('getLiveGameStates (ESPN mapping)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })) as any);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('maps in-progress games with score, quarter, clock keyed by gameKey', async () => {
        const map = await getLiveGameStates();
        const g = map.get(gameKeyFor('DET', 'GB'))!;
        expect(g).toBeTruthy();
        expect(g.state).toBe('in');
        expect(g.homeScore).toBe(21);   // GB home
        expect(g.awayScore).toBe(17);   // DET away
        expect(g.period).toBe(3);
        expect(g.clock).toBe('10:32');
        expect(g.shortLabel).toBe('Q3 10:32');
    });

    it('normalizes ESPN abbrs (WSH → WAS) and labels finals', async () => {
        const map = await getLiveGameStates();
        // Key uses normalized WAS, so PHI@WAS sorted.
        const g = map.get(gameKeyFor('PHI', 'WAS'))!;
        expect(g).toBeTruthy();
        expect(g.state).toBe('post');
        expect(g.shortLabel).toBe('Final');
    });

    it('handles pre-game (scheduled) with no live label', async () => {
        const map = await getLiveGameStates();
        const g = map.get(gameKeyFor('SF', 'LAR'))!;
        expect(g.state).toBe('pre');
        expect(g.shortLabel).toBe('Sun 1:00 PM');
    });
});
