export function cleanseName(name: string): string {
    if (typeof name !== 'string') return '';

    return name
        .toLowerCase()
        .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '') // Remove suffixes with optional period
        .replace(/[.'",]/g, '') // Remove periods, apostrophes, quotes, and commas
        .replace(/\s+/g, ' ') // Collapse multiple spaces to single space
        .trim();
}
