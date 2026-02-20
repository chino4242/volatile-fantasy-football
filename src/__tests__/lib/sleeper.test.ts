import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLeagueUsers, getLeagueRosters, getLeagueData } from '@/lib/sleeper';

// Mock the global fetch
global.fetch = vi.fn();

describe('Sleeper API Library', () => {
    beforeEach(() => {
        vi.resetAllMocks();
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
            expect(fetch).toHaveBeenCalledWith(`https://api.sleeper.app/v1/league/${mockLeagueId}/users`);
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
            expect(fetch).toHaveBeenCalledWith(`https://api.sleeper.app/v1/league/${mockLeagueId}/rosters`);
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
        it('should return both users and rosters', async () => {
            const mockUsers = [{ user_id: '1', display_name: 'User 1', avatar: 'a' }];
            const mockRosters = [{ roster_id: 1, owner_id: '1', players: [], starters: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 } }];

            // First call is users, second is rosters (due to Promise.all order in the implementation)
            (fetch as any)
                .mockResolvedValueOnce({ ok: true, json: async () => mockUsers })
                .mockResolvedValueOnce({ ok: true, json: async () => mockRosters });

            const result = await getLeagueData(mockLeagueId);

            expect(result).toEqual({ users: mockUsers, rosters: mockRosters });
            expect(fetch).toHaveBeenCalledTimes(2);
        });
    });
});
