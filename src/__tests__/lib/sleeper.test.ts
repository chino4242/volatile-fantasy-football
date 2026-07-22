import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLeagueUsers, getLeagueRosters, getTradedPicks, getLeagueData, getPickFantasyCalcId, getAllDraftPicks } from '@/lib/sleeper';
import { cache } from '@/lib/cache';

// Mock the global fetch
global.fetch = vi.fn();

describe('Sleeper API Library', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        cache.clear(); // Important: clear cache so fetch is always called
    });

    const mockLeagueId = '12345';

    describe('getLeagueUsers', () => {
        it('should fetch and return users successfully', async () => {
            const mockUsers = [
                { user_id: '1', display_name: 'User 1', avatar: 'avatar1' },
                { user_id: '2', display_name: 'User 2', avatar: null }
            ];

            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockUsers
            });

            const result = await getLeagueUsers(mockLeagueId);
            expect(result).toEqual(mockUsers);
            expect(fetch).toHaveBeenCalledWith(`https://api.sleeper.app/v1/league/${mockLeagueId}/users`, { cache: 'no-store' });
        });

        it('should throw an error on failed fetch', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error'
            });

            await expect(getLeagueUsers(mockLeagueId)).rejects.toThrow('Failed to fetch users');
        });
    });

    describe('getLeagueRosters', () => {
        it('should fetch and return rosters successfully', async () => {
            const mockRosters = [
                { roster_id: 1, owner_id: '1', players: ['p1', 'p2'], starters: ['p1'], settings: { wins: 1, losses: 0, ties: 0, fpts: 100 } }
            ];

            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRosters
            });

            const result = await getLeagueRosters(mockLeagueId);
            expect(result).toEqual(mockRosters);
            expect(fetch).toHaveBeenCalledWith(`https://api.sleeper.app/v1/league/${mockLeagueId}/rosters`, { cache: 'no-store' });
        });

        it('should throw an error on failed fetch', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: false,
                statusText: 'Not Found'
            });

            await expect(getLeagueRosters(mockLeagueId)).rejects.toThrow('Failed to fetch rosters');
        });
    });

    describe('getLeagueData', () => {
        it('should return users, rosters, and traded picks', async () => {
            const mockUsers = [{ user_id: '1', display_name: 'User 1', avatar: 'a' }];
            const mockRosters = [{ roster_id: 1, owner_id: '1', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } }];
            const mockTradedPicks = [{ season: '2025', round: 1, roster_id: 1, previous_owner_id: 2, owner_id: 1 }];

            (fetch as any)
                // getCurrentSeasonLeagueId: fetch league metadata (status not 'complete' = return same ID)
                .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'in_season' }) })
                .mockResolvedValueOnce({ ok: true, json: async () => mockUsers })
                .mockResolvedValueOnce({ ok: true, json: async () => mockRosters })
                .mockResolvedValueOnce({ ok: true, json: async () => mockTradedPicks });

            const result = await getLeagueData(mockLeagueId);

            expect(result).toEqual({ users: mockUsers, rosters: mockRosters, tradedPicks: mockTradedPicks });
            expect(fetch).toHaveBeenCalledTimes(4);
        });
    });

    describe('getTradedPicks', () => {
        it('should fetch and return traded picks successfully', async () => {
            const mockPicks = [
                { season: '2025', round: 1, roster_id: 1, previous_owner_id: 2, owner_id: 1 },
                { season: '2026', round: 3, roster_id: 2, previous_owner_id: 1, owner_id: 2 }
            ];

            (fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockPicks
            });

            const result = await getTradedPicks(mockLeagueId);
            expect(result).toEqual(mockPicks);
            expect(fetch).toHaveBeenCalledWith(`https://api.sleeper.app/v1/league/${mockLeagueId}/traded_picks`, { cache: 'no-store' });
        });

        it('should throw an error on failed fetch', async () => {
            (fetch as any).mockResolvedValueOnce({
                ok: false,
                statusText: 'Not Found'
            });

            await expect(getTradedPicks(mockLeagueId)).rejects.toThrow('Failed to fetch traded picks');
        });
    });

    describe('getPickFantasyCalcId', () => {
        it('should generate correct FantasyCalc ID for draft picks', () => {
            expect(getPickFantasyCalcId('2025', 1)).toBe('FP_2025_1');
            expect(getPickFantasyCalcId('2026', 3)).toBe('FP_2026_3');
            expect(getPickFantasyCalcId('2027', 5)).toBe('FP_2027_5');
        });
    });

    describe('getAllDraftPicks', () => {
        it('should generate all picks for all teams', () => {
            const rosters = [
                { roster_id: 1, owner_id: 'u1', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } },
                { roster_id: 2, owner_id: 'u2', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } }
            ];
            const tradedPicks: any[] = [];
            
            const picks = getAllDraftPicks(rosters, tradedPicks, 2026);
            
            // 2 teams * 5 rounds * 3 years = 30 picks
            expect(picks.length).toBe(30);
            expect(picks.filter(p => p.currentOwner === 1).length).toBe(15);
            expect(picks.filter(p => p.currentOwner === 2).length).toBe(15);
        });

        it('should apply trades correctly', () => {
            const rosters = [
                { roster_id: 1, owner_id: 'u1', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } },
                { roster_id: 2, owner_id: 'u2', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } }
            ];
            const tradedPicks = [
                { season: '2026', round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 }
            ];
            
            const picks = getAllDraftPicks(rosters, tradedPicks, 2026);
            
            const tradedPick = picks.find(p => p.season === '2026' && p.round === 1 && p.originalOwner === 1);
            expect(tradedPick?.currentOwner).toBe(2);
        });
    });
});
