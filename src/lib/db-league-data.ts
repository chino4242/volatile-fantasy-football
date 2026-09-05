/**
 * DB-backed league data adapter (MyFFPC + Yahoo).
 *
 * These platforms store their league state in the shared DB tables
 * (leagues, rosters, roster_players) instead of fetching live from an external
 * API like Sleeper/Fleaflicker. This adapter reads those tables and returns a
 * normalized shape the SHARED league/team/free-agent components expect — so the
 * DB-backed platforms get the same full functionality, differing only in how
 * the data was acquired.
 *
 * Roster identity: shared components (TradeEvaluator, TeamRosterTable) expect a
 * NUMERIC currentRosterId + ownership map. DB rosters use UUIDs, so we assign a
 * stable 1..N numeric index per roster (by creation order) and expose both.
 */

import { db } from '@/db';
import { leagues, rosters, rosterPlayers, players, playerValues, prospectData, prospectWriteups } from '@/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { cleanseName } from '@/lib/nameUtils';

export type DbPlatform = 'myffpc' | 'yahoo';

/** A player enriched with values + prospect/writeup data, shared-component ready. */
export interface DbLeaguePlayer {
    sleeper_id: string;
    full_name: string;
    position: string | null;
    team: string | null;
    age: number | null;
    years_exp: number | null;
    fc_value: number | null;
    fc_rank: number | null;
    fc_rank_sf: number | null;
    fc_rank_1qb: number | null;
    fc_position_rank_sf: number | null;
    fc_position_rank_1qb: number | null;
    fc_combined_value: number | null;
    fc_trade_frequency: number | null;
    fc_trend_30_day: number | null;
    rank_1qb_overall: number | null;
    rank_1qb_pos: number | null;
    rank_1qb_tier: number | null;
    rank_sf_overall: number | null;
    rank_sf_pos: number | null;
    rank_sf_tier: number | null;
    redraft_rank_overall: number | null;
    redraft_rank_pos: number | null;
    redraft_rank_tier: number | null;
    redraft_auction_value: number | null;
    zap_score: number | null;
    zap_category: string | null;
    zap_analysis: string | null;
    zap_comps: string | null;
    writeups: { source: string; analysis_text: string }[] | null;
    is_starter: boolean;
}

export interface DbLeagueTeam {
    numericId: number;      // stable 1..N index for shared components
    rosterUuid: string;     // DB rosters.id
    ownerName: string;
    players: DbLeaguePlayer[];
}

export interface DbLeagueData {
    platform: DbPlatform;
    leagueId: string;
    name: string;
    format: '1qb' | 'sf';
    rosterPositions: string[] | null;
    teams: DbLeagueTeam[];
    freeAgents: DbLeaguePlayer[];
    /** numeric roster id -> owner name */
    rosterToOwnerMap: Map<number, string>;
    /** player sleeper_id -> numeric roster id (who owns them) */
    playerOwnershipMap: Map<string, number>;
}

function num(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
}

/**
 * Fetch and normalize a DB-backed league. Returns null if not found or platform
 * mismatch (caller should notFound()).
 */
