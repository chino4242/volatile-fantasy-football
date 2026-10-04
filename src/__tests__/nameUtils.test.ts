import { describe, it, expect } from 'vitest';
import { cleanseName, resolveDefenseId } from '../lib/nameUtils';

describe('nameUtils', () => {
    it('cleanses names correctly', () => {
        expect(cleanseName("Patrick Mahomes II")).toBe("patrick mahomes");
        expect(cleanseName("D'Andre Swift")).toBe("dandre swift");
        expect(cleanseName("T.J. Hockenson")).toBe("tj hockenson");
        expect(cleanseName("Amon-Ra St. Brown")).toBe("amon-ra st brown"); // Note: hyphen is preserved as it's not in the replace list
        expect(cleanseName("  Odell   Beckham Jr.  ")).toBe("odell beckham");
    });
});

describe('resolveDefenseId', () => {
    it('resolves the many defense-name forms platforms use', () => {
        // Fleaflicker-style bare team name (the bug this fixes).
        expect(resolveDefenseId('Seattle Seahawks')).toBe('DEF_SEA');
        // With DEF / D/ST suffixes.
        expect(resolveDefenseId('Seattle Seahawks DEF')).toBe('DEF_SEA');
        expect(resolveDefenseId('Seahawks D/ST')).toBe('DEF_SEA');
        // Nickname only.
        expect(resolveDefenseId('Seahawks')).toBe('DEF_SEA');
    });

    it('handles multi-word nicknames and digits', () => {
        expect(resolveDefenseId('San Francisco 49ers')).toBe('DEF_SF');
        expect(resolveDefenseId('Tampa Bay Buccaneers')).toBe('DEF_TB');
        expect(resolveDefenseId('Washington Commanders')).toBe('DEF_WAS');
    });

    it('returns null for a non-defense name', () => {
        expect(resolveDefenseId('Patrick Mahomes')).toBeNull();
        expect(resolveDefenseId('')).toBeNull();
        // @ts-expect-error — guard against non-string input
        expect(resolveDefenseId(null)).toBeNull();
    });

    it('respects a validIds guard (never fabricates an id for a team we do not carry)', () => {
        const valid = new Set(['DEF_SEA', 'DEF_KC']);
        expect(resolveDefenseId('Seattle Seahawks', valid)).toBe('DEF_SEA');
        // Dallas isn't in the valid set → null even though the nickname matches.
        expect(resolveDefenseId('Dallas Cowboys', valid)).toBeNull();
    });
});
