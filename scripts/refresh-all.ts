/**
 * Refresh ALL DB-backed leagues (Yahoo + MyFFPC) in one command:
 *
 *     npm run leagues:refresh
 *
 * Both platforms read from the SAME persistent, gitignored browser profile
 * (scripts/.yahoo-profile/). This script opens that browser ONCE so you can
 * confirm you're logged into both Yahoo and MyFFPC, then:
 *   1. Captures the Yahoo cookie and writes YAHOO_COOKIE into .env.local.
 *   2. Closes the browser (a persistent profile can't be open twice).
 *   3. Runs the Yahoo sync, then the MyFFPC sync — sequentially, since both
 *      reopen the same profile headless and can't run at once.
 *
 * One prompt, one browser window, both leagues synced. Runs the syncs in order
 * and reports each; a failure in one does not stop the other.
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

async function main() {
    console.log('\nOpening a browser with your saved profile.');
    console.log('Make sure you are logged into BOTH Yahoo Fantasy and MyFFPC.');
    console.log('(The window opens on Yahoo; if you need to log into MyFFPC too,');
    console.log(' open myffpc.com in another tab and sign in.) Then press Enter.\n');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(YAHOO_START, { waitUntil: 'domcontentloaded' });

    await waitForEnter('➡  Once logged into both, press Enter to capture the cookie and sync... ');

    // Capture + persist the Yahoo cookie (MyFFPC needs no cookie env — its sync
    // drives the logged-in profile directly).
    const cookies = await context.cookies(YAHOO_DOMAIN);
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await context.close();

    if (!cookieHeader || !/\bT=|\bA1=|\bA3=/.test(cookieHeader)) {
        console.error('\n⚠️  No valid Yahoo session cookie captured (T=/A1=/A3= missing).');
        console.error('   Yahoo sync will likely fail. Continuing to MyFFPC anyway...');
    } else {
        const { created, replaced } = setEnvVar(ENV_PATH, 'YAHOO_COOKIE', cookieHeader);
        console.log(created ? `\n✅ Created ${ENV_PATH} with YAHOO_COOKIE.`
            : replaced ? `\n✅ Updated YAHOO_COOKIE in ${ENV_PATH} (other lines preserved).`
            : `\n✅ Added YAHOO_COOKIE to ${ENV_PATH}.`);
    }

    // Run both syncs sequentially (shared profile can't be opened twice at once).
    const yahooCode = await runScript('yahoo:sync', 'Yahoo sync');
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
