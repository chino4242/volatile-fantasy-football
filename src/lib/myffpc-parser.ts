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
