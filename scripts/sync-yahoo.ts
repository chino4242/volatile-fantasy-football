/**
 * Sync Yahoo leagues into Volatile's shared tables.
 *
 * Reads league IDs from YAHOO_LEAGUE_IDS (comma-separated numeric Yahoo league
 * ids, e.g. "832633,853810"), reads each via the fetch+cheerio Yahoo reader
 * (uses the YAHOO_COOKIE env cookie), matches players to the players DB by
 * normalized name (defenses by team nickname/abbr), and upserts into the SAME
 * leagues / rosters / roster_players tables MyFFPC uses (platform='yahoo').
 *
 * Because it writes to those shared tables, every existing feature — league
 * page, team pages, free agents, Suggested Transactions — works for Yahoo for
 * free. No Yahoo-specific UI.
 *
 * Runtime: fetch + cheerio (no browser), so it runs on Vercel serverless cron
 * as well as locally.
 *
 * Setup:  npm run yahoo:refresh  (harvest cookie → write .env.local → sync,
 *         all in one command).  Or the lower-level pieces: npm run yahoo:login
 *         (print cookie to paste) then npm run yahoo:sync.
 * Env:    YAHOO_COOKIE, YAHOO_LEAGUE_IDS
 * Usage:  npm run yahoo:sync
 */

import * as dotenv from 'dotenv';
// Load local env BEFORE any module that reads env at import time (e.g. src/db,
// which throws if DATABASE_URL is unset). All app modules are dynamically
// imported inside the functions below so this runs first. In the Vercel/cron
// runtime .env.local won't exist and env is already populated — no-op there.
dotenv.config({ path: '.env.local' });

import type { YahooLeague } from '../src/lib/yahoo';

/** Map Yahoo roster_positions into the app's start_positions array (excludes bench/IR). */
function toStartPositions(rp: { position: string; count: number }[]): string[] {
    const out: string[] = [];
    for (const { position, count } of rp) {
        if (position === 'BN' || position === 'IR') continue;
        for (let i = 0; i < count; i++) out.push(position);
    }
    return out;
}

function toRosterPositions(rp: { position: string; count: number }[]): string[] {
    const out: string[] = [];
    for (const { position, count } of rp) {
        for (let i = 0; i < count; i++) out.push(position);
    }
    return out;
}

/** Infer the app's scoring_format ('1qb' | 'sf') from starting QB-eligible slots. */
function inferFormat(numQbStarters: number): '1qb' | 'sf' {
    return numQbStarters >= 2 ? 'sf' : '1qb';
}

// Yahoo returns team defenses as bare nicknames ("Ravens", "Eagles"). Our DB
// stores them as DEF_{ABBR} ("Baltimore Ravens DEF"). Map nickname → sleeper_id.
const DEF_NICKNAME_TO_ID: Record<string, string> = {
    cardinals: 'DEF_ARI', falcons: 'DEF_ATL', ravens: 'DEF_BAL', bills: 'DEF_BUF',
    panthers: 'DEF_CAR', bears: 'DEF_CHI', bengals: 'DEF_CIN', browns: 'DEF_CLE',
    cowboys: 'DEF_DAL', broncos: 'DEF_DEN', lions: 'DEF_DET', packers: 'DEF_GB',
    texans: 'DEF_HOU', colts: 'DEF_IND', jaguars: 'DEF_JAX', chiefs: 'DEF_KC',
    chargers: 'DEF_LAC', rams: 'DEF_LAR', raiders: 'DEF_LV', dolphins: 'DEF_MIA',
    vikings: 'DEF_MIN', patriots: 'DEF_NE', saints: 'DEF_NO', giants: 'DEF_NYG',
    jets: 'DEF_NYJ', eagles: 'DEF_PHI', steelers: 'DEF_PIT', seahawks: 'DEF_SEA',
    '49ers': 'DEF_SF', buccaneers: 'DEF_TB', titans: 'DEF_TEN', commanders: 'DEF_WAS',
    football: 'DEF_WAS',
    niners: 'DEF_SF',
};

/** Yahoo NFL team abbr → our DEF sleeper_id (fallback when nickname is ambiguous). */
const DEF_ABBR_TO_ID: Record<string, string> = {
    ARI: 'DEF_ARI', ATL: 'DEF_ATL', BAL: 'DEF_BAL', BUF: 'DEF_BUF', CAR: 'DEF_CAR',
    CHI: 'DEF_CHI', CIN: 'DEF_CIN', CLE: 'DEF_CLE', DAL: 'DEF_DAL', DEN: 'DEF_DEN',
    DET: 'DEF_DET', GB: 'DEF_GB', HOU: 'DEF_HOU', IND: 'DEF_IND', JAX: 'DEF_JAX',
    JAC: 'DEF_JAX', KC: 'DEF_KC', LAC: 'DEF_LAC', LAR: 'DEF_LAR', LA: 'DEF_LAR',
    LV: 'DEF_LV', OAK: 'DEF_LV', MIA: 'DEF_MIA', MIN: 'DEF_MIN', NE: 'DEF_NE',
    NO: 'DEF_NO', NYG: 'DEF_NYG', NYJ: 'DEF_NYJ', PHI: 'DEF_PHI', PIT: 'DEF_PIT',
    SEA: 'DEF_SEA', SF: 'DEF_SF', TB: 'DEF_TB', TEN: 'DEF_TEN', WAS: 'DEF_WAS',
    WSH: 'DEF_WAS',
};

