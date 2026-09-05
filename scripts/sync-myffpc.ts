/**
 * Sync MyFFPC leagues into Volatile's shared tables — cookie/browser based.
 *
 * MyFFPC is an ASP.NET WebForms app: switching teams is a __doPostBack on the
 * same URL (no per-team URL), so we can't do a plain fetch loop like Yahoo.
 * Instead we drive the PERSISTENT Playwright profile (already logged in from
 * `npm run myffpc:refresh`/`yahoo:refresh`) to select each team from the
 * `cboTeams` dropdown, read the rendered roster HTML, parse it, and upsert into
 * the SAME leagues / rosters / roster_players tables the paste flow uses
 * (platform='myffpc'). Because it writes those shared tables, the unified
 * /db-league/myffpc/... views work unchanged.
 *
 * Config (.env.local):
 *   MYFFPC_LEAGUES=<ltuid>:<existing_league_id>[,<ltuid2>:<league_id2>...]
 *     e.g. MYFFPC_LEAGUES=693-B3820364A9C9:myffpc_1787777544107
 *   (ltuid is the value in the LeagueHome URL ?ltuid=...; league_id is the
 *    existing myffpc_... row so we UPDATE in place rather than create a dup.)
 *
 * This needs a real browser, so it runs locally (not on Vercel cron) — matching
 * how Yahoo is operated. Invoke via `npm run myffpc:refresh` (harvests session
 * + runs this) or directly `npm run myffpc:sync` if already logged in.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as path from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { load } from 'cheerio';
import { parseMyFFPCRosterHtml } from '../src/lib/myffpc-parser';
import { cleanseName } from '../src/lib/nameUtils';

const PROFILE_DIR = path.resolve(process.cwd(), 'scripts/.yahoo-profile'); // shared logged-in profile
const HOST = 'https://myffpc.com';
const TEAM_SELECT_ID = '#cphContent_cphContent_cphContent_cboTeams';

interface LeagueTarget { ltuid: string; leagueId: string; }

function parseLeagueTargets(): LeagueTarget[] {
    const raw = process.env.MYFFPC_LEAGUES || '';
    const targets: LeagueTarget[] = [];
    for (const pair of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        const [ltuid, leagueId] = pair.split(':').map(s => s.trim());
        if (ltuid && leagueId) targets.push({ ltuid, leagueId });
    }
    return targets;
}

/** Read one team's rendered roster HTML by navigating directly to its page. */
async function readTeam(context: BrowserContext, ltuid: string, viewingTeam: number): Promise<string> {
    const page = context.pages()[0] || await context.newPage();
    // Retry: WebForms pages occasionally return before the roster repeater has
    // painted, yielding 0 players. Reload until we see player anchors.
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.goto(`${HOST}/SetLineup.aspx?ltuid=${ltuid}&viewingTeam=${viewingTeam}`, { waitUntil: 'networkidle' });
        // Wait for at least one actual player link to render.
        const ok = await page.waitForSelector('a[href*="PlayerProfile.aspx"]', { timeout: 15000 }).then(() => true).catch(() => false);
        if (ok) {
            // Give the rest of the rows a beat to finish rendering.
            await page.waitForTimeout(500);
            return page.content();
        }
        await page.waitForTimeout(800 * attempt);
    }
    // Last resort — return whatever we have (caller logs 0 players).
    return page.content();
}

