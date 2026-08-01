import { describe, it, expect } from 'vitest';
import { cleanseName } from '@/lib/nameUtils';

describe('cleanseName', () => {
    describe('basic normalization', () => {
        it('lowercases a basic name', () => {
            expect(cleanseName('Justin Jefferson')).toBe('justin jefferson');
        });

        it('collapses multiple spaces to single space', () => {
            expect(cleanseName('A  B')).toBe('a b');
        });

        it('returns empty string for empty input', () => {
            expect(cleanseName('')).toBe('');
        });

        it('returns empty string for non-string input', () => {
            // @ts-expect-error testing runtime safety
            expect(cleanseName(null)).toBe('');
            // @ts-expect-error testing runtime safety
            expect(cleanseName(undefined)).toBe('');
        });
    });

    describe('suffix removal', () => {
        it('strips Jr suffix', () => {
            expect(cleanseName('Marvin Harrison Jr')).toBe('marvin harrison');
        });

        it('strips Sr suffix', () => {
            expect(cleanseName('Mike Evans Sr')).toBe('mike evans');
        });

        it('strips II suffix', () => {
            expect(cleanseName('Odell Beckham II')).toBe('odell beckham');
        });

        it('strips III suffix', () => {
            expect(cleanseName('Robert Griffin III')).toBe('robert griffin');
        });

        it('strips IV suffix', () => {
            expect(cleanseName('Henry Ruggs IV')).toBe('henry ruggs');
        });

        it('strips suffix with period (Jr.)', () => {
            expect(cleanseName('Marvin Harrison Jr.')).toBe('marvin harrison');
        });
    });

    describe('punctuation removal', () => {
        it('strips apostrophes', () => {
            expect(cleanseName("Ja'Marr Chase")).toBe('jamarr chase');
        });

        it('strips periods', () => {
            expect(cleanseName('T.J. Hockenson')).toBe('tj hockenson');
        });
    });

    describe('nickname aliases', () => {
        it('resolves nick singleton → nicholas singleton', () => {
            expect(cleanseName('nick singleton')).toBe('nicholas singleton');
        });

        it('resolves hollywood brown → marquise brown', () => {
            expect(cleanseName('hollywood brown')).toBe('marquise brown');
        });

        it('resolves kenny walker → kenneth walker', () => {
            expect(cleanseName('Kenny Walker')).toBe('kenneth walker');
        });
    });
});
