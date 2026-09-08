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

export type TransactionAction = 'add' | 'buy' | 'sell';

export interface ParsedTransaction {
    action: TransactionAction;
    playerName: string;   // cleaned display name (DST normalized to "<TEAM> DST" when detectable)
    rawHeader: string;    // original header text after the action word
    note: string;         // the rationale paragraph(s)
    isDefense: boolean;
}

// NFL team name → abbr, for turning "the Dallas Cowboys Defense" into a DST.
const TEAM_NAME_TO_ABBR: Record<string, string> = {
    cardinals: 'ARI', falcons: 'ATL', ravens: 'BAL', bills: 'BUF', panthers: 'CAR',
    bears: 'CHI', bengals: 'CIN', browns: 'CLE', cowboys: 'DAL', broncos: 'DEN',
    lions: 'DET', packers: 'GB', texans: 'HOU', colts: 'IND', jaguars: 'JAX',
    chiefs: 'KC', raiders: 'LV', chargers: 'LAC', rams: 'LAR', dolphins: 'MIA',
    vikings: 'MIN', patriots: 'NE', saints: 'NO', giants: 'NYG', jets: 'NYJ',
    eagles: 'PHI', steelers: 'PIT', seahawks: 'SEA', '49ers': 'SF', buccaneers: 'TB',
    titans: 'TEN', commanders: 'WAS',
};

const HEADER_RE = /^(Add|Buy|Sell)\s+(.+?)\s*$/i;

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
    return { name: t, isDefense: false };
}

/**
 * Parse the full transactions feed text into typed items.
 */
export function parseTransactionsFeed(text: string): ParsedTransaction[] {
    const lines = text.split(/\r?\n/);
    const items: ParsedTransaction[] = [];
    let current: ParsedTransaction | null = null;
    const noteBuffer: string[] = [];

    const flush = () => {
        if (current) {
            current.note = noteBuffer.join('\n').trim();
            items.push(current);
        }
        noteBuffer.length = 0;
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const m = trimmed.match(HEADER_RE);
        // A header line is short (an action + a name), not a long sentence.
        const looksLikeHeader = m && trimmed.length <= 60 && !/[.!?]$/.test(trimmed);
        if (looksLikeHeader) {
            flush();
            const action = m![1].toLowerCase() as TransactionAction;
            const { name, isDefense } = normalizeName(m![2]);
            current = { action, playerName: name, rawHeader: m![2].trim(), note: '', isDefense };
        } else if (current && trimmed) {
            noteBuffer.push(trimmed);
        }
    }
    flush();
    return items;
}
