import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, varchar, numeric, decimal, index, unique, pgView } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. Players Table (Master List)
export const players = pgTable("players", {
    sleeper_id: text("sleeper_id").primaryKey(),
    gsis_id: text("gsis_id").unique(),
    full_name: text("full_name").notNull(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    position: text("position"), // QB, RB, WR, TE, K, DEF
    team: text("team"), // NFL Team (e.g., MIN, KC)
    age: integer("age"),
    years_exp: integer("years_exp"),
    rookie_year: integer("rookie_year"),
    status: text("status"), // Active, Injured, etc.
    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        nameIdx: index("idx_players_name").on(table.full_name),
        gsisIdx: index("idx_players_gsis").on(table.gsis_id),
    };
});

// 2. League Table
export const leagues = pgTable("leagues", {
    league_id: text("league_id").primaryKey(),
    platform: text("platform").notNull(), // 'sleeper' or 'fleaflicker'
    scoring_format: text("scoring_format").notNull().default('sf'), // '1qb' or 'sf'
    league_type: text("league_type").default('dynasty'), // 'dynasty', 'keeper', or 'redraft'
    keeper_count: integer("keeper_count"), // Number of keepers (for keeper leagues)
    name: text("name"),
    avatar: text("avatar"),
    total_rosters: integer("total_rosters"),
    start_positions: jsonb("start_positions"),
    roster_positions: jsonb("roster_positions"),
    scoring_settings: jsonb("scoring_settings"),
    last_synced_at: timestamp("last_synced_at"),
});

// 3. Rosters Table
export const rosters = pgTable("rosters", {
    id: uuid("id").primaryKey().defaultRandom(),
    league_id: text("league_id").references(() => leagues.league_id, { onDelete: "cascade" }),
    roster_id: text("roster_id").notNull(),
    owner_name: text("owner_name"),
    owner_id: text("owner_id"),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    fpts: decimal("fpts", { precision: 10, scale: 2 }),
    fpts_decimal: integer("fpts_decimal"),
    fpts_against: decimal("fpts_against", { precision: 10, scale: 2 }),
    fpts_against_decimal: integer("fpts_against_decimal"),
    updated_at: timestamp("updated_at").defaultNow(),
});

// 4. Roster_Players (Join Table)
export const rosterPlayers = pgTable("roster_players", {
    roster_id: uuid("roster_id").references(() => rosters.id, { onDelete: "cascade" }),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    is_starter: boolean("is_starter").default(false),
}, (table) => {
    return {
        pk: index("pk_roster_players").on(table.roster_id, table.sleeper_id),
    };
});

// 5. Player Values Table
export const playerValues = pgTable("player_values", {
    sleeper_id: text("sleeper_id").primaryKey().references(() => players.sleeper_id, { onDelete: "cascade" }),

    // FantasyCalc Data - Superflex
    fc_value_sf: integer("fc_value_sf"),
    fc_rank_sf: integer("fc_rank_sf"),
    fc_position_rank_sf: integer("fc_position_rank_sf"),

    // FantasyCalc Data - 1QB
    fc_value_1qb: integer("fc_value_1qb"),
    fc_rank_1qb: integer("fc_rank_1qb"),
    fc_position_rank_1qb: integer("fc_position_rank_1qb"),

    // Legacy field (keep for backward compatibility, will use SF)
    fc_value: integer("fc_value"),
    fc_rank: integer("fc_rank"),

    fc_trend_30_day: integer("fc_trend_30_day"),
    fc_combined_value: integer("fc_combined_value"),
    fc_trade_frequency: decimal("fc_trade_frequency", { precision: 6, scale: 4 }),
    redraft_value: integer("redraft_value"),

    // KTC Data
    ktc_value: integer("ktc_value"),

    // Proprietary Ranks
    rank_1qb_overall: integer("rank_1qb_overall"),
    rank_1qb_tier: integer("rank_1qb_tier"),
    rank_1qb_pos: integer("rank_1qb_pos"),

    rank_sf_overall: integer("rank_sf_overall"),
    rank_sf_tier: integer("rank_sf_tier"),
    rank_sf_pos: integer("rank_sf_pos"),

    // When VFF rankings were last uploaded (per format)
    rank_1qb_updated_at: timestamp("rank_1qb_updated_at"),
    rank_sf_updated_at: timestamp("rank_sf_updated_at"),

    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        valueSfIdx: index("idx_player_values_fc_value_sf").on(table.fc_value_sf),
        value1qbIdx: index("idx_player_values_fc_value_1qb").on(table.fc_value_1qb),
        rankSfIdx: index("idx_player_values_rank_sf").on(table.rank_sf_overall),
    };
});

