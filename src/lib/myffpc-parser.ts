/**
 * MyFFPC Roster Parser
 *
 * Parses pasted roster text from the MyFFPC website and extracts
 * team name, owner, and player list with positions.
 *
 * Format expected (per team paste):
 *   "Baluga Knights Team Notes"
 *   "Owner: joeshartzer  Record: 0-0-0"
 *   ...
 *   "Jackson, Lamar BAL    QB  @IND ..."
 *   "Hall, Breece NYJ Q   Submit RB  @TEN ..."
 *
 * Also handles: DST entries like "SEA DST   DST NE" and kickers.
 */

import { cleanseName } from './nameUtils';

export interface ParsedPlayer {
    /** Original "Last, First" name from the paste */
    rawName: string;
    /** Normalized "First Last" for DB matching */
    normalizedName: string;
    /** Position: QB, RB, WR, TE, PK, DST */
    position: string;
    /** NFL team abbreviation */
    team: string | null;
    /** Whether this player was in the starters section */
    isStarter: boolean;
}

export interface ParsedRoster {
    teamName: string;
    owner: string;
    players: ParsedPlayer[];
    draftPicks: string[]; // e.g., ["2027 R1", "2027 R2", ...]
}

// NFL team abbreviations (3-letter codes used by MyFFPC)
const NFL_TEAMS = new Set([
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
    'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAC', 'JAX', 'KC',
    'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ',
    'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS', 'FA',
]);

// Positions we care about
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'PK', 'DST', 'K', 'D', 'DEF']);

// Injury/status designations that appear after the team abbreviation
const STATUS_TAGS = new Set(['Q', 'O', 'D', 'IR', 'PUP', 'SUS', 'Submit']);

/**
 * Parse a single team's pasted roster text.
 */
export function parseMyFFPCRoster(text: string): ParsedRoster {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let teamName = '';
    let owner = '';
    const players: ParsedPlayer[] = [];
    const draftPicks: string[] = [];
    let section: 'starters' | 'bench' | 'ir' | 'picks' | 'unknown' = 'unknown';

    for (const line of lines) {
        // Team name: "XXX Team Notes"
        if (line.includes('Team Notes') && !teamName) {
            teamName = line.replace(/\s*Team Notes.*/, '').trim();
            continue;
        }

        // Owner: "Owner: username  Record: X-X-X"
        if (line.startsWith('Owner:') && !owner) {
            const match = line.match(/^Owner:\s*(\S+)/);
            if (match) owner = match[1];
            continue;
        }

        // Section headers
        if (line === 'Starters' || line.startsWith('Starters')) { section = 'starters'; continue; }
        if (line === 'Bench' || line.startsWith('Bench')) { section = 'bench'; continue; }
        if (line.startsWith('Injured Reserve')) { section = 'ir'; continue; }
        if (line.startsWith('Draft Picks')) { section = 'picks'; continue; }

        // Skip header rows
        if (line.startsWith('SLOT') || line.startsWith('This Week') || line.startsWith('Future')) continue;

        // Draft picks: "2027 Draft Picks: R1, R2, R3, R4, R6, R7"
        if (section === 'picks' || line.match(/^\d{4}\s+Draft Picks:/)) {
            const pickMatch = line.match(/^(\d{4})\s+Draft Picks?:\s*(.+)/);
            if (pickMatch) {
                const year = pickMatch[1];
                const rounds = pickMatch[2].split(',').map(r => r.trim());
                for (const r of rounds) {
                    draftPicks.push(`${year} ${r}`);
                }
            }
            continue;
        }

        // Skip non-player content
        if (section === 'unknown') continue;

        // Try to parse a player line
        const player = parsePlayerLine(line, section === 'starters');
        if (player) {
            players.push(player);
        }
    }

    return { teamName, owner, players, draftPicks };
}

/**
 * Parse a single player line.
 *
 * Expected patterns:
 *   "QB  Jackson, Lamar BAL    QB  @IND\nSUN 1:00ET  13  0 21  94.9 ..."
 *   "RB  Hall, Breece NYJ Q   Submit RB  @TEN ..."
 *   "DST SEA DST   DST NE ..."
 *   "PK  Little, Cam JAC   PK  CLE ..."
 *
 * The slot position comes first (QB/RB/WR/TE/FLEX/PK/DST), then the player info.
 */