/** Resolve a Yahoo DEF entry to our DEF sleeper_id via nickname, then abbr. */
function matchDefense(fullName: string, teamAbbr: string | null): string | null {
    const nick = fullName.trim().toLowerCase().split(/\s+/).pop() || '';
    if (DEF_NICKNAME_TO_ID[nick]) return DEF_NICKNAME_TO_ID[nick];
    if (teamAbbr && DEF_ABBR_TO_ID[teamAbbr.toUpperCase()]) return DEF_ABBR_TO_ID[teamAbbr.toUpperCase()];
    return null;
}

export async function syncYahooLeague(leagueKey: string): Promise<{ leagueId: string; matched: number; unmatched: number }> {
    // Dynamic imports so dotenv.config() (above) runs before src/db reads env.
    const { db } = await import('../src/db');
    const { players, leagues, rosters, rosterPlayers } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');
    const { getYahooLeague } = await import('../src/lib/yahoo');
    const { cleanseName } = await import('../src/lib/nameUtils');

    const yl: YahooLeague = await getYahooLeague(leagueKey);

    // Build a normalized-name -> sleeper_id lookup from the players DB.
    const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
    const nameToId = new Map<string, string>();
    for (const p of allPlayers) {
        nameToId.set(cleanseName(p.full_name), p.sleeper_id);
    }
    const matchId = (name: string): string | null => nameToId.get(cleanseName(name)) || null;

    const appLeagueId = yl.league_key;
    const format = inferFormat(yl.settings.num_qb_starters);

    // 1. Upsert the league row.
    await db
        .insert(leagues)
        .values({
            league_id: appLeagueId,
            platform: 'yahoo',
            scoring_format: format,
            league_type: 'redraft',
            name: yl.name,
            total_rosters: yl.num_teams,
            start_positions: toStartPositions(yl.settings.roster_positions),
            roster_positions: toRosterPositions(yl.settings.roster_positions),
            last_synced_at: new Date(),
        })
        .onConflictDoUpdate({
            target: leagues.league_id,
            set: {
                name: yl.name,
                scoring_format: format,
                total_rosters: yl.num_teams,
                start_positions: toStartPositions(yl.settings.roster_positions),
                roster_positions: toRosterPositions(yl.settings.roster_positions),
                last_synced_at: new Date(),
            },
        });

    // 2. Replace rosters for this league (cascade deletes roster_players).
    await db.delete(rosters).where(eq(rosters.league_id, appLeagueId));

    let matched = 0;
    let unmatched = 0;

    for (const team of yl.teams) {
        const [insertedRoster] = await db
            .insert(rosters)
            .values({
                league_id: appLeagueId,
                roster_id: team.team_id,
                owner_name: team.manager || team.name,
                owner_id: team.team_key,
            })
            .returning({ id: rosters.id });

        const rows: { roster_id: string; sleeper_id: string; is_starter: boolean }[] = [];
        for (const p of team.players) {
            // Defenses: match by team nickname/abbr. Everyone else: normalized name.
            const sleeperId = p.position === 'DEF'
                ? matchDefense(p.full_name, p.team)
                : matchId(p.full_name);
            if (sleeperId) {
                rows.push({ roster_id: insertedRoster.id, sleeper_id: sleeperId, is_starter: p.is_starter });
                matched++;
            } else {
                unmatched++;
                console.warn(`  [unmatched] ${p.full_name} (${p.position || '?'}) — no DB player`);
            }
        }
        const seen = new Set<string>();
        const deduped = rows.filter(r => (seen.has(r.sleeper_id) ? false : (seen.add(r.sleeper_id), true)));
        if (deduped.length > 0) {
            await db.insert(rosterPlayers).values(deduped);
        }
    }

    return { leagueId: appLeagueId, matched, unmatched };
}

export async function syncAllYahooLeagues(): Promise<{ leagueId: string; matched: number; unmatched: number }[]> {
    const keysRaw = process.env.YAHOO_LEAGUE_IDS || process.env.YAHOO_LEAGUE_KEYS || '';
    const keys = keysRaw.split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) {
        throw new Error('No Yahoo league ids configured. Set YAHOO_LEAGUE_IDS (comma-separated numeric ids, e.g. "832633,853810").');
    }
    const results = [];
    for (const key of keys) {
        console.log(`[yahoo] syncing ${key} ...`);
        const r = await syncYahooLeague(key);
        console.log(`[yahoo] ${key}: matched ${r.matched}, unmatched ${r.unmatched}`);
        results.push(r);
    }
    return results;
}

// Allow running directly: npx tsx scripts/sync-yahoo.ts
if (require.main === module) {
    syncAllYahooLeagues()
        .then(res => {
            console.log('\n✅ Yahoo sync complete:', res);
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Yahoo sync failed:', err);
            process.exit(1);
        });
}
