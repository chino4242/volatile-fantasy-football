import { describe, it, expect } from 'vitest';
import { planClear, clearFieldsFor, CLEAR_MIN_MATCH_RATE_PCT, CLEAR_MIN_COVERAGE_PCT } from '@/lib/rankings-clear';

const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('planClear', () => {
    it('clears previously ranked players that were not matched to the file', () => {
        const previous = ids(10);
        const matched = new Set(previous.slice(0, 8)); // p8, p9 missing from the file
        const plan = planClear({ previouslyRanked: previous, matched, totalRows: 8, matchedCount: 8 });
        expect(plan.skippedReason).toBeNull();
        expect(plan.toClear.sort()).toEqual(['p8', 'p9']);
    });

    it('does not clear anyone when every previously ranked player is in the file', () => {
        const previous = ids(5);
        const plan = planClear({ previouslyRanked: previous, matched: new Set(previous), totalRows: 5, matchedCount: 5 });
        expect(plan.toClear).toEqual([]);
        expect(plan.skippedReason).toBeNull();
    });

    it('players new in the file are never in the clear list', () => {
        const plan = planClear({ previouslyRanked: ['a', 'b'], matched: new Set(['a', 'b', 'brand_new']), totalRows: 3, matchedCount: 3 });
        expect(plan.toClear).toEqual([]);
    });

    it('skips clearing when nothing matched (wrong file / bad headers)', () => {
        const plan = planClear({ previouslyRanked: ids(10), matched: new Set(), totalRows: 20, matchedCount: 0 });
        expect(plan.toClear).toEqual([]);
        expect(plan.skippedReason).toMatch(/no rows matched/i);
    });

    it('skips clearing when the match rate is below the minimum', () => {
        // 4 of 10 rows matched = 40% < 50%
        const previous = ids(4);
        const plan = planClear({ previouslyRanked: previous, matched: new Set(previous), totalRows: 10, matchedCount: 4 });
        expect(CLEAR_MIN_MATCH_RATE_PCT).toBe(50);
        expect(plan.toClear).toEqual([]);
        expect(plan.skippedReason).toMatch(/match rate/i);
    });

    it('match-rate boundary: exactly 50% is allowed', () => {
        const previous = ids(5);
        const matched = new Set(previous);
        const plan = planClear({ previouslyRanked: [...previous, 'gone'], matched, totalRows: 10, matchedCount: 5 });
        expect(plan.skippedReason).toBeNull();
        expect(plan.toClear).toEqual(['gone']);
    });

    it('skips clearing when the file covers too little of what was previously ranked (truncated file)', () => {
        // 30 matched of 100 previously ranked = 30% < 50% coverage
        const previous = ids(100);
        const matched = new Set(previous.slice(0, 30));
        const plan = planClear({ previouslyRanked: previous, matched, totalRows: 30, matchedCount: 30 });
        expect(CLEAR_MIN_COVERAGE_PCT).toBe(50);
        expect(plan.toClear).toEqual([]);
        expect(plan.skippedReason).toMatch(/previously ranked/i);
    });

    it('realistic ROS case: 149 matched of 203 previously ranked clears the 54 missing', () => {
        const previous = ids(203);
        const matched = new Set(previous.slice(0, 149));
        const plan = planClear({ previouslyRanked: previous, matched, totalRows: 150, matchedCount: 149 });
        expect(plan.skippedReason).toBeNull();
        expect(plan.toClear).toHaveLength(54);
    });

    it('first-ever upload (nothing previously ranked) is a no-op, not a skip', () => {
        const plan = planClear({ previouslyRanked: [], matched: new Set(['a']), totalRows: 1, matchedCount: 1 });
        expect(plan.toClear).toEqual([]);
        expect(plan.skippedReason).toBeNull();
    });
});

describe('clearFieldsFor', () => {
    it('ROS clears rank, pos, tier, ppg, both SOS ranks, bye and the timestamp', () => {
        expect(Object.keys(clearFieldsFor('ros')).sort()).toEqual([
            'bye_week', 'rank_ros_overall', 'rank_ros_pos', 'rank_ros_ppg', 'rank_ros_tier',
            'rank_ros_updated_at', 'ros_next4_sos', 'ros_sos',
        ]);
    });

    it('every cleared field is set to null', () => {
        for (const cat of ['1qb', 'sf', 'redraft', 'ros'] as const) {
            expect(Object.values(clearFieldsFor(cat)).every(v => v === null)).toBe(true);
        }
    });

    it('redraft also clears the auction value; 1qb and sf do not touch other categories', () => {
        expect(clearFieldsFor('redraft')).toHaveProperty('redraft_auction_value');
        expect(Object.keys(clearFieldsFor('1qb')).every(k => k.startsWith('rank_1qb_'))).toBe(true);
        expect(Object.keys(clearFieldsFor('sf')).every(k => k.startsWith('rank_sf_'))).toBe(true);
    });

    it('never touches FantasyCalc value columns', () => {
        for (const cat of ['1qb', 'sf', 'redraft', 'ros'] as const) {
            expect(Object.keys(clearFieldsFor(cat)).some(k => k.startsWith('fc_'))).toBe(false);
        }
    });

    it('rejects an unknown category', () => {
        expect(() => clearFieldsFor('bogus' as any)).toThrow();
    });
});

describe('review patches: exact column sets and the missing-player case', () => {
    it('1qb clears exactly overall, pos, tier and updated_at', () => {
        expect(Object.keys(clearFieldsFor('1qb')).sort()).toEqual(['rank_1qb_overall', 'rank_1qb_pos', 'rank_1qb_tier', 'rank_1qb_updated_at']);
    });
    it('sf clears exactly overall, pos, tier and updated_at', () => {
        expect(Object.keys(clearFieldsFor('sf')).sort()).toEqual(['rank_sf_overall', 'rank_sf_pos', 'rank_sf_tier', 'rank_sf_updated_at']);
    });
    it('redraft clears exactly overall, pos, tier, auction value and updated_at', () => {
        expect(Object.keys(clearFieldsFor('redraft')).sort()).toEqual([
            'redraft_auction_value', 'redraft_rank_overall', 'redraft_rank_pos', 'redraft_rank_tier', 'redraft_rank_updated_at',
        ]);
    });

    it('a previously ranked player who is not in the file (e.g. injured Jaxson Dart) is cleared; the rest are kept', () => {
        const previous = ['dart', 'goff', 'chase', 'jefferson'];
        const matched = new Set(['goff', 'chase', 'jefferson']);
        const plan = planClear({ previouslyRanked: previous, matched, totalRows: 3, matchedCount: 3 });
        expect(plan.toClear).toEqual(['dart']);
        expect(plan.skippedReason).toBeNull();
    });

    it('a name that failed to match is treated as missing, so a previously ranked player is cleared (and the guards still apply)', () => {
        // 10 previously ranked, file has 6 rows; 5 match, 1 unmatched name -> match rate 83%, coverage 50%
        const previous = Array.from({ length: 10 }, (_, i) => `p${i}`);
        const matched = new Set(previous.slice(0, 5));
        const plan = planClear({ previouslyRanked: previous, matched, totalRows: 6, matchedCount: 5 });
        expect(plan.skippedReason).toBeNull();
        expect(plan.toClear).toHaveLength(5);
    });
});