async function syncLeague(context: BrowserContext, target: LeagueTarget) {
    const { db } = await import('../src/db');
    const { leagues, rosters, rosterPlayers, players } = await import('../src/db/schema');
    const { eq } = await import('drizzle-orm');

    const page = context.pages()[0] || await context.newPage();
    // Load one team's SetLineup page — it carries the cboTeams dropdown with the
    // full team list (value=viewingTeam, text=team name). This is present on
    // SetLineup.aspx (unlike LeagueHome.aspx).
    const firstUrl = `${HOST}/SetLineup.aspx?ltuid=${target.ltuid}&viewingTeam=1`;
    await page.goto(firstUrl, { waitUntil: 'networkidle' });

    // Bounce detection: if we got redirected to a login page, fail loudly.
    if (/login/i.test(page.url()) || (await page.title()).toLowerCase().includes('log in')) {
        throw new Error(`MyFFPC session not logged in (redirected to ${page.url()}). Run "npm run myffpc:refresh".`);
    }

    await page.waitForSelector(`${TEAM_SELECT_ID} option`, { timeout: 15000 }).catch(() => {});
    const teams = await page.$$eval(`${TEAM_SELECT_ID} option`, els =>
        els.map(e => ({ viewingTeam: parseInt((e as HTMLOptionElement).value), name: (e.textContent || '').trim().replace(/\s+/g, ' ') }))
            .filter(t => Number.isFinite(t.viewingTeam) && t.name)
    );

    if (teams.length === 0) {
        const diagUrl = page.url();
        const diagTitle = await page.title();
        const bodyText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
        const shotPath = path.resolve(process.cwd(), 'scripts/.myffpc-debug.png');
        await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
        console.error(`\n[diag] url=${diagUrl}`);
        console.error(`[diag] title="${diagTitle}"`);
        console.error(`[diag] body starts: "${bodyText}"`);
        console.error(`[diag] screenshot saved: ${shotPath}`);
        throw new Error(`MyFFPC ${target.ltuid}: no teams found in ${TEAM_SELECT_ID}. See [diag] above.`);
    }
    console.log(`  found ${teams.length} teams`);

    // Name → sleeper_id map (defense included; matched by cleanseName).
    const allPlayers = await db.select({ sleeper_id: players.sleeper_id, full_name: players.full_name }).from(players);
    const nameToId = new Map<string, string>();
    for (const p of allPlayers) nameToId.set(cleanseName(p.full_name), p.sleeper_id);
    // Defense sleeper_ids are stored as DEF_{ABBR}; MyFFPC gives "SEA DST".
    const defByAbbr = new Map<string, string>();
    for (const p of allPlayers) {
        const m = p.sleeper_id.match(/^DEF_([A-Z]{2,4})$/);
        if (m) defByAbbr.set(m[1], p.sleeper_id);
    }
    const MYFFPC_TO_SLEEPER_ABBR: Record<string, string> = { JAC: 'JAX' };

    const results = { league: target.leagueId, teams: 0, matched: 0, unmatched: 0 };

    // Replace the league's rosters (mirror the paste PUT flow).
    await db.delete(rosters).where(eq(rosters.league_id, target.leagueId));

    let rosterIdx = 0;
    for (const team of teams) {
        const html = await readTeam(context, target.ltuid, team.viewingTeam);
        const $ = load(html);
        const parsed = parseMyFFPCRosterHtml($, team.name);
        rosterIdx++;
        results.teams++;

        const [insertedRoster] = await db.insert(rosters).values({
            league_id: target.leagueId,
            roster_id: `${target.leagueId}_roster_${team.viewingTeam}`,
            owner_name: team.name,
        }).returning({ id: rosters.id });

        const seen = new Set<string>();
        const rows: { roster_id: string; sleeper_id: string; is_starter: boolean }[] = [];
        for (const pl of parsed.players) {
            let sleeperId: string | undefined;
            if (pl.position === 'DST' && pl.team) {
                const abbr = MYFFPC_TO_SLEEPER_ABBR[pl.team] || pl.team;
                sleeperId = defByAbbr.get(abbr);
            } else {
                sleeperId = nameToId.get(pl.normalizedName);
            }
            if (sleeperId) {
                if (!seen.has(sleeperId)) { seen.add(sleeperId); rows.push({ roster_id: insertedRoster.id, sleeper_id: sleeperId, is_starter: pl.isStarter }); }
                results.matched++;
            } else {
                results.unmatched++;
                // Kickers are expected-unmatched (Chino doesn't rank K) — keep quiet-ish.
                if (pl.position !== 'PK') console.warn(`  [unmatched] ${pl.rawName} (${pl.position})`);
            }
        }
        if (rows.length > 0) await db.insert(rosterPlayers).values(rows);
        console.log(`  team ${rosterIdx}/${teams.length}: ${team.name} — ${rows.length} players`);
    }

    await db.update(leagues).set({ total_rosters: results.teams, last_synced_at: new Date() }).where(eq(leagues.league_id, target.leagueId));
    return results;
}

export async function syncAllMyffpcLeagues() {
    const targets = parseLeagueTargets();
    if (targets.length === 0) {
        throw new Error('No MyFFPC leagues configured. Set MYFFPC_LEAGUES=<ltuid>:<league_id> in .env.local (e.g. 693-B3820364A9C9:myffpc_1787777544107).');
    }
    const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: true });
    try {
        const out = [];
        for (const t of targets) {
            console.log(`[myffpc] syncing ${t.ltuid} → ${t.leagueId} ...`);
            const r = await syncLeague(context, t);
            console.log(`[myffpc] ${t.leagueId}: ${r.teams} teams, matched ${r.matched}, unmatched ${r.unmatched}`);
            out.push(r);
        }
        return out;
    } finally {
        await context.close();
    }
}

if (require.main === module) {
    syncAllMyffpcLeagues()
        .then(res => { console.log('\n✅ MyFFPC sync complete:', res); process.exit(0); })
        .catch(err => { console.error('\n❌ MyFFPC sync failed:', err); process.exit(1); });
}
