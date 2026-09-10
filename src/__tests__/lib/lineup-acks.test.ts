import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readAcks, writeAck, isAcked, ackKeyFor, pruneToWeek, ACKS_STORAGE_KEY } from '@/lib/lineup-acks';

// Pure storage helpers behind the useLineupAcks hook are unit-tested here (the
// React hook is a thin wrapper over these + a custom event, exercised in-app).

beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    });
});

describe('ackKeyFor', () => {
    it('builds a stable key from platform/league/start->bench', () => {
        expect(ackKeyFor('sleeper', 'L1', 'wr2', 'wr1')).toBe('sleeper:L1:wr2->wr1');
        expect(ackKeyFor('sleeper', 'L1', 'wr2', null)).toBe('sleeper:L1:wr2->none');
    });
});

describe('writeAck / isAcked (week-scoped)', () => {
    it('acked key is remembered for the same week', () => {
        writeAck(3, 'sleeper:L1:wr2->wr1');
        expect(isAcked(readAcks(), 3, 'sleeper:L1:wr2->wr1')).toBe(true);
    });

    it('does not leak across weeks', () => {
        writeAck(3, 'sleeper:L1:wr2->wr1');
        expect(isAcked(readAcks(), 4, 'sleeper:L1:wr2->wr1')).toBe(false);
    });

    it('unknown key is not acked', () => {
        writeAck(3, 'sleeper:L1:wr2->wr1');
        expect(isAcked(readAcks(), 3, 'sleeper:L1:other->x')).toBe(false);
    });
});

describe('pruneToWeek', () => {
    it('drops acks for weeks other than the current one', () => {
        writeAck(2, 'a');
        writeAck(3, 'b');
        pruneToWeek(3);
        const acks = readAcks();
        expect(isAcked(acks, 3, 'b')).toBe(true);
        expect(isAcked(acks, 2, 'a')).toBe(false);
        // week 2 bucket removed entirely
        expect(acks['2']).toBeUndefined();
    });

    it('is a no-op when week is null', () => {
        writeAck(3, 'b');
        pruneToWeek(null);
        expect(isAcked(readAcks(), 3, 'b')).toBe(true);
    });
});

describe('storage key', () => {
    it('is namespaced', () => {
        expect(ACKS_STORAGE_KEY).toMatch(/^vff_/);
    });
});
