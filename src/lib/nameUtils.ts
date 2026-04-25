const ALIASES: Record<string, string> = {
    'nick singleton': 'nicholas singleton',
    'hollywood brown': 'marquise brown',
    'scotty miller': 'scott miller',
    'gabe davis': 'gabriel davis',
    'robby anderson': 'robbie anderson',
    'kenny walker': 'kenneth walker',
    'kenny gainwell': 'kenneth gainwell',
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
