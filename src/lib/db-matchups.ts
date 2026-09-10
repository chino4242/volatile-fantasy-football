/**
 * Weekly H2H matchup resolvers for the DB-backed platforms (Yahoo, MyFFPC) —
 * for the Game-Day Rooting Guide.
 *
 * Starters for both platforms already live in the DB (roster_players.is_starter,
 * from the sync). What's NOT stored is the current-week OPPONENT, so we scrape
 * just that:
 *   - Yahoo:  /f1/{league}/{team}/matchup → the two team-name links are the H2H
 *             pair (my team + opponent team number).
 *   - MyFFPC: SetLineup page → #..._TeamBanner_hlCurrentOpponent = opponent name.
 *
 * We then pull both sides' starter sleeper_ids from the DB and return the
 * normalized shape the rooting-guide engine consumes.
 *
 * Yahoo uses a plain cookie fetch (server-rendered). MyFFPC is a WebForms
 * postback app → driven via the persistent Playwright profile (server-only,
 * so this module must only be imported from server code / scripts).
 */

import { db } from '@/db';
import { leagues, rosters, rosterPlayers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { load } from 'cheerio';
import type { LeagueMatchupInput } from './rooting-guide';

const YAHOO_HOST = 'https://football.fantasysports.yahoo.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** All rosters for a DB league with their starters (sleeper_ids), keyed both by
 *  the real roster_id and by owner name (for opponent matching). */
async function loadLeagueRostersWithStarters(appLeagueId: string) {
    const rs = await db.select({ id: rosters.id, roster_id: rosters.roster_id, owner_name: rosters.owner_name })
        .from(rosters).where(eq(rosters.league_id, appLeagueId));
    const rpAll = await db.select({ roster_id: rosterPlayers.roster_id, sleeper_id: rosterPlayers.sleeper_id, is_starter: rosterPlayers.is_starter })
        .from(rosterPlayers);
    const startersByRosterUuid = new Map<string, string[]>();
    for (const rp of rpAll) {
        if (!rp.roster_id || !rp.sleeper_id || !rp.is_starter) continue;
        if (!startersByRosterUuid.has(rp.roster_id)) startersByRosterUuid.set(rp.roster_id, []);
        startersByRosterUuid.get(rp.roster_id)!.push(rp.sleeper_id);
    }
    // creation order = the same order the portfolio adapter uses for numericId (idx+1)
    return rs.map((r, idx) => ({
        numericId: idx + 1,
        rosterId: r.roster_id,
        uuid: r.id,
        ownerName: r.owner_name || `Team ${idx + 1}`,
        starters: startersByRosterUuid.get(r.id) || [],
    }));
}

/** cleanse an owner/team name for matching (lowercase, collapse whitespace). */
function nk(s: string): string { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }

// ── Yahoo ────────────────────────────────────────────────────────────────
async function yahooFetch(path: string): Promise<string | null> {
    const cookie = process.env.YAHOO_COOKIE;
    if (!cookie) return null;
    try {
        const res = await fetch(`${YAHOO_HOST}${path}`, { headers: { cookie, 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', cache: 'no-store' });
        if (/login\.yahoo\.com/i.test(res.url)) return null;
        if (!res.ok) return null;
        return await res.text();
    } catch { return null; }
}

/** Scrape the Yahoo matchup page for my team → the opponent team number.
 *  The matchup page links to exactly the two teams in the H2H (mine + opponent)
 *  via /f1/{league}/{teamNum} hrefs. We collect those team numbers and take the
 *  one that isn't mine. (Class-based selectors like `Fz-xxl` are brittle — Yahoo
 *  periodically obfuscates class names — so we key off the stable href pattern.) */
async function yahooOpponentTeamNum(yahooLeagueId: string, myTeamNum: string): Promise<string | null> {
    const html = await yahooFetch(`/f1/${yahooLeagueId}/${myTeamNum}/matchup`);
    if (!html) return null;
    const $ = load(html);
    const hrefRe = new RegExp(`/f1/${yahooLeagueId}/(\\d+)(?:$|[/?#])`);
    const nums = new Set<string>();
    $('a[href*="/f1/"]').each((_, a) => {
        const m = ($(a).attr('href') || '').match(hrefRe);
        if (m) nums.add(m[1]);
    });
    const others = [...nums].filter(n => n !== String(myTeamNum));
    // The matchup page should reference exactly one other team (the opponent).
    // If more slip through (nav links etc.), prefer the first non-self.
    return others[0] || null;
}

/**
 * Resolve a Yahoo league's rooting matchup. `myRosterId` is the portfolio
 * numericId (String) from useMyTeams; Yahoo's rosters.roster_id IS the team num,
 * so we map numericId → roster_id → scrape opponent by team number.
 */
export async function resolveYahooMatchup(appLeagueId: string, myRosterId: string, leagueName: string): Promise<LeagueMatchupInput | null> {
    const [lg] = await db.select({ league_id: leagues.league_id, last_synced_at: leagues.last_synced_at }).from(leagues).where(eq(leagues.league_id, appLeagueId));
    if (!lg) return null;
    // Yahoo appLeagueId is the numeric Yahoo league id (yl.league_key).
    const yahooLeagueId = appLeagueId;

    const rosterList = await loadLeagueRostersWithStarters(appLeagueId);
    const mine = rosterList.find(r => String(r.numericId) === String(myRosterId));
    if (!mine) return null;
    const myTeamNum = mine.rosterId; // Yahoo roster_id = team number

    const oppTeamNum = await yahooOpponentTeamNum(yahooLeagueId, myTeamNum);
    if (!oppTeamNum) return null;
    const opp = rosterList.find(r => r.rosterId === oppTeamNum);
    if (!opp) return null;

    return {
        leagueId: appLeagueId, leagueName, platform: 'yahoo',
        myStarterIds: mine.starters,
        oppStarterIds: opp.starters,
        opponentName: opp.ownerName,
        lastSynced: lg.last_synced_at ? lg.last_synced_at.toISOString() : null,
    };
}

// ── MyFFPC (browser-driven; WebForms postback) ──────────────────────────────
/**
 * Resolve a MyFFPC league's rooting matchup. Reads the current-opponent name off
 * my team's SetLineup page, then matches it to the opponent roster by owner name.
 * Requires the persistent Playwright profile + MYFFPC_LEAGUES (ltuid mapping).
 */
export async function resolveMyffpcMatchup(appLeagueId: string, myRosterId: string, leagueName: string): Promise<LeagueMatchupInput | null> {
    const ltuid = myffpcLtuidFor(appLeagueId);
    if (!ltuid) return null;

    const rosterList = await loadLeagueRostersWithStarters(appLeagueId);
    const mine = rosterList.find(r => String(r.numericId) === String(myRosterId));
    if (!mine) return null;
    // MyFFPC roster_id = "..._roster_{viewingTeam}"
    const myViewingTeam = mine.rosterId.match(/_roster_(\d+)$/)?.[1];
    if (!myViewingTeam) return null;

    const oppName = await myffpcCurrentOpponentName(ltuid, myViewingTeam);
    if (!oppName) return null;
    const opp = rosterList.find(r => nk(r.ownerName) === nk(oppName));
    if (!opp) return null;

    const [lg] = await db.select({ last_synced_at: leagues.last_synced_at }).from(leagues).where(eq(leagues.league_id, appLeagueId));

    return {
        leagueId: appLeagueId, leagueName, platform: 'myffpc',
        myStarterIds: mine.starters,
        oppStarterIds: opp.starters,
        opponentName: opp.ownerName,
        lastSynced: lg?.last_synced_at ? lg.last_synced_at.toISOString() : null,
    };
}

function myffpcLtuidFor(appLeagueId: string): string | null {
    const raw = process.env.MYFFPC_LEAGUES || '';
    for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        const [ltuid, leagueId] = pair.split(':').map(s => s.trim());
        if (leagueId === appLeagueId) return ltuid;
    }
    return null;
}

/** Drive the persistent browser to read my team's current-opponent name. */
async function myffpcCurrentOpponentName(ltuid: string, viewingTeam: string): Promise<string | null> {
    const path = await import('node:path');
    const { chromium } = await import('playwright');
    const profileDir = path.resolve(process.cwd(), 'scripts/.yahoo-profile');
    let ctx: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
    try {
        ctx = await chromium.launchPersistentContext(profileDir, { headless: true });
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.goto(`https://myffpc.com/SetLineup.aspx?ltuid=${ltuid}&viewingTeam=${viewingTeam}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const name = await page.$eval('#cphContent_cphContent_cphContent_TeamBanner_hlCurrentOpponent', el => el.textContent?.trim() || '').catch(() => '');
        return name || null;
    } catch {
        return null;
    } finally {
        if (ctx) await ctx.close();
    }
}
