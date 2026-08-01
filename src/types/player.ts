// src/types/player.ts

/**
 * Base player type used across the app.
 * All fields are optional except sleeper_id, full_name, position, team, and fc_value
 * to support various contexts (roster display, draft pool, trade evaluation).
 */
export interface BasePlayer {
    // Identity
    sleeper_id: string;  // also used as 'id' in some contexts
    full_name: string;
    position: string | null;
    team: string | null;

    // Dynasty values
    fc_value: number | null;
    fc_value_sf?: number | null;
    fc_value_1qb?: number | null;

    // Rankings
    fc_rank_sf?: number | null;
    fc_rank_1qb?: number | null;
    fc_position_rank_sf?: number | null;
    fc_position_rank_1qb?: number | null;
    rank_sf_overall?: number | null;
    rank_1qb_overall?: number | null;
    rank_sf_pos?: number | null;
    rank_1qb_pos?: number | null;
    rank_sf_tier?: number | null;
    rank_1qb_tier?: number | null;

    // Redraft
    redraft_rank_overall?: number | null;
    redraft_rank_pos?: number | null;
    redraft_rank_tier?: number | null;
    redraft_auction_value?: number | null;

    // Player info
    years_exp?: number | null;
    age?: number | null;

    // Market data
    fc_combined_value?: number | null;
    fc_trend_30_day?: number | null;
    fc_trade_frequency?: number | null;

    // Prospect/ZAP data
    zap_score?: number | null;
    zap_category?: string | null;
    zap_stale?: boolean;
    zap_comps?: string | null;
    zap_analysis?: string | null;
    zap_nfl_team?: string | null;
    zap_ai?: { confidence: number | null; summary: string | null; bull_case: string | null; bear_case: string | null; comps: string | null } | null;

    // Prospect rankings
    rookie_rank?: number | null;
    rookie_pos_rank?: number | null;
    rookie_tier?: number | null;

    // Writeups
    writeups?: { source: string; analysis_text: string; ai_confidence?: number | null; ai_summary?: string | null; ai_bull_case?: string | null; ai_bear_case?: string | null; ai_comps?: string | null }[] | null;
}

/**
 * Alias used in components that reference players by 'id' instead of 'sleeper_id'.
 * Used in DraftPlanClient and similar contexts where the player identifier is 'id'.
 */
export interface Player extends Omit<BasePlayer, 'sleeper_id'> {
    id: string; // primary identifier in draft plan context
    sleeper_id?: string; // optional in id-based contexts
    rank_overall?: number | null; // generic rank used in draft plan
    rank_tier?: number | null; // generic tier used in draft plan
}
