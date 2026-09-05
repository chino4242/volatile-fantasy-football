/**
 * MyFFPC one-command refresh: ensure logged-in session → run the sync.
 *
 *     npm run myffpc:refresh
 *
 * MyFFPC is an ASP.NET WebForms app with no per-team URL (team selection is a
 * postback), so unlike Yahoo we can't fetch teams with a plain cookie. We reuse
 * the SAME persistent, gitignored browser profile (scripts/.yahoo-profile/) —
 * so if you've logged into MyFFPC before, the browser opens already logged in
 * and you just press Enter.
 *
 * Flow:
 *   1. Open the persistent profile (headful) at the league page. If already
 *      logged in, just press Enter. If not, log into MyFFPC, then press Enter.
 *   2. Close the headful browser (a persistent profile can't be open twice).
 *   3. Run `npm run myffpc:sync` — it re-opens the SAME profile headless, drives
 *      the team dropdown, and upserts every team into the shared tables.
 *
 * One-time prerequisite:  npx playwright install chromium
 * Config (.env.local):    MYFFPC_LEAGUES=<ltuid>:<league_id>
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import { spawn } from 'node:child_process';
import * as path from 'node:path';

const PROFILE_DIR = path.resolve(process.cwd(), 'scripts/.yahoo-profile');
const HOST = 'https://myffpc.com';

function firstLtuid(): string | null {
    const raw = process.env.MYFFPC_LEAGUES || '';
    const first = raw.split(',').map(s => s.trim()).filter(Boolean)[0];
    return first ? first.split(':')[0]?.trim() || null : null;
}

function waitForEnter(msg: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(msg, () => { rl.close(); resolve(); }));
}

function runSync(): Promise<number> {
    return new Promise(resolve => {
        console.log('\n🔄 Running MyFFPC sync (headless, same profile)...\n');
        const child = spawn('npm', ['run', 'myffpc:sync'], { stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('close', code => resolve(code ?? 1));
    });
}

async function main() {
    const ltuid = firstLtuid();
    if (!ltuid) {
        console.error('❌ MYFFPC_LEAGUES not set in .env.local.');
        console.error('   Add e.g.  MYFFPC_LEAGUES=693-B3820364A9C9:myffpc_1787777544107');
        process.exit(1);
    }

    console.log('\nOpening MyFFPC with your saved browser profile.');
    console.log('If it opens already logged in, just press Enter.');
    console.log('If not, log into MyFFPC, reach your league, then press Enter.\n');

    const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`${HOST}/LeagueHome.aspx?ltuid=${ltuid}`, { waitUntil: 'domcontentloaded' });

    await waitForEnter('➡  Once logged in and viewing your league, press Enter to sync... ');

    // Must fully close the persistent context before the headless sync reopens it.
    await context.close();

    const code = await runSync();
    if (code === 0) console.log('\n🎉 MyFFPC refresh complete — leagues synced.');
    else console.error('\n⚠️  Sync reported an error above. If it was a login redirect, run the refresh again and make sure you\'re logged in before pressing Enter.');
    process.exit(code);
}

main().catch(err => { console.error('myffpc-refresh failed:', err); process.exit(1); });