// 5b. Rankings History Table (archives VFF rankings per upload)
export const rankingsHistory = pgTable("rankings_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    category: text("category").notNull(), // '1qb' or 'sf'
    overall: integer("overall"),
    pos_rank: integer("pos_rank"),
    tier: integer("tier"),
    recorded_at: timestamp("recorded_at").notNull(), // when this snapshot was taken
}, (table) => {
    return {
        playerCatIdx: index("idx_rankings_history_player_cat").on(table.sleeper_id, table.category),
        recordedIdx: index("idx_rankings_history_recorded").on(table.recorded_at),
    };
});

// 6. Ranking Sources Table
export const rankingSources = pgTable("ranking_sources", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    display_name: text("display_name").notNull(),
    description: text("description"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
});

// 7. Custom Rankings Table
export const customRankings = pgTable("custom_rankings", {
    id: uuid("id").primaryKey().defaultRandom(),
    source_id: uuid("source_id").references(() => rankingSources.id, { onDelete: "cascade" }),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    rank: integer("rank"),
    notes: text("notes"),
    signal: text("signal"), // 'Super Buy', 'Buy', 'Hold', 'Sell', 'Super Sell'
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        sourcePlayerIdx: index("idx_custom_rankings_source_player").on(table.source_id, table.sleeper_id),
        rankIdx: index("idx_custom_rankings_rank").on(table.source_id, table.rank),
    };
});

// 8. Weekly Player Stats Table
export const weeklyPlayerStats = pgTable("weekly_player_stats", {
    id: uuid("id").primaryKey().defaultRandom(),
    gsis_id: text("gsis_id").notNull(),
    season: integer("season").notNull(),
    week: integer("week").notNull(),

    // Opportunity Metrics
    targets: integer("targets"),
    air_yards: integer("air_yards"),
    routes_run: integer("routes_run"),
    snaps: integer("snaps"),

    // High-Value Touches
    red_zone_targets: integer("red_zone_targets"),
    inside_five_rushes: integer("inside_five_rushes"),

    // Production
    receptions: integer("receptions"),
    receiving_yards: integer("receiving_yards"),
    receiving_tds: integer("receiving_tds"),
    carries: integer("carries"),
    rushing_yards: integer("rushing_yards"),
    rushing_tds: integer("rushing_tds"),

    // Passing
    completions: integer("completions"),
    attempts: integer("attempts"),
    passing_yards: integer("passing_yards"),
    passing_tds: integer("passing_tds"),
    interceptions: integer("interceptions"),

    // Advanced Metrics (from nfl_data_py)
    target_share: decimal("target_share", { precision: 5, scale: 4 }),
    air_yards_share: decimal("air_yards_share", { precision: 5, scale: 4 }),
    wopr: decimal("wopr", { precision: 5, scale: 4 }),  // Weighted Opportunity Rating
    racr: decimal("racr", { precision: 6, scale: 2 }),  // Receiver Air Conversion Ratio
    fantasy_points: decimal("fantasy_points", { precision: 6, scale: 2 }),
    fantasy_points_ppr: decimal("fantasy_points_ppr", { precision: 6, scale: 2 }),

    // Expected Points
    expected_fantasy_points: decimal("expected_fantasy_points", { precision: 6, scale: 2 }),

    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        uniquePlayerWeek: unique("unique_player_week").on(table.gsis_id, table.season, table.week),
        gsisIdx: index("idx_weekly_stats_gsis").on(table.gsis_id),
        seasonWeekIdx: index("idx_weekly_stats_season_week").on(table.season, table.week),
    };
});

