/**
 * Transactions-feed parser — the "N Transactions" analyst feed.
 *
 * Input is prose: each item begins with an action header line
 *   "Add <Player>", "Buy <Player>", "Sell <Player>"
 * followed by one or more paragraphs of rationale, until the next header.
 *
 * Produces typed { action, playerName, note } items. Player→sleeper_id matching
 * happens in the route (mirrors the MyFFPC/rankings pattern). Defenses ("the
 * Dallas Cowboys Defense") are captured with a normalized DST name so the route
 * can resolve them to DEF_{ABBR}.
 */

export type TransactionAction = 'add' | 'buy' | 'sell' | 'hold';

export interface ParsedTransaction {
    action: TransactionAction;
    playerName: string;   // cleaned display name (DST normalized to "<TEAM> DST" when detectable)
    rawHeader: string;    // original header text after the action word
    note: string;         // the rationale paragraph(s)
    isDefense: boolean;
}

// NFL team name → abbr, for turning "the Dallas Cowboys Defense" into a DST.
// Exported so the weekly-DST upload can resolve full team names → DEF_{ABBR}.
export const TEAM_NAME_TO_ABBR: Record<string, string> = {
    cardinals: 'ARI', falcons: 'ATL', ravens: 'BAL', bills: 'BUF', panthers: 'CAR',
    bears: 'CHI', bengals: 'CIN', browns: 'CLE', cowboys: 'DAL', broncos: 'DEN',
    lions: 'DET', packers: 'GB', texans: 'HOU', colts: 'IND', jaguars: 'JAX',
    chiefs: 'KC', raiders: 'LV', chargers: 'LAC', rams: 'LAR', dolphins: 'MIA',
    vikings: 'MIN', patriots: 'NE', saints: 'NO', giants: 'NYG', jets: 'NYJ',
    eagles: 'PHI', steelers: 'PIT', seahawks: 'SEA', '49ers': 'SF', buccaneers: 'TB',
    titans: 'TEN', commanders: 'WAS',
};

const HEADER_RE = /^(Add|Buy|Sell|Hold)\s+(.+?)\s*$/i;

/**
 * Strip common leading noise from a line before header-matching:
 *   - a lead-in phrase ending in a colon: "Bonus Transaction:", "Week 2:"
 *   - list markers: "1.", "1)", "-", "•", "*"
 * so "Bonus Transaction: Add Pat Bryant" and "1. Buy X" still parse.
 */
function stripLeadIn(line: string): string {
    let s = line.trim();
    // Remove a leading "<something>:" lead-in ONLY when what follows starts with
    // an action word (so we don't eat real content).
    if (/^[^:]{1,40}:\s*(Add|Buy|Sell|Hold)\b/i.test(s)) s = s.slice(s.indexOf(':') + 1).trim();
    // Remove a leading list marker.
    s = s.replace(/^(\d+[.)]|[-•*])\s+/, '');
    return s;
}

/**
 * A header is a short "<action> <name>" line — not a prose sentence. Accept it
 * when the name portion is short (≤ ~8 words) and has no sentence punctuation
 * mid-string. A single trailing period (e.g. "Jr.") is fine.
 */
function looksLikeHeader(namePart: string): boolean {
    const words = namePart.trim().split(/\s+/);
    if (words.length > 8) return false;          // too long → prose
    const body = namePart.replace(/\.$/, '');     // allow a trailing "Jr."
    if (/[.!?]/.test(body)) return false;         // internal sentence punctuation → prose
    return true;
}

/** Split a header name like "Deebo Samuel and Demarcus Robinson" into individual
 *  players. Splits on standalone " and "/" & "/", ". Defenses are never split;
 *  only splits when every part looks like a real 2-4 word name. */
function splitPlayers(name: string, isDefense: boolean): string[] {
    if (isDefense) return [name];
    const parts = name.split(/\s+and\s+|\s+&\s+|,\s+/i).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(p => {
        const w = p.split(/\s+/).length; return w >= 2 && w <= 4;
    })) return parts;
    return [name];
}

function normalizeName(headerText: string): { name: string; isDefense: boolean } {
    const t = headerText.trim();
    // Defense: "the Dallas Cowboys Defense" / "Dallas Cowboys D/ST" / "Cowboys Defense"
    if (/\b(defense|d\/?st|dst)\b/i.test(t)) {
        const lower = t.toLowerCase();
        for (const [teamWord, abbr] of Object.entries(TEAM_NAME_TO_ABBR)) {
            if (lower.includes(teamWord)) return { name: `${abbr} DST`, isDefense: true };
        }
        return { name: t, isDefense: true };
    }
    return { name: t.replace(/^the\s+/i, ''), isDefense: false };
}

/**
 * Parse the full transactions feed text into typed items. One header may yield
 * MULTIPLE items when it names several players ("Add Deebo Samuel and Demarcus
 * Robinson" → two adds sharing the rationale).
 */
export function parseTransactionsFeed(text: string): ParsedTransaction[] {
    const lines = text.split(/\r?\n/);
    let pending: { action: TransactionAction; rawName: string } | null = null;
    const noteBuffer: string[] = [];
    const groups: { action: TransactionAction; rawName: string; note: string }[] = [];

    const flush = () => {
        if (pending) groups.push({ ...pending, note: noteBuffer.join('\n').trim() });
        noteBuffer.length = 0;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const candidate = stripLeadIn(trimmed);
        const m = candidate.match(HEADER_RE);
        if (m && looksLikeHeader(m[2])) {
            flush();
            pending = { action: m[1].toLowerCase() as TransactionAction, rawName: m[2].trim() };
        } else if (pending) {
            noteBuffer.push(trimmed);
        }
    }
    flush();

    const items: ParsedTransaction[] = [];
    for (const g of groups) {
        const { name, isDefense } = normalizeName(g.rawName);
        for (const playerName of splitPlayers(name, isDefense)) {
            items.push({ action: g.action, playerName, rawHeader: g.rawName, note: g.note, isDefense });
        }
    }
    return items;
}
