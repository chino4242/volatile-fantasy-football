/**
 * Refresh ALL DB-backed leagues (Yahoo + MyFFPC) in one command:
 *
 *     npm run leagues:refresh
 *
 * Both platforms read from the SAME persistent, gitignored browser profile
 * (scripts/.yahoo-profile/). This script opens that browser ONCE so you can
 * confirm you're logged into both Yahoo and MyFFPC, then:
 *   1. Captures the Yahoo cookie and VALIDATES it against a protected Yahoo page.
 *      If it's not authenticated yet (a timing race where you press Enter before
 *      Yahoo finishes setting the session), it re-prompts and re-captures — up
 *      to a few attempts — with the browser kept open.
 *   2. Writes the validated YAHOO_COOKIE into .env.local (and this process's env).
 *   3. Closes the browser (a persistent profile can't be open twice).
 *   4. Runs the Yahoo sync, then the MyFFPC sync — sequentially, since both
 *      reopen the same profile headless and can't run at once.
 *
 * One browser window, both leagues synced. Runs the syncs in order and reports
 * each; a failure in one does not stop the other.
 *
 * One-time prerequisite:  npx playwright install chromium
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium } from 'playwright';
import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { setEnvVar } from './lib/env-file';

const PROFILE_DIR = path.resolve(process.cwd(), 'scripts/.yahoo-profile');
const ENV_PATH = path.resolve(process.cwd(), '.env.local');
const YAHOO_START = 'https://football.fantasysports.yahoo.com/';
const YAHOO_DOMAIN = 'https://football.fantasysports.yahoo.com';

function waitForEnter(msg: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(msg, () => { rl.close(); resolve(); }));
}

function runScript(npmScript: string, label: string): Promise<number> {
    return new Promise(resolve => {
        console.log(`\n🔄 ${label}...\n`);
        const child = spawn('npm', ['run', npmScript], { stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('close', code => resolve(code ?? 1));
    });
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** A Yahoo URL that requires auth — a real league page if we know one, else the
 *  logged-in home. Used to prove the captured cookie is actually authenticated. */
function yahooProbeUrl(): string {
    const first = (process.env.YAHOO_LEAGUE_IDS || '').split(',').map(s => s.trim()).filter(Boolean)[0];
    return first
        ? `https://football.fantasysports.yahoo.com/f1/${first}/settings`
        : 'https://football.fantasysports.yahoo.com/f1';
}

/**
 * Fetch a protected Yahoo page with the given cookie and decide whether it's a
 * genuinely authenticated session. Mirrors the bounce detection in src/lib/yahoo.ts:
 * a login wall redirects to login.yahoo.com or has a "sign in" <title>.
 * Returns true when the cookie clearly works.
 */
async function validateYahooCookie(cookieHeader: string): Promise<boolean> {
    if (!cookieHeader || !/\bT=|\bA1=|\bA3=/.test(cookieHeader)) return false;
    try {
        const res = await fetch(yahooProbeUrl(), {
            headers: { Cookie: cookieHeader, 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
            redirect: 'follow', cache: 'no-store',
        });
        const html = await res.text();
        const finalUrl = res.url || '';
        const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();
        const bounced = /login\.yahoo\.com/i.test(finalUrl) || /sign\s*in to yahoo|^sign in\b/i.test(title);
        return res.ok && !bounced;
    } catch {
        return false;
    }
}

async function main() {
    console.log('\nOpening a browser with your saved profile.');
    console.log('Make sure you are logged into BOTH Yahoo Fantasy and MyFFPC.');
    console.log('(The window opens on Yahoo; if you need to log into MyFFPC too,');
    console.log(' open myffpc.com in another tab and sign in.) Then press Enter.\n');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(YAHOO_START, { waitUntil: 'domcontentloaded' });

    // Capture the Yahoo cookie, then VALIDATE it against a protected page before
    // trusting it. This defeats the timing race where you press Enter a beat
    // before Yahoo finishes setting the session cookie — instead of syncing with
    // a half-baked cookie and bouncing, we re-prompt and re-capture. The browser
    // stays open across attempts so you can finish/redo the login without a
    // fresh launch (the persistent profile can't be opened twice at once).
    const MAX_ATTEMPTS = 3;
    let cookieHeader = '';
    let validated = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = attempt === 1
            ? '➡  Once logged into BOTH Yahoo and MyFFPC, press Enter to capture the cookie and sync... '
            : `➡  Still not authenticated. Make sure your Yahoo team/league page is fully loaded, then press Enter to retry (attempt ${attempt}/${MAX_ATTEMPTS})... `;
        await waitForEnter(prompt);

        const cookies = await context.cookies(YAHOO_DOMAIN);
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        process.stdout.write('   Validating Yahoo session… ');
        validated = await validateYahooCookie(cookieHeader);
        console.log(validated ? '✅ authenticated' : '❌ not authenticated yet');
        if (validated) break;
    }

    await context.close();

    if (!validated) {
        console.error('\n⚠️  Could not validate a Yahoo session after several tries.');
        console.error('   Writing whatever cookie was captured; the Yahoo sync may bounce.');
        console.error('   Tip: fully open one of your Yahoo league pages in the browser before pressing Enter.');
    }

    if (cookieHeader && /\bT=|\bA1=|\bA3=/.test(cookieHeader)) {
        const { created, replaced } = setEnvVar(ENV_PATH, 'YAHOO_COOKIE', cookieHeader);
        console.log(created ? `\n✅ Created ${ENV_PATH} with YAHOO_COOKIE.`
            : replaced ? `\n✅ Updated YAHOO_COOKIE in ${ENV_PATH} (other lines preserved).`
            : `\n✅ Added YAHOO_COOKIE to ${ENV_PATH}.`);
        // Make the freshly-written cookie visible to yahoo:sync in THIS process's
        // env too (the child inherits it), so no reload timing matters.
        process.env.YAHOO_COOKIE = cookieHeader;
    } else {
        console.error('\n⚠️  No Yahoo session cookie captured (T=/A1=/A3= missing). Skipping Yahoo sync.');
    }

    // Run both syncs sequentially (shared profile can't be opened twice at once).
    // Only run Yahoo if we have a plausible cookie; MyFFPC always runs (profile-driven).
    const yahooCode = (cookieHeader && /\bT=|\bA1=|\bA3=/.test(cookieHeader))
        ? await runScript('yahoo:sync', 'Yahoo sync')
        : 1;
    const myffpcCode = await runScript('myffpc:sync', 'MyFFPC sync');

    console.log('\n──────── Refresh summary ────────');
    console.log(`  Yahoo:  ${yahooCode === 0 ? '✅ synced' : '❌ failed (see above)'}`);
    console.log(`  MyFFPC: ${myffpcCode === 0 ? '✅ synced' : '❌ failed (see above)'}`);
    console.log('─────────────────────────────────');

    process.exit(yahooCode === 0 && myffpcCode === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('leagues:refresh failed:', err);
    process.exit(1);
});