function parsePlayerLine(line: string, isStarter: boolean): ParsedPlayer | null {
    // Handle DST entries: "DST SEA DST   DST NE" or just "SEA DST"
    const dstMatch = line.match(/^(?:DST\s+)?([A-Z]{2,4})\s+DST/);
    if (dstMatch) {
        const team = dstMatch[1];
        return {
            rawName: `${team} DST`,
            normalizedName: cleanseName(`${team} DST`),
            position: 'DST',
            team,
            isStarter,
        };
    }

    // Standard player: strip leading slot designator, then parse "Last, First TEAM [status] POS"
    // Remove leading slot: QB/RB/WR/TE/FLEX/PK/DST + whitespace
    const stripped = line.replace(/^(?:QB|RB|WR|TE|FLEX|PK|DST|K|D)\s+/, '');

    // Match: "Last, First TEAM [status tokens] POS [remaining garbage]"
    // The key insight: after "Last, First", the next uppercase 2-4 letter token is the team,
    // then optional status tags (Q/O/D/IR/Submit), then the position.
    const commaIdx = stripped.indexOf(',');
    if (commaIdx === -1) return null;

    const lastName = stripped.slice(0, commaIdx).trim();
    const afterComma = stripped.slice(commaIdx + 1).trim();

    // Split the rest into tokens
    const tokens = afterComma.split(/\s+/);
    if (tokens.length < 2) return null;

    // First token after comma is the first name (may be multi-word for compound names)
    // We need to find the team abbreviation — first token that matches NFL_TEAMS
    let firstName = '';
    let team: string | null = null;
    let position: string | null = null;
    let teamIdx = -1;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (NFL_TEAMS.has(t) && !team) {
            team = t;
            teamIdx = i;
            break;
        }
    }

    if (team && teamIdx > 0) {
        firstName = tokens.slice(0, teamIdx).join(' ');
    } else if (tokens.length >= 1) {
        // Fallback: first token is first name
        firstName = tokens[0];
        teamIdx = 0;
    }

    if (!firstName) return null;

    // Find position: look for POS token after team (skipping status tags)
    for (let i = (teamIdx >= 0 ? teamIdx + 1 : 1); i < tokens.length; i++) {
        const t = tokens[i];
        if (STATUS_TAGS.has(t)) continue;
        if (POSITIONS.has(t)) {
            position = t;
            break;
        }
        // Stop scanning at non-relevant tokens (opponent, schedule info)
        if (t.startsWith('@') || t.startsWith('SUN') || t.startsWith('MON') || t.startsWith('THU') || t.startsWith('WED') || t.startsWith('SAT') || t.startsWith('TUE') || t.startsWith('FRI')) break;
    }

    // Normalize position aliases
    if (position === 'K') position = 'PK';
    if (position === 'D' || position === 'DEF') position = 'DST';
    if (!position) return null;

    const fullName = `${firstName} ${lastName}`;
    return {
        rawName: `${lastName}, ${firstName}`,
        normalizedName: cleanseName(fullName),
        position,
        team: team === 'FA' ? null : team,
        isStarter,
    };
}

/**
 * Parse a multi-team paste. Teams can be separated by a delimiter line
 * or detected by "Team Notes" headers.
 */
export function parseMultiTeamPaste(text: string): ParsedRoster[] {
    // Split on "Team Notes" — each occurrence starts a new team
    const sections = text.split(/(?=^.+Team Notes)/m);
    const rosters: ParsedRoster[] = [];

    for (const section of sections) {
        if (!section.trim()) continue;
        const roster = parseMyFFPCRoster(section);
        if (roster.teamName && roster.players.length > 0) {
            rosters.push(roster);
        }
    }

    return rosters;
}



// ─────────────────────────────────────────────────────────────────────────
// HTML parser (cookie-based scrape via the persistent browser)
//
// The MyFFPC LeagueHome/SetLineup pages are server-rendered ASP.NET WebForms.
// Each player row is an anchor:
//   <a href='PlayerProfile.aspx?playerID=27204&leagueID=45219&dbID=FF_D1'>
//        Jackson, Lamar BAL </a>
// The slot/position comes from the row's first cell class `role-XX`
// (role-QB/RB/WR/TE/PK/DF). Defenses render as playerID=D{TEAM}H with text
// "SEA  DST". Starters live in the `rptStartingLineup` table, bench in
// `rptBench`, IR in `rptInjuredReserves`.
//
// This reuses ParsedPlayer/ParsedRoster so the sync path is identical to paste.
// ─────────────────────────────────────────────────────────────────────────

import type { CheerioAPI } from 'cheerio';

/** Map a MyFFPC `role-XX` slot class or POS cell text to our position tokens. */
function normalizeMyffpcPosition(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const p = raw.toUpperCase().replace(/^ROLE-/, '').trim();
    if (p === 'DF' || p === 'DST' || p === 'D' || p === 'DEF') return 'DST';
    if (p === 'PK' || p === 'K') return 'PK';
    if (['QB', 'RB', 'WR', 'TE'].includes(p)) return p;
    // FLEX is a slot, not a real position — caller resolves from the POS column.
    return p;
}

