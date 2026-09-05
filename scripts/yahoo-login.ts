/**
 * Yahoo cookie harvester (one-time, refresh when the cookie expires).
 *
 * We read Yahoo's server-rendered fantasy pages with a plain authenticated
 * fetch (see src/lib/yahoo.ts) — no browser needed at scrape time, so the sync
 * runs on Vercel cron. All we need is your logged-in Yahoo Cookie header, which
 * this script harvests: it opens a real browser, you log in once, and it prints
 * the Cookie string to paste into YAHOO_COOKIE.
 *
 * (You can also skip this script entirely: in your logged-in browser, open
 * DevTools → Network → click the roster document request → copy the "Cookie"
 * request header value. Same result.)
 *
 * Usage:
 *   1. npx playwright install chromium   (one time — only needed for this harvester)
 *   2. npm run yahoo:login
 *   3. Log into Yahoo Fantasy in the window that opens, reach your league, then
 *      press Enter in the terminal.
 *   4. Copy the printed cookie into .env.local as:
 *        YAHOO_COOKIE="...the whole string..."
 *        YAHOO_LEAGUE_IDS=832633,998877
 *
 * Refresh the cookie whenever the sync starts reporting a login-page error.
 */

import { chromium } from 'playwright';
import * as readline from 'node:readline';

const START_URL = 'https://football.fantasysports.yahoo.com/';

function waitForEnter(msg: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(msg, () => { rl.close(); resolve(); }));
}

async function main() {
    console.log('\nOpening a browser. Log into Yahoo Fantasy and open one of your leagues.');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

    await waitForEnter('\n➡  Once logged in and viewing your league, press Enter to capture the cookie... ');

    const cookies = await context.cookies('https://football.fantasysports.yahoo.com');
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await browser.close();

    if (!cookieHeader) {
        console.error('\n❌ No cookies captured — are you sure you logged in?');
        process.exit(1);
    }

    console.log('\n✅ Add this to your .env.local (keep the quotes):\n');
    console.log('────────────────────────────────────────────────────────');
    console.log(`YAHOO_COOKIE="${cookieHeader}"`);
    console.log('────────────────────────────────────────────────────────\n');
    console.log('Also set your league ids, e.g.:  YAHOO_LEAGUE_IDS=832633,998877\n');
    console.log('The cookie is a credential — never commit it. Re-run this when it expires.\n');
}

main().catch(err => {
    console.error('yahoo-login failed:', err);
    process.exit(1);
});
