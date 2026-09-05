/**
 * Minimal .env.local writer — updates a single key in place while preserving
 * every other line, comment, and blank line. Used by the Yahoo cookie refresh
 * flow so re-harvesting never clobbers the rest of your env file.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Set (or insert) KEY="value" in the env file at `path`.
 * - Existing KEY line is replaced in place (keeps its position).
 * - If absent, the KEY is appended at the end.
 * - The value is always double-quoted; embedded double-quotes are escaped.
 * - Everything else in the file is preserved byte-for-byte.
 */
export function setEnvVar(path: string, key: string, value: string): { created: boolean; replaced: boolean } {
    const quoted = `${key}="${value.replace(/"/g, '\\"')}"`;

    if (!existsSync(path)) {
        writeFileSync(path, `${quoted}\n`, 'utf8');
        return { created: true, replaced: false };
    }

    const original = readFileSync(path, 'utf8');
    const lines = original.split('\n');

    // Match `KEY=...` or `KEY =...` (tolerate stray whitespace around the key),
    // but not commented lines.
    const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
    let replaced = false;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trimStart().startsWith('#') && keyPattern.test(lines[i])) {
            lines[i] = quoted;
            replaced = true;
            break;
        }
    }

    let next: string;
    if (replaced) {
        next = lines.join('\n');
    } else {
        // Append, ensuring exactly one trailing newline before + after.
        const trimmed = original.replace(/\n+$/, '');
        next = `${trimmed}\n${quoted}\n`;
    }

    writeFileSync(path, next, 'utf8');
    return { created: false, replaced };
}
