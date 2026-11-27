---
baseline_commit: 7840f100a279e14c218fc9c12ca08b1ea1dc7208
---

# Story 4.1: Rankings Replace on Upload (clear players missing from the file)

Status: review

## Story

As Chino,
I want a rankings upload (1QB, SF, redraft, ROS) to replace the previous ranking, so players who are no longer in the file lose their old ranks,
so that injured or dropped players (for example Jaxson Dart, Terry McLaurin) stop showing up with a stale rank everywhere in the app.

## Context & Intent

`src/app/api/admin/upload-rankings/route.ts` only UPDATES players found in the uploaded file. It never clears players that are absent, so a player ranked in September is still "ranked" in November. Investigation on 2026-11-25: the latest ROS upload covers 149 players; 54 more players still carry ROS data from nine earlier uploads (22 WR, 12 RB, 10 QB, 10 TE), including their PPG, SOS and bye week. The weekly-rankings uploads already work as a full replace; this story gives the four rankings categories the same semantics.

Decisions from Chino (2026-11-25):
- "Not on this week's sheet" means unranked. That is the intended meaning.
- All four categories (1qb, sf, redraft, ros) replace on upload.
- Show which players an upload cleared.
- Check the existing 54 stale players with Chino before clearing them (a one-time cleanup, NOT done by this story's code).

## Acceptance Criteria

1. After a successful `1qb`, `sf`, `redraft` or `ros` upload, every player who had a value in that category's overall-rank column **before** the upload and who was **not matched** to a row in the file has that category's fields cleared:
   - 1qb: `rank_1qb_overall`, `rank_1qb_pos`, `rank_1qb_tier`, `rank_1qb_updated_at`
   - sf: `rank_sf_overall`, `rank_sf_pos`, `rank_sf_tier`, `rank_sf_updated_at`
   - redraft: `redraft_rank_overall`, `redraft_rank_pos`, `redraft_rank_tier`, `redraft_auction_value`, `redraft_rank_updated_at`
   - ros: `rank_ros_overall`, `rank_ros_pos`, `rank_ros_tier`, `rank_ros_ppg`, `ros_sos`, `ros_next4_sos`, `bye_week`, `rank_ros_updated_at`
   No other columns are touched (FantasyCalc values, other categories).
2. The existing history snapshot (`rankings_history`) still runs **before** any overwrite or clear, so cleared values stay recoverable. No change to that behavior.
3. **Safety guards.** Clearing is skipped, with a reason in the response, when (a) no rows matched, (b) the match rate is below 50% of the file's rows, or (c) fewer players matched than 50% of the number previously ranked in that category (protects against uploading the wrong or a truncated file). Updates from the file still apply.
4. The response includes `clearedCount`, `cleared` (list of `{ name, position, team }`), and `clearSkipped` (reason string or null). The admin page message shows `Cleared N: name (POS), ...` when N > 0 and the skip reason when skipped.
5. A player in the file whose name does not match (listed in `unmatchedNames`) is treated as not matched, so if they were previously ranked they are cleared. The unmatched list and the cleared list are both shown so a name-matching problem is visible.
6. Pure logic is unit tested with no database: which ids to clear, each guard, and the per-category field sets.
7. Existing upload behavior for matched players is unchanged.

## Tasks / Subtasks

- [x] **Task 1:** Pure helper `src/lib/rankings-clear.ts`: `planClear`, `clearFieldsFor`, thresholds. Tests first. (AC: 1, 3, 5, 6)
- [x] **Task 2:** Wire the route: collect matched ids, run the clear after the updates, extend the response. (AC: 1, 2, 4, 5, 7)
- [x] **Task 3:** Admin page message shows cleared players and skip reason. (AC: 4)
- [x] **Task 4:** Verify: full tests, `tsc`; CHANGELOG entry. Do not write to the database. (AC: all)

## Dev Notes

- The route already loads `existingRanks` (players with a non-null overall rank for the category) before applying the file; reuse its ids as the "previously ranked" set.
- Database columns per category are listed in `src/db/schema.ts` (`playerValues`). `rank_ros_ppg` is decimal; clearing to `null` is fine for all.
- One-time cleanup of the current 54 stale ROS rows is a separate, confirmed action (see Completion Notes for the list). Equivalent to "clear ROS fields where `rank_ros_updated_at` is older than the newest upload".
- Ranks that become null flow through existing consumers as "unranked" (same as a player never ranked).

### References
- [Source: src/app/api/admin/upload-rankings/route.ts]
- [Source: src/db/schema.ts#playerValues]
- [Source: src/app/admin/page.tsx (upload message)]
- [Source: src/lib/rankings-upload.ts (unrelated custom-rankings importer)]

## Dev Agent Record

### Agent Model Used

Kiro (Auto).

### Completion Notes List

- Pure logic in `src/lib/rankings-clear.ts` (`planClear`, `clearFieldsFor`, `CLEAR_MIN_MATCH_RATE_PCT = 50`, `CLEAR_MIN_COVERAGE_PCT = 50`). 14 tests written first (red), then green.
- Route: matched ids are collected in the apply loop; after the updates, `planClear` compares them to `existingRanks` (already loaded for the history snapshot, so previous values are archived before anything is cleared). Clears run in batches of 500 and also bump `updated_at`. Response adds `clearedCount`, `cleared[]`, `clearSkipped`. Unknown categories are never cleared.
- Admin message now lists cleared players and any skip reason; the message paragraph gets `whitespace-pre-line` so the existing "Unmatched:" line and the new "Cleared" line show on separate lines.
- **One-time cleanup done (2026-11-25, confirmed by Chino after reviewing the list):** the 54 stale ROS rows (22 WR, 12 RB, 10 QB, 10 TE) were cleared in one transaction that aborts unless exactly 54 rows match. Their previous values are saved in `4-1-stale-ros-backup-2026-11-25.json` (restore by updating the ROS columns by `sleeper_id`). Afterwards 149 ROS rows remain, all from the latest upload. The code change itself makes this automatic from the next upload on.
- Full suite: 21 files, 252 tests passing. `tsc`: same 17 pre-existing test-file errors only. ESLint not run (hangs in this repo).
- Not covered by an automated test: the route's DB writes (no DB test harness exists in the repo). The route logic is thin; the decisions are in the tested pure helper.
- Follow-up from this work, decided with Chino: a missing ROS rank is now quiet in Roster Gaps (see Story 3.1 change log).

### File List

- src/lib/rankings-clear.ts (new)
- src/__tests__/lib/rankings-clear.test.ts (new)
- src/app/api/admin/upload-rankings/route.ts
- src/app/admin/page.tsx
- CHANGELOG.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/4-1-stale-ros-backup-2026-11-25.json (new, backup of cleared rows)

### Change Log

- 2026-11-25: Rankings uploads (1qb, sf, redraft, ros) now replace the previous ranking: players missing from the file are cleared, with guards and a visible cleared list. Status to review.