// 9. Weekly Roster Snapshots Table
export const weeklyRosterSnapshots = pgTable("weekly_roster_snapshots", {
    id: uuid("id").primaryKey().defaultRandom(),
    roster_id: uuid("roster_id").references(() => rosters.id, { onDelete: "cascade" }),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    week: integer("week").notNull(),
    is_starter: boolean("is_starter").default(false),
    roster_slot: text("roster_slot"),
    created_at: timestamp("created_at").defaultNow(),
}, (table) => {
    return {
        uniqueSnapshot: unique("unique_weekly_snapshot").on(table.roster_id, table.sleeper_id, table.week),
    };
});

// View: Receiver Opportunity (WOPR calculation)
export const receiverOpportunity = pgView("v_receiver_opportunity", {
    gsis_id: varchar("gsis_id"), // It's safer to use varchar to match your players table
    season: integer("season"),
    week: integer("week"),
    targets: integer("targets"),
    air_yards: numeric("air_yards"),
    target_share: numeric("target_share"),
    air_yard_share: numeric("air_yard_share"),
    wopr: numeric("wopr"),
}).existing();

// Prospect Data Table (Late Round Guide)
export const prospectData = pgTable("prospect_data", {
    id: uuid("id").primaryKey().defaultRandom(),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    full_name: text("full_name").notNull(),
    position: text("position").notNull(), // WR, RB, TE
    college: text("college"),
    draft_year: integer("draft_year").notNull(), // e.g., 2025
    
    // ZAP Model Data
    zap_score: decimal("zap_score", { precision: 5, scale: 2 }),
    zap_category: text("zap_category"), // Elite Producer, Weekly Starter, etc.
    breakout_score: decimal("breakout_score", { precision: 5, scale: 2 }),
    draft_capital_delta: text("draft_capital_delta"), // Low Risk, Neutral, High Risk
    
    // Physical Attributes
    height: text("height"),
    weight: integer("weight"),
    
    // Comparables & Analysis
    statistical_comparables: text("statistical_comparables"),
    analysis_text: text("analysis_text"),
    
    // Year 2 Data (for returning players)
    is_year_2: boolean("is_year_2").default(false),
    
    // Rookie Rankings (from Late Round guide)
    rookie_rank: integer("rookie_rank"),
    rookie_pos_rank: integer("rookie_pos_rank"),
    rookie_tier: integer("rookie_tier"),
    
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        nameIdx: index("idx_prospect_name").on(table.full_name),
        yearIdx: index("idx_prospect_year").on(table.draft_year),
    };
});

// Prospect Writeups Table (multi-source, reusable)
export const prospectWriteups = pgTable("prospect_writeups", {
    id: uuid("id").primaryKey().defaultRandom(),
    sleeper_id: text("sleeper_id").references(() => players.sleeper_id, { onDelete: "cascade" }),
    full_name: text("full_name").notNull(),
    position: text("position"),
    source: text("source").notNull(), // e.g., 'reception_perception', 'pff', etc.
    draft_year: integer("draft_year").notNull(),
    analysis_text: text("analysis_text").notNull(),
    // AI-generated sentiment analysis
    ai_confidence: integer("ai_confidence"), // 1-10
    ai_summary: text("ai_summary"),
    ai_bull_case: text("ai_bull_case"),
    ai_bear_case: text("ai_bear_case"),
    ai_comps: text("ai_comps"), // player comparisons
    created_at: timestamp("created_at").defaultNow(),
}, (table) => {
    return {
        nameIdx: index("idx_writeup_name").on(table.full_name),
        sourceIdx: index("idx_writeup_source").on(table.source),
        sleeperSourceIdx: index("idx_writeup_sleeper_source").on(table.sleeper_id, table.source),
        uniqueNameSource: unique("unique_writeup_name_source").on(table.full_name, table.source, table.draft_year),
    };
});

// Draft History Table
export const draftHistory = pgTable("draft_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    league_id: text("league_id").notNull(),
    user_id: text("user_id").notNull(), // sleeper or fleaflicker username
    platform: text("platform").notNull(), // 'sleeper' or 'fleaflicker'
    mode: text("mode").notNull(), // 'mock' or 'live'
    draft_data: jsonb("draft_data").notNull(), // full picks, grades, teams
    created_at: timestamp("created_at").defaultNow(),
}, (table) => {
    return {
        userLeagueIdx: index("idx_draft_history_user_league").on(table.user_id, table.league_id),
    };
});
