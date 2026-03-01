import { pgTable, text, integer, boolean, timestamp, jsonb, uuid, decimal, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// 1. Players Table (Master List)
export const players = pgTable("players", {
    sleeper_id: text("sleeper_id").primaryKey(),
    full_name: text("full_name").notNull(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    position: text("position"), // QB, RB, WR, TE, K, DEF
    team: text("team"), // NFL Team (e.g., MIN, KC)
    age: integer("age"),
    years_exp: integer("years_exp"),
    status: text("status"), // Active, Injured, etc.
    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        nameIdx: index("idx_players_name").on(table.full_name),
    };
});

// 2. League Table
export const leagues = pgTable("leagues", {
    league_id: text("league_id").primaryKey(),
    platform: text("platform").notNull(), // 'sleeper' or 'fleaflicker'
    scoring_format: text("scoring_format").notNull().default('sf'), // '1qb' or 'sf'
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

    updated_at: timestamp("updated_at").defaultNow(),
}, (table) => {
    return {
        valueSfIdx: index("idx_player_values_fc_value_sf").on(table.fc_value_sf),
        value1qbIdx: index("idx_player_values_fc_value_1qb").on(table.fc_value_1qb),
        rankSfIdx: index("idx_player_values_rank_sf").on(table.rank_sf_overall),
    };
});
