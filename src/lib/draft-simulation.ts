// Draft simulation constants and pure utility functions
// Extracted from DraftClient.tsx for maintainability

export type DraftStyle = 'balanced' | 'bpa' | 'need' | 'prospect' | 'winNow';

export const DRAFT_STYLES: { style: DraftStyle; label: string; weights: { value: number; need: number; dynasty: number; redraft: number; prospect: number } }[] = [
    { style: 'balanced', label: 'Balanced', weights: { value: 0.90, need: 0.10, dynasty: 1, redraft: 1, prospect: 1 } },
    { style: 'bpa', label: 'BPA Purist', weights: { value: 0.98, need: 0.02, dynasty: 0.3, redraft: 0.3, prospect: 0.3 } },
    { style: 'need', label: 'Need-Based', weights: { value: 0.70, need: 0.30, dynasty: 1, redraft: 1, prospect: 1 } },
    { style: 'prospect', label: 'Prospect Chaser', weights: { value: 0.85, need: 0.08, dynasty: 1.5, redraft: 0.5, prospect: 2.5 } },
    { style: 'winNow', label: 'Win Now', weights: { value: 0.85, need: 0.10, dynasty: 0.5, redraft: 2.5, prospect: 0.5 } },
];

/**
 * Calculate effective player value blending dynasty and redraft values.
 * @param player - Player with fc_value and optional redraft_rank_overall
 * @param redraftWeight - Weight from 0 (pure dynasty) to 100 (pure redraft)
 */
export function getEffectiveValue(player: { fc_value: number | null; redraft_rank_overall?: number | null }, redraftWeight: number): number {
    const dynVal = player.fc_value || 0;
    if (redraftWeight === 0) return dynVal;
    const rdRank = player.redraft_rank_overall;
    if (!rdRank) return dynVal;
    const rdValue = Math.max(1000, Math.round(5000 - (rdRank - 1) * 16));
    const w = redraftWeight / 100;
    return Math.round(dynVal * (1 - w) + rdValue * w);
}

/**
 * Estimate the value of a future draft pick.
 * If slot is provided, uses specific pick values from FantasyCalc data.
 * Otherwise falls back to round-average values.
 */
// Specific pick values (1QB, 12-team) from FantasyCalc
const PICK_VALUES_1QB: Record<string, number> = {
    '1.01': 7031, '1.02': 4294, '1.03': 3784, '1.04': 3539, '1.05': 3312,
    '1.06': 3125, '1.07': 2899, '1.08': 2704, '1.09': 2533, '1.10': 2384,
    '1.11': 2237, '1.12': 2100,
    '2.01': 1950, '2.02': 1800, '2.03': 1680, '2.04': 1570, '2.05': 1470,
    '2.06': 1380, '2.07': 1300, '2.08': 1230, '2.09': 1160, '2.10': 1100,
    '2.11': 1050, '2.12': 1000,
    '3.01': 950, '3.02': 900, '3.03': 860, '3.04': 820, '3.05': 780,
    '3.06': 750, '3.07': 720, '3.08': 690, '3.09': 660, '3.10': 640,
    '3.11': 620, '3.12': 600,
};

const PICK_VALUES_SF: Record<string, number> = {
    '1.01': 7144, '1.02': 4702, '1.03': 4294, '1.04': 3908, '1.05': 3677,
    '1.06': 3409, '1.07': 3018, '1.08': 2767, '1.09': 2743, '1.10': 2580,
    '1.11': 2431, '1.12': 2290,
    '2.01': 2100, '2.02': 1940, '2.03': 1790, '2.04': 1660, '2.05': 1540,
    '2.06': 1430, '2.07': 1330, '2.08': 1240, '2.09': 1160, '2.10': 1090,
    '2.11': 1030, '2.12': 980,
    '3.01': 930, '3.02': 880, '3.03': 840, '3.04': 800, '3.05': 760,
    '3.06': 730, '3.07': 700, '3.08': 670, '3.09': 640, '3.10': 620,
    '3.11': 600, '3.12': 580,
};

export function estimateFuturePickValue(round: number, slot?: number, sf?: boolean): number {
    if (slot) {
        const key = `${round}.${String(slot).padStart(2, '0')}`;
        const table = sf ? PICK_VALUES_SF : PICK_VALUES_1QB;
        if (table[key]) return table[key];
    }
    // Fallback: round-average values
    if (round === 1) return sf ? 3400 : 3200;
    if (round === 2) return sf ? 1500 : 1400;
    if (round === 3) return sf ? 750 : 700;
    if (round === 4) return 500;
    return 300;
}