export async function getDbLeagueData(platform: DbPlatform, leagueId: string): Promise<DbLeagueData | null> {
    const [league] = await db.select().from(leagues).where(eq(leagues.league_id, leagueId));
    if (!league || league.platform !== platform) return null;

    const format = (league.scoring_format === 'sf' ? 'sf' : '1qb') as '1qb' | 'sf';

    const leagueRosters = await db.select().from(rosters).where(eq(rosters.league_id, leagueId));
    const rosterIds = leagueRosters.map(r => r.id);
    const allRosterPlayers = rosterIds.length > 0
        ? await db.select().from(rosterPlayers).where(inArray(rosterPlayers.roster_id, rosterIds))
        : [];

    const rosteredIds = [...new Set(allRosterPlayers.map(rp => rp.sleeper_id).filter(Boolean) as string[])];

    // Pull ALL players (for free agents) — same set the standalone views use.
    const valueCol = format === 'sf' ? playerValues.fc_value_sf : playerValues.fc_value_1qb;
    const allPlayers = await db
        .select({
            sleeper_id: players.sleeper_id,
            full_name: players.full_name,
            position: players.position,
            team: players.team,
            age: players.age,
            years_exp: players.years_exp,
            fc_value: valueCol,
            fc_rank: playerValues.fc_rank,
            fc_rank_sf: playerValues.fc_rank_sf,
            fc_rank_1qb: playerValues.fc_rank_1qb,
            fc_position_rank_sf: playerValues.fc_position_rank_sf,
            fc_position_rank_1qb: playerValues.fc_position_rank_1qb,
            fc_combined_value: playerValues.fc_combined_value,
            fc_trade_frequency: playerValues.fc_trade_frequency,
            fc_trend_30_day: playerValues.fc_trend_30_day,
            rank_1qb_overall: playerValues.rank_1qb_overall,
            rank_1qb_pos: playerValues.rank_1qb_pos,
            rank_1qb_tier: playerValues.rank_1qb_tier,
            rank_sf_overall: playerValues.rank_sf_overall,
            rank_sf_pos: playerValues.rank_sf_pos,
            rank_sf_tier: playerValues.rank_sf_tier,
            redraft_rank_overall: playerValues.redraft_rank_overall,
            redraft_rank_pos: playerValues.redraft_rank_pos,
            redraft_rank_tier: playerValues.redraft_rank_tier,
            redraft_auction_value: playerValues.redraft_auction_value,
        })
        .from(players)
        .leftJoin(playerValues, eq(players.sleeper_id, playerValues.sleeper_id))
        .where(sql`${players.position} IN ('QB','RB','WR','TE','K','DEF')`);

    // Prospect + writeup enrichment (name-keyed), mirroring the other pages.
    const currentYear = new Date().getFullYear();
    const prospectRows = await db
        .select({ full_name: prospectData.full_name, zap_score: prospectData.zap_score, zap_category: prospectData.zap_category, statistical_comparables: prospectData.statistical_comparables, analysis_text: prospectData.analysis_text })
        .from(prospectData).where(sql`${prospectData.draft_year} >= ${currentYear - 1}`);
    const zapByName = new Map(prospectRows.map(p => [cleanseName(p.full_name), p]));
    const writeupRows = await db
        .select({ full_name: prospectWriteups.full_name, source: prospectWriteups.source, analysis_text: prospectWriteups.analysis_text })
        .from(prospectWriteups).where(sql`${prospectWriteups.draft_year} >= ${currentYear - 1}`);
    const writeupsByName = new Map<string, { source: string; analysis_text: string }[]>();
    for (const w of writeupRows) {
        const key = cleanseName(w.full_name);
        if (!writeupsByName.has(key)) writeupsByName.set(key, []);
        writeupsByName.get(key)!.push({ source: w.source, analysis_text: w.analysis_text });
    }

    const enrich = (p: typeof allPlayers[number], isStarter = false): DbLeaguePlayer => {
        const zap = zapByName.get(cleanseName(p.full_name));
        return {
            sleeper_id: p.sleeper_id,
            full_name: p.full_name,
            position: p.position,
            team: p.team,
            age: p.age ?? null,
            years_exp: p.years_exp ?? null,
            fc_value: num(p.fc_value),
            fc_rank: num(p.fc_rank),
            fc_rank_sf: num(p.fc_rank_sf),
            fc_rank_1qb: num(p.fc_rank_1qb),
            fc_position_rank_sf: num(p.fc_position_rank_sf),
            fc_position_rank_1qb: num(p.fc_position_rank_1qb),
            fc_combined_value: num(p.fc_combined_value),
            fc_trade_frequency: num(p.fc_trade_frequency),
            fc_trend_30_day: num(p.fc_trend_30_day),
            rank_1qb_overall: num(p.rank_1qb_overall),
            rank_1qb_pos: num(p.rank_1qb_pos),
            rank_1qb_tier: num(p.rank_1qb_tier),
            rank_sf_overall: num(p.rank_sf_overall),
            rank_sf_pos: num(p.rank_sf_pos),
            rank_sf_tier: num(p.rank_sf_tier),
            redraft_rank_overall: num(p.redraft_rank_overall),
            redraft_rank_pos: num(p.redraft_rank_pos),
            redraft_rank_tier: num(p.redraft_rank_tier),
            redraft_auction_value: num(p.redraft_auction_value),
            zap_score: zap?.zap_score ? parseFloat(String(zap.zap_score)) : null,
            zap_category: zap?.zap_category || null,
            zap_analysis: zap?.analysis_text || null,
            zap_comps: zap?.statistical_comparables || null,
            writeups: writeupsByName.get(cleanseName(p.full_name)) || null,
            is_starter: isStarter,
        };
    };

    const playerById = new Map(allPlayers.map(p => [p.sleeper_id, p]));

    // Assign stable numeric ids by roster creation order.
    const rosterToOwnerMap = new Map<number, string>();
    const playerOwnershipMap = new Map<string, number>();

    const teams: DbLeagueTeam[] = leagueRosters.map((roster, idx) => {
        const numericId = idx + 1;
        const ownerName = roster.owner_name || `Team ${numericId}`;
        rosterToOwnerMap.set(numericId, ownerName);

        const teamRp = allRosterPlayers.filter(rp => rp.roster_id === roster.id);
        const teamPlayers: DbLeaguePlayer[] = [];
        for (const rp of teamRp) {
            if (!rp.sleeper_id) continue;
            const base = playerById.get(rp.sleeper_id);
            if (!base) continue;
            playerOwnershipMap.set(rp.sleeper_id, numericId);
            teamPlayers.push(enrich(base, rp.is_starter ?? false));
        }
        teamPlayers.sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0));
        return { numericId, rosterUuid: roster.id, ownerName, players: teamPlayers };
    });

    const rosteredSet = new Set(rosteredIds);
    const freeAgents = allPlayers
        .filter(p => !rosteredSet.has(p.sleeper_id))
        .map(p => enrich(p))
        .sort((a, b) => (b.fc_value || 0) - (a.fc_value || 0))
        .slice(0, 300);

    return {
        platform,
        leagueId,
        name: league.name || `${platform === 'yahoo' ? 'Yahoo' : 'MyFFPC'} League`,
        format,
        rosterPositions: (league.roster_positions as string[] | null) || null,
        teams,
        freeAgents,
        rosterToOwnerMap,
        playerOwnershipMap,
    };
}
