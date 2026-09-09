import { describe, it, expect } from 'vitest';
import {
    generateTransactionSuggestions,
    buildRosterConfig,
    buildRosterConfigFromSlots,
    canonicalPos,
    type TxnPlayer,
    type RosterConfig,
} from '@/lib/transaction-suggestions';

const P = (id: string, name: string, pos: string, fc_value: number): TxnPlayer =>
    ({ sleeper_id: id, full_name: name, position: pos, team: null, fc_value });

// A standard 1QB lineup: QB, 2RB, 2WR, TE, FLEX, PK, DST + 6 bench = 14 core.
const STD_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'PK', 'DST', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'IR'];

describe('buildRosterConfig', () => {
    it('parses dedicated slots, flex, and canonicalizes K/DEF', () => {
        const cfg = buildRosterConfig(STD_POSITIONS)!;
        expect(cfg.startingSlots.QB).toBe(1);
        expect(cfg.startingSlots.RB).toBe(2);
        expect(cfg.startingSlots.WR).toBe(2);
        expect(cfg.startingSlots.TE).toBe(1);
        expect(cfg.startingSlots.PK).toBe(1);
        expect(cfg.startingSlots.DST).toBe(1);
        expect(cfg.flexSlots).toBe(1);
        expect(cfg.superFlexSlots).toBe(0);
        // coreCapacity excludes IR.
        expect(cfg.coreCapacity).toBe(15);
    });

    it('counts SUPER_FLEX separately', () => {
        const cfg = buildRosterConfig(['QB', 'SUPER_FLEX', 'RB', 'RB', 'WR', 'WR', 'TE', 'BN'])!;
        expect(cfg.superFlexSlots).toBe(1);
        expect(cfg.startingSlots.QB).toBe(1);
    });
});

describe('canonicalPos', () => {
    it('normalizes K→PK and DEF/D/ST→DST', () => {
        expect(canonicalPos('K')).toBe('PK');
        expect(canonicalPos('DEF')).toBe('DST');
        expect(canonicalPos('D/ST')).toBe('DST');
        expect(canonicalPos('wr')).toBe('WR');
    });
});

describe('generateTransactionSuggestions — legality guard (the DEF bug)', () => {
    // Full roster with exactly one DST — the reported bug dropped it repeatedly.
    const roster: TxnPlayer[] = [
        P('qb1', 'QB1', 'QB', 3000),
        P('rb1', 'RB1', 'RB', 4000), P('rb2', 'RB2', 'RB', 3500), P('rb3', 'RB3', 'RB', 1500),
        P('wr1', 'WR1', 'WR', 4200), P('wr2', 'WR2', 'WR', 3800), P('wr3', 'WR3', 'WR', 900),
        P('te1', 'TE1', 'TE', 2000),
        P('pk1', 'Kicker', 'PK', 0),
        P('def1', 'Dallas Cowboys', 'DEF', 0),
    ];
    const cfg = buildRosterConfig(STD_POSITIONS)!;
    const fas = [P('faQb', 'Shiny QB', 'QB', 1900), P('faWr', 'Shiny WR', 'WR', 1400)];

    it('never suggests dropping the only DST/PK (would break the lineup)', () => {
        const s = generateTransactionSuggestions(roster, fas, cfg, { actualCoreCount: cfg.coreCapacity });
        const droppedNames = s.map(x => x.dropPlayer?.full_name).filter(Boolean);
        expect(droppedNames).not.toContain('Dallas Cowboys');
        expect(droppedNames).not.toContain('Kicker');
    });

    it('drops from a genuine surplus position instead (e.g. WR3/RB3)', () => {
        const s = generateTransactionSuggestions(roster, fas, cfg, { actualCoreCount: cfg.coreCapacity });
        expect(s.length).toBeGreaterThan(0);
        // The lowest-value legal drop is WR3 (900) — RB3 (1500) is next.
        expect(s[0].dropPlayer?.full_name).toBe('WR3');
    });

    it('does not spam the same drop target more than twice', () => {
        // Many FAs, all more valuable than the cheapest surplus body.
        const manyFas = Array.from({ length: 10 }, (_, i) => P(`fa${i}`, `FA${i}`, 'WR', 2500 - i * 10));
        const s = generateTransactionSuggestions(roster, manyFas, cfg, { actualCoreCount: cfg.coreCapacity, maxSuggestions: 30 });
        const counts = new Map<string, number>();
        for (const x of s) {
            if (x.dropPlayer) counts.set(x.dropPlayer.sleeper_id, (counts.get(x.dropPlayer.sleeper_id) ?? 0) + 1);
        }
        for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2);
    });
});

