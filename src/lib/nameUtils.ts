const ALIASES: Record<string, string> = {
    'nick singleton': 'nicholas singleton',
    'hollywood brown': 'marquise brown',
    'scotty miller': 'scott miller',
    'gabe davis': 'gabriel davis',
    'robby anderson': 'robbie anderson',
    'kenny walker': 'kenneth walker',
    'kenny gainwell': 'kenneth gainwell',
    'andres borregales': 'andy borregales',
};

export function cleanseName(name: string): string {
    if (typeof name !== 'string') return '';

    let cleaned = name
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '') // Remove suffixes with optional period
        .replace(/[.'",]/g, '') // Remove periods, apostrophes, quotes, and commas
        .replace(/\s+/g, ' ') // Collapse multiple spaces to single space
        .trim();

    return ALIASES[cleaned] || cleaned;
}

// NFL team nickname → abbr, for resolving a team-defense name (in any of the
// many forms platforms use: "Seattle Seahawks", "Seahawks D/ST", "Seattle
// Seahawks DEF") to our canonical DEF_{ABBR} id. Kept here (not imported from
// transactions-parser) so nameUtils stays dependency-free and unit-testable.
const DEF_NICKNAME_TO_ABBR: Record<string, string> = {
    cardinals: 'ARI', falcons: 'ATL', ravens: 'BAL', bills: 'BUF', panthers: 'CAR',
    bears: 'CHI', bengals: 'CIN', browns: 'CLE', cowboys: 'DAL', broncos: 'DEN',
    lions: 'DET', packers: 'GB', texans: 'HOU', colts: 'IND', jaguars: 'JAX',
    chiefs: 'KC', raiders: 'LV', chargers: 'LAC', rams: 'LAR', dolphins: 'MIA',
    vikings: 'MIN', patriots: 'NE', saints: 'NO', giants: 'NYG', jets: 'NYJ',
    eagles: 'PHI', steelers: 'PIT', seahawks: 'SEA', '49ers': 'SF', buccaneers: 'TB',
    titans: 'TEN', commanders: 'WAS',
};

/**
 * Resolve a team-defense name to our canonical `DEF_{ABBR}` id, or null if the
 * name doesn't contain a recognizable NFL team nickname.
 *
 * Handles the many representations platforms use for a D/ST:
 *   "Seattle Seahawks", "Seattle Seahawks DEF", "Seahawks D/ST", "Seahawks".
 * Matching is by nickname substring on the cleansed name, so suffixes like DEF /
 * D/ST / defense don't matter.
 *
 * Pass an optional `validIds` set (the DEF ids that actually exist in the players
 * table) to guard against fabricating an id for a team we don't carry.
 */
export function resolveDefenseId(name: string, validIds?: Set<string>): string | null {
    if (typeof name !== 'string' || !name.trim()) return null;
    const lower = name.toLowerCase();
    for (const [nick, abbr] of Object.entries(DEF_NICKNAME_TO_ABBR)) {
        if (lower.includes(nick)) {
            const id = `DEF_${abbr}`;
            if (validIds && !validIds.has(id)) return null;
            return id;
        }
    }
    return null;
}
