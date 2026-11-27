import { describe, it, expect } from 'vitest';
import { classifyKinds, kindNotices, type KindRow } from '@/lib/weekly-freshness';

const row = (kind: string, latestWeek: number | null, ranked = 0): KindRow => ({ kind, latestWeek, rankedAtOverallLatest: ranked });

describe('classifyKinds', () => {
    it('ok: the kind has rows at the overall latest week, and reports its pool size', () => {
        const s = classifyKinds([row('flex', 12, 100), row('qb', 12, 24), row('k', 12, 32), row('dst', 12, 24)], 12);
        expect(s.overallLatestWeek).toBe(12);
        expect(s.kinds.k).toEqual({ state: 'ok', latestWeek: 12, poolSize: 32 });
        expect(s.kinds.dst).toEqual({ state: 'ok', latestWeek: 12, poolSize: 24 });
    });

    it('stale: the kind was last uploaded in an earlier week than the overall latest', () => {
        const s = classifyKinds([row('flex', 12, 100), row('k', 11, 0)], 12);
        expect(s.kinds.k.state).toBe('stale');
        expect(s.kinds.k.latestWeek).toBe(11);
        expect(s.kinds.k.poolSize).toBe(0);
    });

    it('missing: the kind has never been uploaded', () => {
        const s = classifyKinds([row('flex', 12, 100)], 12);
        expect(s.kinds.dst).toEqual({ state: 'missing', latestWeek: null, poolSize: 0 });
        expect(s.kinds.k.state).toBe('missing');
    });

    it('nothing uploaded at all: every kind is missing', () => {
        const s = classifyKinds([], null);
        expect(s.overallLatestWeek).toBeNull();
        expect(Object.values(s.kinds).every(k => k.state === 'missing')).toBe(true);
    });

    it('ignores unknown kinds', () => {
        const s = classifyKinds([row('bogus', 12, 5), row('k', 12, 32)], 12);
        expect(s.kinds.k.state).toBe('ok');
        expect(Object.keys(s.kinds).sort()).toEqual(['dst', 'flex', 'k', 'qb']);
    });
});

describe('kindNotices (only for kinds the league starts)', () => {
    const stale = classifyKinds([row('flex', 12, 100), row('k', 11, 0), row('dst', 12, 24)], 12);

    it('names the kind and both weeks for a stale upload', () => {
        const n = kindNotices(stale, ['k']);
        expect(n).toHaveLength(1);
        expect(n[0].kind).toBe('k');
        expect(n[0].state).toBe('stale');
        expect(n[0].message).toBe('No Week 12 kicker ranking uploaded. Last upload: Week 11.');
    });

    it('says so plainly when a kind was never uploaded', () => {
        const n = kindNotices(classifyKinds([row('flex', 12, 100)], 12), ['dst']);
        expect(n[0].state).toBe('missing');
        expect(n[0].message).toBe('No defense ranking has been uploaded.');
    });

    it('is silent for kinds that are ok, or that the league does not start', () => {
        expect(kindNotices(stale, ['dst'])).toEqual([]);   // dst ok
        expect(kindNotices(stale, [])).toEqual([]);        // league starts neither
    });

    it('reports each starting kind that has a problem', () => {
        const both = classifyKinds([row('flex', 12, 100)], 12);
        expect(kindNotices(both, ['k', 'dst']).map(n => n.kind)).toEqual(['k', 'dst']);
    });
});
