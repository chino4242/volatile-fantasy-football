import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestPlayers } from '../../../scripts/ingest-players';
import * as dbModule from '@/db';

// Mock the global fetch
global.fetch = vi.fn();

// We need to mock the entire DB interaction to verify the upsert logic
// without hitting a real PostgreSQL database
vi.mock('@/db', () => ({
    db: {
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                onConflictDoUpdate: vi.fn()
            }))
        }))
    }
}));

// We also need to mock process.exit so the test doesn't crash the runner on errors
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined): never => {
    throw new Error(`process.exit called with ${code}`);
});

describe('Player Ingestion Script', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should fetch, transform, and upsert player data correctly', async () => {
        const mockFantasyCalcData = [
            {
                player: {
                    sleeperId: '123',
                    name: 'Justin Jefferson',
                    mflId: 'something',
                    position: 'WR',
                    maybeTeam: 'MIN',
                    maybeAge: 25.4
                },
                value: 9999,
                overallRank: 1,
                trend30Day: 42,
                redraftValue: 9000
            },
            {
                player: {
                    name: 'No Sleeper ID Player',
                    position: 'UNK'
                }
            }
        ];

        (fetch as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => mockFantasyCalcData
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => mockFantasyCalcData
            });

        const mockOnConflictDoUpdatePlayers = vi.fn();
        const mockOnConflictDoUpdateValues = vi.fn();

        const mockValuesPlayers = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdatePlayers }));
        const mockValuesValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdateValues }));

        // First insert call for players, second for values
        (dbModule.db.insert as any)
            .mockReturnValueOnce({ values: mockValuesPlayers })
            .mockReturnValueOnce({ values: mockValuesValues });

        await ingestPlayers();

        // Ensure fetch was called
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('api.fantasycalc.com'));

        // Ensure the data transformation happened correctly (age rounded, names split)
        expect(mockValuesPlayers).toHaveBeenCalledWith([
            {
                sleeper_id: '123',
                full_name: 'Justin Jefferson',
                first_name: 'Justin',
                last_name: 'Jefferson',
                position: 'WR',
                team: 'MIN',
                age: 25, // 25.4 should round to 25
                status: 'Active'
            }
        ]);

        // Ensure the value transformation was correct
        expect(mockValuesValues).toHaveBeenCalledWith([
            {
                sleeper_id: '123',
                fc_value: 9999,
                fc_value_sf: 9999,
                fc_value_1qb: 9999,
                fc_rank: 1,
                fc_rank_sf: 1,
                fc_rank_1qb: 1,
                fc_trend_30_day: 42,
                redraft_value: 9000,
                updated_at: expect.any(Date)
            }
        ]);

        // Ensure exactly two updates were fired (one for player metadata, one for values)
        expect(mockOnConflictDoUpdatePlayers).toHaveBeenCalled();
        expect(mockOnConflictDoUpdateValues).toHaveBeenCalled();
    });

    it('should exit with code 1 if fetch fails', async () => {
        (fetch as any).mockResolvedValueOnce({
            ok: false,
            statusText: 'Internal Server Error'
        });

        await expect(ingestPlayers()).rejects.toThrow('process.exit called with 1');
    });
});