describe('generateTransactionSuggestions — open spots & upgrades', () => {
    const cfg = buildRosterConfig(STD_POSITIONS)!; // capacity 15

    it('suggests pure adds when there are open roster spots', () => {
        const roster = [P('qb1', 'QB1', 'QB', 3000), P('rb1', 'RB1', 'RB', 4000)];
        const fas = [P('fa1', 'Add Me', 'WR', 2500)];
        const s = generateTransactionSuggestions(roster, fas, cfg, { actualCoreCount: roster.length });
        expect(s[0].type).toBe('add');
        expect(s[0].dropPlayer).toBeNull();
        expect(s[0].valueGain).toBe(2500);
    });

    it('prefers a same-position upgrade drop when the add clearly beats it', () => {
        // Full roster; WR3 is a cheap same-position body and RB3 is cheapest overall.
        const roster: TxnPlayer[] = [
            P('qb1', 'QB1', 'QB', 3000),
            P('rb1', 'RB1', 'RB', 4000), P('rb2', 'RB2', 'RB', 3500), P('rb3', 'RB3', 'RB', 300),
            P('wr1', 'WR1', 'WR', 4200), P('wr2', 'WR2', 'WR', 3800), P('wr3', 'WR3', 'WR', 320),
            P('te1', 'TE1', 'TE', 2000), P('pk1', 'K', 'PK', 0), P('def1', 'DEF', 'DEF', 0),
        ];
        const fa = [P('faWr', 'Great WR', 'WR', 5000)];
        const s = generateTransactionSuggestions(roster, fa, cfg, { actualCoreCount: cfg.coreCapacity });
        expect(s[0].type).toBe('swap');
        // Same-position (WR3 @ 320) is within 20% of the cheapest body (RB3 @ 300),
        // so we keep roster shape and drop the WR.
        expect(s[0].dropPlayer?.full_name).toBe('WR3');
    });

    it('respects the flex-pool floor (cannot drop below dedicated RB/WR/TE + flex)', () => {
        // Exactly enough flex-eligible bodies to fill 2RB+2WR+1TE+1FLEX = 6.
        const roster: TxnPlayer[] = [
            P('qb1', 'QB1', 'QB', 3000),
            P('rb1', 'RB1', 'RB', 4000), P('rb2', 'RB2', 'RB', 3500),
            P('wr1', 'WR1', 'WR', 4200), P('wr2', 'WR2', 'WR', 3800),
            P('te1', 'TE1', 'TE', 200), // low value but needed for the pool floor
        ];
        // Roster not full (capacity 15) so adds are free; make it "full" via actualCoreCount.
        const fa = [P('faQb', 'Backup QB', 'QB', 1000)];
        const s = generateTransactionSuggestions(roster, fa, cfg, { actualCoreCount: 15 });
        // No legal drop exists among the 6 flex-pool bodies (all needed) and QB1
        // is the only QB → the low-value TE must not be dropped.
        const droppedTe = s.some(x => x.dropPlayer?.full_name === 'TE1');
        expect(droppedTe).toBe(false);
    });
});

describe('buildRosterConfigFromSlots', () => {
    it('builds startingSlots + flex from a Fleaflicker slot object', () => {
        const cfg = buildRosterConfigFromSlots({ QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, total: 16 })!;
        expect(cfg.startingSlots).toEqual({ QB: 1, RB: 2, WR: 3, TE: 1 });
        expect(cfg.flexSlots).toBe(1);
        expect(cfg.coreCapacity).toBe(16);
    });
});


describe('buildRosterConfigFromSlots — DST/PK protection (Fleaflicker path)', () => {
    it('captures DST and PK starting slots so they are protected', () => {
        const cfg = buildRosterConfigFromSlots({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, PK: 1, total: 16 })!;
        expect(cfg.startingSlots.DST).toBe(1);
        expect(cfg.startingSlots.PK).toBe(1);
    });

    it('never drops the only DEF on a full Fleaflicker-style roster', () => {
        // Mirrors the reported bug: a QB/WR add trying to drop the sole DEF.
        const cfg = buildRosterConfigFromSlots({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, PK: 1, total: 12 })!;
        const roster: TxnPlayer[] = [
            P('qb1', 'Kyler Murray', 'QB', 1567),
            P('rb1', 'RB1', 'RB', 4000), P('rb2', 'RB2', 'RB', 3500), P('rb3', 'RB3', 'RB', 1500),
            P('wr1', 'WR1', 'WR', 4200), P('wr2', 'WR2', 'WR', 3800), P('wr3', 'WR3', 'WR', 1200),
            P('te1', 'TE1', 'TE', 2000),
            P('pk1', 'Kicker', 'PK', 0),
            P('def1', 'Dallas Cowboys', 'DEF', 0),
        ];
        const fas = [P('faQb', 'Sam Darnold', 'QB', 1533), P('faWr', 'Germie Bernard', 'WR', 1442)];
        const s = generateTransactionSuggestions(roster, fas, cfg, { actualCoreCount: cfg.coreCapacity });
        const droppedDef = s.some(x => canonicalPos(x.dropPlayer?.position) === 'DST');
        expect(droppedDef).toBe(false);
    });
});
