import { spawnSync } from "node:child_process";

/**
 * DEPRECATED SHIM — do not add logic here.
 *
 * This script USED to link players.gsis_id by fuzzy NAME matching, which caused
 * id collisions (Bijan↔Brian Robinson, Justin↔Jermar Jefferson, Tyreek↔Taysom
 * Hill, …) that corrupted every stats-by-gsis feature.
 *
 * The correct, collision-proof linker keys on the STABLE sleeper_id using the
 * authoritative nflreadpy roster. That lives in Python (same source of truth as
 * all stats ingestion — the old @camfleety/nfl-data-js roster import now returns
 * empty). This shim just forwards to it so nothing calls the unsafe path.
 *
 *   scripts/repair-gsis-mapping.py   (dry-run by default; --apply to write)
 *
 * Usage:
 *   npx tsx scripts/link-all-players-to-nfl-stats.ts            # dry-run preview
 *   npx tsx scripts/link-all-players-to-nfl-stats.ts --apply    # write changes
 */

const args = process.argv.slice(2);
console.log("↪ Delegating to scripts/repair-gsis-mapping.py (sleeper_id-keyed, collision-proof).");
console.log("  Name-based linking is retired — see the header of this file.\n");

const res = spawnSync("python3", ["scripts/repair-gsis-mapping.py", ...args], { stdio: "inherit" });
process.exit(res.status ?? 1);
