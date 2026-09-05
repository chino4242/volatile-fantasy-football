/**
 * Yahoo Fantasy — authenticated HTTP reader (personal / single-owner).
 *
 * Yahoo's Fantasy API no longer grants Fantasy Sports scope to new apps, so we
 * read the logged-in web pages directly. The roster/players pages are
 * server-rendered HTML, so a plain authenticated `fetch` + cheerio parse is
 * enough — no browser required. This means the sync CAN run on Vercel cron.
 *
 * Auth: a Yahoo session cookie string (harvested once from your logged-in
 * browser, or via scripts/yahoo-login.ts) is stored in the YAHOO_COOKIE env
 * var — the same "stored cookie" pattern the Fleaflicker integration uses.
 *
 * getYahooLeague(leagueId) returns the SAME normalized shape the downstream
 * sync/normalize/upsert pipeline already expects.
 */

import { load, type CheerioAPI } from 'cheerio';
import { cache, TTL } from './cache';

const HOST = 'https://football.fantasysports.yahoo.com';

// A browser-like UA reduces the chance Yahoo serves a bot wall.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────
// Normalized output types (unchanged — the pipeline depends on this shape)
// ─────────────────────────────────────────────────────────────────────────

export interface YahooPlayerLite {
    yahoo_id: string;
    full_name: string;
    position: string | null; // QB/RB/WR/TE/K/DEF
    team: string | null;     // NFL team abbr
    is_starter: boolean;
}

export interface YahooTeam {
    team_key: string;   // "{leagueId}.t.{teamNumber}"
    team_id: string;
    name: string;
    manager: string | null;
    players: YahooPlayerLite[];
}

