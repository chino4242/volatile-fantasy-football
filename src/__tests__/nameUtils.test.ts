import { describe, it, expect } from 'vitest';
import { cleanseName } from '../lib/nameUtils';

describe('nameUtils', () => {
    it('cleanses names correctly', () => {
        expect(cleanseName("Patrick Mahomes II")).toBe("patrick mahomes");
        expect(cleanseName("D'Andre Swift")).toBe("dandre swift");
        expect(cleanseName("T.J. Hockenson")).toBe("tj hockenson");
        expect(cleanseName("Amon-Ra St. Brown")).toBe("amon-ra st brown"); // Note: hyphen is preserved as it's not in the replace list
        expect(cleanseName("  Odell   Beckham Jr.  ")).toBe("odell beckham");
    });
});