/**
 * Parse one player anchor's text: "Last, First TEAM" or "TEAM  DST".
 * Returns normalized "First Last" name + team, or null if unparseable.
 */
function parsePlayerAnchor(text: string): { rawName: string; normalizedName: string; team: string | null; isDst: boolean } | null {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return null;

    // Defense: "SEA  DST" / "SEA DST"
    const dst = t.match(/^([A-Z]{2,4})\s+DST$/);
    if (dst) {
        const team = dst[1];
        return { rawName: `${team} DST`, normalizedName: cleanseName(`${team} DST`), team, isDst: true };
    }

    // Player: "Last, First TEAM"  (TEAM = trailing 2-4 uppercase letters)
    const m = t.match(/^(.+?),\s*(.+?)\s+([A-Z]{2,4})$/);
    if (m) {
        const lastName = m[1].trim();
        const firstName = m[2].trim();
        const team = m[3];
        const full = `${firstName} ${lastName}`;
        return { rawName: `${lastName}, ${firstName}`, normalizedName: cleanseName(full), team, isDst: false };
    }

    // Fallback: "Last, First" with no team (rare).
    const m2 = t.match(/^(.+?),\s*(.+)$/);
    if (m2) {
        const full = `${m2[2].trim()} ${m2[1].trim()}`;
        return { rawName: t, normalizedName: cleanseName(full), team: null, isDst: false };
    }
    return null;
}

/**
 * Parse a single rendered team roster page (logged-in SetLineup.aspx HTML for
 * one viewingTeam). teamName should come from the league nav link text.
 */
export function parseMyFFPCRosterHtml($: CheerioAPI, teamName: string): ParsedRoster {
    const players: ParsedPlayer[] = [];
    const seen = new Set<string>();

    // Each player is an <a href*="PlayerProfile.aspx"> inside a <tr>. Starter vs
    // bench vs IR is encoded in the ids of cells WITHIN the row (WebForms puts
    // the repeater id on descendant cells like "..._rptBench_tdPlayerRole_0",
    // NOT on an ancestor <table>), so we classify by scanning the row's id
    // attributes rather than relying on an ancestor wrapper.
    $('a[href*="PlayerProfile.aspx"]').each((_, a) => {
        const $anchor = $(a);
        const parsed = parsePlayerAnchor($anchor.text());
        if (!parsed) return;

        const $row = $anchor.closest('tr');
        if ($row.length === 0) return;

        const idBlob = [
            $row.attr('id') || '',
            ...$row.find('[id]').map((_, el) => $(el).attr('id') || '').get(),
        ].join(' ');

        let isStarter: boolean;
        if (/rptStartingLineup/i.test(idBlob)) isStarter = true;
        else if (/rptBench|rptInjuredReserves/i.test(idBlob)) isStarter = false;
        else return; // not a roster row (e.g. stray PlayerProfile link) — skip

        // Dedupe (same player can recur in swap <option>s etc.).
        const key = `${parsed.normalizedName}|${isStarter}`;
        if (seen.has(key)) return;
        seen.add(key);

        // Slot/position from the row's role-XX cell; FLEX/DF resolved via POS col.
        const roleClass = $row.find('td[class*="role-"]').first().attr('class') || '';
        const roleMatch = roleClass.match(/role-([A-Za-z]+)/);
        let position = normalizeMyffpcPosition(roleMatch?.[1]);
        if (!position || position === 'FLEX') {
            const posCell = $row.find('td').filter((_, td) => /^(QB|RB|WR|TE|PK|DST)$/.test($(td).text().trim())).first().text().trim();
            position = normalizeMyffpcPosition(posCell) || position;
        }
        if (parsed.isDst) position = 'DST';
        if (!position || position === 'FLEX') return;

        players.push({
            rawName: parsed.rawName,
            normalizedName: parsed.normalizedName,
            position,
            team: parsed.team,
            isStarter,
        });
    });

    // Draft picks: "<b>2027 Draft Picks: </b>R1, R2, ..."
    const draftPicks: string[] = [];
    $('[id*="DynastyDraftPickSummary"], [id*="divDynastyDraftPickSummary"]').find('*').addBack().each((_, el) => {
        const txt = $(el).text();
        const m = txt.match(/(\d{4})\s+Draft Picks?:\s*([R\d,\s]+)/i);
        if (m) {
            const year = m[1];
            for (const r of m[2].split(',').map(s => s.trim()).filter(Boolean)) {
                const tag = `${year} ${r}`;
                if (!draftPicks.includes(tag)) draftPicks.push(tag);
            }
        }
    });

    return { teamName, owner: teamName, players, draftPicks };
}