export interface YahooLeague {
    league_key: string;
    league_id: string;
    name: string;
    num_teams: number;
    scoring_type: string | null;
    settings: {
        roster_positions: { position: string; count: number }[];
        num_qb_starters: number;
    };
    teams: YahooTeam[];
    freeAgents: YahooPlayerLite[];
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────────

function getCookie(): string {
    const cookie = process.env.YAHOO_COOKIE;
    if (!cookie) {
        throw new Error('YAHOO_COOKIE not set. Harvest your Yahoo login cookie (run "npm run yahoo:login", or copy the Cookie header from a logged-in request) and set YAHOO_COOKIE in the environment.');
    }
    return cookie;
}

// Thrown specifically when Yahoo serves a login wall (transient session hiccup
// or expired cookie). Distinct from other errors so callers can react.
class YahooLoginBounce extends Error {}

async function fetchHtmlOnce(url: string): Promise<string> {
    const res = await fetch(url, {
        headers: {
            'Cookie': getCookie(),
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        cache: 'no-store',
    });
    const html = await res.text();
    // Detect a genuine login bounce. Logged-in Yahoo pages still contain "sign in"
    // strings in nav/footer, so we can't key off those. A real login wall either
    // redirects to login.yahoo.com or has a login <title>. Otherwise, trust it.
    const finalUrl = res.url || url;
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();
    const bouncedToLogin = /login\.yahoo\.com/i.test(finalUrl) || /sign\s*in to yahoo|^sign in\b/i.test(title);
    if (bouncedToLogin) {
        throw new YahooLoginBounce(`Yahoo returned a login page for ${url}.`);
    }
    if (!res.ok) {
        throw new Error(`Yahoo GET ${url} failed (${res.status}).`);
    }
    return html;
}

async function fetchHtml(pathOrUrl: string): Promise<string> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${HOST}${pathOrUrl}`;
    // Yahoo intermittently bounces individual requests to login even with a valid
    // session. Retry a few times with backoff before giving up — a single bounce
    // must never silently drop a team.
    const maxAttempts = 4;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fetchHtmlOnce(url);
        } catch (err) {
            lastErr = err;
            if (err instanceof YahooLoginBounce && attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, 400 * attempt)); // 0.4s, 0.8s, 1.2s
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────
// Parsing (cheerio) — selectors derived from the real roster page source
// ─────────────────────────────────────────────────────────────────────────

function normalizePosition(pos: string | null | undefined): string | null {
    if (!pos) return null;
    const p = pos.toUpperCase();
    if (p === 'DEF' || p === 'DST' || p === 'D/ST') return 'DEF';
    if (p === 'K' || p === 'PK') return 'K';
    if (['QB', 'RB', 'WR', 'TE'].includes(p)) return p;
    return p;
}

/**
 * Parse all players out of a roster or players-list page.
 * Each player is an <a data-ys-playerid title="Name"> inside div.ysf-player-name.
 * Position via the row's span.pos-label[data-pos]; NFL team + real pos also in
 * the sibling span.Fz-xxs text ("Chi - QB"). Bench rows carry class "bench".
 */
function parsePlayers($: CheerioAPI): YahooPlayerLite[] {
    const out: YahooPlayerLite[] = [];
    $('div.ysf-player-name').each((_, el) => {
        const $node = $(el);
        const $anchor = $node.find('a[data-ys-playerid]').first();
        if ($anchor.length === 0) return;
        const yahoo_id = $anchor.attr('data-ys-playerid') || '';
        const full_name = ($anchor.attr('title') || $anchor.text() || '').trim();
        if (!yahoo_id || !full_name) return;

        // "Chi - QB" hint
        let team: string | null = null;
        let posText: string | null = null;
        const teamText = $node.find('span.Fz-xxs').first().text().trim();
        const m = teamText.match(/^([A-Za-z]{2,4})\s*-\s*([A-Za-z/]+)/);
        if (m) { team = m[1]; posText = m[2]; }

        // Row-level position badge + bench detection
        const $row = $node.closest('tr');
        const posLabel = $row.find('span.pos-label[data-pos]').attr('data-pos') || null;
        const isBench = /\bbench\b/.test($row.attr('class') || '');
        const rawPos = posLabel && posLabel !== 'BN' && posLabel !== 'W/R/T' && posLabel !== 'Q'
            ? posLabel
            : posText;

        out.push({
            yahoo_id,
            full_name,
            position: normalizePosition(rawPos),
            team,
            is_starter: !isBench,
        });
    });
    return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Fetchers
// ─────────────────────────────────────────────────────────────────────────

// Yahoo team page <title> looks like:
//   "{LeagueName} - {TeamName} | Fantasy Football | Yahoo! Sports"
// We want just "{TeamName}". Strategy: take the segment before the first "|",
// then strip a leading "{LeagueName} - " prefix. Fall back to the substring
// after the first " - " if the exact league name isn't known.
function parseTeamName($: CheerioAPI, leagueName?: string): string {
    // Prefer an explicit on-page team heading when Yahoo renders one.
    const headingSelectors = ['h1.team-name', '.Fz-25 .team-name', 'header h1', '.teamnav h1'];
    for (const sel of headingSelectors) {
        const h = $(sel).first().text().trim();
        if (h && !/fantasy football/i.test(h)) return h;
    }

    // Title-based extraction.
    let title = ($('title').first().text() || '').trim();
    // Drop everything from the first "|" onward (" | Fantasy Football | Yahoo! Sports").
    title = title.split('|')[0].trim();

    if (title) {
        // Strip the exact league-name prefix if we know it: "{League} - {Team}".
        if (leagueName) {
            const prefix = `${leagueName} - `;
            if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
                return title.slice(prefix.length).trim();
            }
        }
        // Fallback: the league name precedes the team name via " - ".
        const dashIdx = title.indexOf(' - ');
        if (dashIdx !== -1) return title.slice(dashIdx + 3).trim();
        return title;
    }
    return '';
}

async function fetchTeam(leagueId: string, teamNumber: number, leagueName?: string): Promise<YahooTeam | null> {
    // Note: fetchHtml throws YahooLoginBounce after exhausting retries. We let
    // that propagate — a team that can't be read due to an auth wall must NOT be
    // silently dropped (that previously caused a real team to go missing).
    const html = await fetchHtml(`/f1/${leagueId}/${teamNumber}`);
    const $ = load(html);
    const players = parsePlayers($);
    if (players.length === 0) return null; // out of range / genuinely empty
    const name = parseTeamName($, leagueName) || `Team ${teamNumber}`;
    return {
        team_key: `${leagueId}.t.${teamNumber}`,
        team_id: String(teamNumber),
        name,
        manager: null,
        players,
    };
}

async function fetchFreeAgents(leagueId: string, maxPlayers = 300): Promise<YahooPlayerLite[]> {
    const out: YahooPlayerLite[] = [];
    const seen = new Set<string>();
    let start = 0;
    const pageSize = 25;
    while (out.length < maxPlayers) {
        const html = await fetchHtml(`/f1/${leagueId}/players?status=A&sort=AR&count=${pageSize}&start=${start}`);
        const $ = load(html);
        const raw = parsePlayers($);
        if (raw.length === 0) break;
        let added = 0;
        for (const p of raw) {
            if (seen.has(p.yahoo_id)) continue;
            seen.add(p.yahoo_id);
            out.push({ ...p, is_starter: false });
            added++;
        }
        if (added === 0) break;
        start += pageSize;
    }
    return out;
}

async function fetchLeagueMeta(leagueId: string): Promise<{ name: string; numTeams: number; teamNumbers: number[]; rosterPositions: { position: string; count: number }[] }> {
    // Roster settings (for roster positions)
    const settingsHtml = await fetchHtml(`/f1/${leagueId}/settings`);
    const $s = load(settingsHtml);

    let rosterPositions: { position: string; count: number }[] = [];
    const bodyText = $s('body').text();
    const idx = bodyText.indexOf('Roster Positions');
    if (idx >= 0) {
        const after = bodyText.slice(idx + 'Roster Positions'.length, idx + 400);
        const firstLine = after.split('\n').map(s => s.trim()).find(s => s.length > 0) || '';
        const counts: Record<string, number> = {};
        for (const tok of firstLine.split(/,\s*/)) {
            const mm = tok.match(/^([A-Za-z/]+)\s*(?:x\s*(\d+))?$/i);
            if (!mm) continue;
            const pos = mm[1].toUpperCase();
            const n = mm[2] ? parseInt(mm[2]) : 1;
            counts[pos] = (counts[pos] || 0) + n;
        }
        rosterPositions = Object.entries(counts).map(([position, count]) => ({ position, count }));
    }

    // League name + team count from the league home page. The home page <title>
    // is the clean league name (e.g. "Insurance Survivors | Fantasy Football | Yahoo! Sports").
    const homeHtml = await fetchHtml(`/f1/${leagueId}`);
    const $h = load(homeHtml);
    const rawTitle = ($h('title').first().text() || '').trim();
    const name = rawTitle.split('|')[0].trim() || `Yahoo League ${leagueId}`;

    const teamNums = new Set<number>();
    $h('a[href*="/f1/"]').each((_, a) => {
        const href = $h(a).attr('href') || '';
        const mm = href.match(/\/f1\/\d+\/(\d+)(?:$|[/?])/);
        if (mm) teamNums.add(parseInt(mm[1]));
    });
    const teamNumbers = [...teamNums].sort((a, b) => a - b);

    return { name, numTeams: teamNumbers.length, teamNumbers, rosterPositions };
}

function countStartingQBSlots(rosterPositions: { position: string; count: number }[]): number {
    let qb = 0;
    for (const rp of rosterPositions) {
        if (rp.position === 'QB') qb += rp.count;
        if (rp.position === 'Q' || rp.position === 'SUPERFLEX' || rp.position === 'SF') qb += rp.count;
    }
    return qb;
}

/**
 * Fetch and normalize a full Yahoo league by reading the logged-in web pages.
 * leagueId is the numeric Yahoo league id (e.g. "832633").
 */
export async function getYahooLeague(leagueId: string): Promise<YahooLeague> {
    const cacheKey = `yahoo:league:${leagueId}`;
    const cached = cache.get<YahooLeague>(cacheKey, TTL.LEAGUE_DATA);
    if (cached) return cached;

    const meta = await fetchLeagueMeta(leagueId);
    // Iterate the ACTUAL team numbers discovered on the league home page. Team
    // ids are not guaranteed contiguous (a removed/renumbered team can leave a
    // gap like 1..8,10), so a plain 1..N range would both miss real teams and
    // probe non-existent ones. Fall back to 1..12 only if discovery found none.
    const teamNumbers = meta.teamNumbers.length > 0
        ? meta.teamNumbers
        : Array.from({ length: 12 }, (_, i) => i + 1);

    const teams: YahooTeam[] = [];
    for (const t of teamNumbers) {
        const team = await fetchTeam(leagueId, t, meta.name);
        if (team) teams.push(team);
    }

    // Guard: if the home page advertised N teams but we came back with fewer,
    // something dropped a team (parse/auth). Fail loudly instead of caching a
    // silently-incomplete league.
    if (meta.teamNumbers.length > 0 && teams.length < meta.teamNumbers.length) {
        const got = new Set(teams.map(t => Number(t.team_id)));
        const missing = meta.teamNumbers.filter(n => !got.has(n));
        throw new Error(`Yahoo league ${leagueId}: expected ${meta.teamNumbers.length} teams but only read ${teams.length} (missing team #${missing.join(', ')}). Aborting to avoid a partial sync.`);
    }

    const freeAgents = await fetchFreeAgents(leagueId);

    const league: YahooLeague = {
        league_key: leagueId,
        league_id: leagueId,
        name: meta.name,
        num_teams: teams.length,
        scoring_type: null,
        settings: {
            roster_positions: meta.rosterPositions,
            num_qb_starters: countStartingQBSlots(meta.rosterPositions),
        },
        teams,
        freeAgents,
    };

    cache.set(cacheKey, league);
    return league;
}
