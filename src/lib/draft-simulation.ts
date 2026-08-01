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
 * Estimate the value of a future draft pick based on round alone.
 * Pure lookup with no external dependencies.
 */
export function estimateFuturePickValue(round: number): number {
    if (round === 1) return 2900;
    if (round === 2) return 1500;
    if (round === 3) return 900;
    if (round === 4) return 500;
    return 300;
}
