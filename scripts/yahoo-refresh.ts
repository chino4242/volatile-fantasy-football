/**
 * Yahoo one-command refresh: harvest cookie → write .env.local → run the sync.
 *
 * This collapses the whole "update Yahoo" chore into a single command:
 *
 *     npm run yahoo:refresh
 *
 * What it does:
 *   1. Opens a browser using a PERSISTENT, gitignored profile
 *      (scripts/.yahoo-profile/). Because the profile persists, Yahoo usually
 *      remembers you — after the first login, the browser opens already logged
 *      in and you just press Enter. No repeated logins.
 *   2. Captures the full logged-in cookie set for football.fantasysports.yahoo.com
 *      (includes the long-lived A1/A3/T/Y identity cookies).
 *   3. Writes YAHOO_COOKIE into .env.local IN PLACE (every other line preserved).
 *   4. Runs `npm run yahoo:sync` in a fresh child process so it reads the new
 *      cookie — no copy-paste, no second command.
 *
 * The persistent profile and the cookie are credentials — both are gitignored.
 *
 * One-time prerequisite:  npx playwright install chromium
 */

import { chromium } from 'playwright';
import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { setEnvVar } from './lib/env-file';

const START_URL = 'https://football.fantasysports.yahoo.com/';
const PROFILE_DIR = path.resolve(process.cwd(), 'scripts/.yahoo-profile');
const ENV_PATH = path.resolve(process.cwd(), '.env.local');
const DOMAIN = 'https://football.fantasysports.yahoo.com';

function waitForEnter(msg: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(msg, () => { rl.close(); resolve(); }));
}

function runSync(): Promise<number> {
    return new Promise(resolve => {
        console.log('\n🔄 Running Yahoo sync with the fresh cookie...\n');
        const child = spawn('npm', ['run', 'yahoo:sync'], { stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('close', code => resolve(code ?? 1));
    });
}

async function main() {
    console.log('\nOpening a browser with your saved Yahoo profile.');
    console.log('If it opens already logged in, just reach your league and press Enter.');
    console.log('If not, log into Yahoo Fantasy, open one of your leagues, then press Enter.\n');

    // launchPersistentContext keeps cookies/localStorage between runs (Option B):
    // after the first successful login, subsequent refreshes skip the login screen.
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });

    await waitForEnter('➡  Once logged in and viewing your league, press Enter to capture the cookie... ');

    const cookies = await context.cookies(DOMAIN);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await context.close();

    if (!cookieHeader || !/\bT=|\bA1=|\bA3=/.test(cookieHeader)) {
        console.error('\n❌ No valid Yahoo session cookie captured — are you sure you were logged in?');
        console.error('   (Expected identity cookies like T=/A1=/A3= were not present.)');
        process.exit(1);
    }

    const { created, replaced } = setEnvVar(ENV_PATH, 'YAHOO_COOKIE', cookieHeader);
    if (created) console.log(`\n✅ Created ${ENV_PATH} with YAHOO_COOKIE.`);
    else if (replaced) console.log(`\n✅ Updated YAHOO_COOKIE in ${ENV_PATH} (other lines preserved).`);
    else console.log(`\n✅ Added YAHOO_COOKIE to ${ENV_PATH}.`);

    // Friendly reminder if league ids aren't configured yet.
    // (The sync will also error clearly if they're missing.)
    const code = await runSync();
    if (code === 0) {
        console.log('\n🎉 Yahoo refresh complete — cookie updated and leagues synced.');
    } else {
        console.error('\n⚠️  Cookie was saved, but the sync reported an error above.');
        console.error('   If it was a login bounce, try the refresh again (the session may still be settling).');
        console.error('   Make sure YAHOO_LEAGUE_IDS is set in .env.local (e.g. YAHOO_LEAGUE_IDS=832633,853810).');
    }
    process.exit(code);
}

main().catch(err => {
    console.error('yahoo-refresh failed:', err);
    process.exit(1);
});
