---
baseline_commit: 84618500b25ef5a2581e01620a59681a6f990845
---

# Story 3.2: Kicker and Defense Gap Clarity

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Chino, who streams kickers and defenses every week,
I want to see where my kicker and defense rank among all NFL kickers and defenses, how the best available compares, and a clear warning whenever that comparison is unreliable,
so that I can trust "no action needed" and never miss a better streamer because of missing data.

## Context & Intent

Kickers and defenses are the hardest positions to judge. They have no dynasty value, they depend on weekly CSV uploads, and today the app goes silent when data is missing or when my current K/DEF is unranked. Story 3.1 renders slot gaps for QB/RB/WR/TE/K through the shared engine. This story:

1. Adds **DEF** to the engine and card (3.1 deliberately excludes it).
2. Adds K/DEF-specific clarity: pool size ("#5 of 32"), unranked wording, and an upload-freshness warning.
3. Fixes the identity bugs that would make K/DEF "no action" untrustworthy.

Target output: `K · Aubrey · wk #5 of 32 · best available #12 · no action`.

**Depends on Story 3.1** (engine, card, `getStartedTeams`, `getTeamSlotGaps`).

Epic: `_bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md`

## Acceptance Criteria

1. **DEF in the engine.** `computeSlotGaps` supports slots whose eligible set is `DEF` (see the DEF-slot test used in `action-center.ts`: `eligible.size === 1 && eligible.has('DEF')`). The weekly pool for DEF is `dst`, using `GAP_THRESHOLDS.weekly.dst = 5` (add this key). DEF has no ROS horizon (not rendered, per 3.1 AC 11).
2. **DEF candidates.** `getTeamSlotGaps` adds unrostered defenses from `getWeeklyDstRankings()` as candidates (same shape as the kicker injection: `sleeper_id = DEF_{ABBR}`, `position = 'DEF'`, `team` = the NFL abbr). A defense is available only if its id is not in `rosteredInLeague` **after platform normalization (AC 5)**.
3. **Pool size.** K and DEF rows show rank and pool size, for example `#5 of 32`, where the pool size is the number of ranked rows in that week's uploaded list for that kind. `HorizonGap` gains an optional `poolSize`.
4. **Unranked mine.** If my K or DEF is not in this week's list, the row reads "Your K isn't in this week's ranking" (or DEF), is `unranked-mine`, opens by default, and still shows the best available. It must never be treated as "no action".
5. **Platform identity must be correct for defenses**, otherwise a rostered defense is offered as "available" and "no action" cannot be trusted:
   - **Sleeper:** the team page's `allLeaguePlayerIds` is built from raw `r.players`, where Sleeper returns defenses as bare abbreviations (`"SEA"`). Our `players` table keys them as `DEF_SEA`. Normalize roster ids with `normalizeSleeperStarterId` (`src/lib/sleeper.ts`) before building `rosteredIdSet`, the enriched roster, and the starters set, as `src/app/league/[leagueId]/free-agents/page.tsx` and the portfolio route (`buildSleeper`) already do. Verify that my own defense now appears in my roster and in the optimizer.
   - **Fleaflicker:** rostered defenses are matched by name. Resolve defense team names to `DEF_{ABBR}` with `resolveDefenseId` (`src/lib/nameUtils.ts`) the way the Fleaflicker free-agents page does.
   - **Yahoo / MyFFPC:** ids are already `DEF_{ABBR}` in the DB; confirm and add a test.
6. **Freshness and missing uploads.** New helper `getWeeklyKindStatus()` in `src/lib/weekly-rankings.ts` returns, for each kind (`flex`, `qb`, `k`, `dst`): `{ latestWeek: number | null, rowsAtOverallLatest: number }`, plus `overallLatestWeek` (the existing `getLatestWeek()` semantics). Derive status without needing the NFL calendar:
   - `missing`: no rows for the kind at all.
   - `stale`: the kind's latest week is earlier than `overallLatestWeek`.
   - `ok`: the kind has rows at `overallLatestWeek`.
   When a kind the league actually starts (a K or DEF slot exists) is `missing` or `stale`, the card shows one muted line naming the kind and weeks ("No Week 6 kicker ranking uploaded. Last upload: Week 5"), linking to `/admin`. In that state the K/DEF row **must not** say "no action"; it says "can't compare, no current ranking".
7. **Game-time gating** for K and DEF matches the Action Center: exclude available K/DEF whose NFL team is in `startedTeams` (weekly horizon). A K/DEF of mine whose game has started is shown as "locked (game started)" with no gap. DEF team abbr comes from the id (`DEF_{ABBR}`); K team comes from the ranking row's `team`.
8. **No K/DEF row** for leagues without a K or DEF starting slot.
9. **Agreement with the Action Center.** For the same inputs, the gap card's best-available K and DEF, and their ranks, equal what `streamKickerItems`/`streamItems` (in `src/lib/action-center.ts`) choose. A shared fixture-based test asserts this. The two features keep **separate thresholds** (Action Center fires at 3 rank spots; this card uses 5 for display). Document that difference in a code comment in `GAP_THRESHOLDS`; do not change Action Center behavior.
10. **Tests** (`slot-gaps.test.ts` additions plus a new `weekly-kind-status.test.ts` for the pure part of the status helper, and an identity-normalization test file):
    - DEF slot and K slot compare within `dst` and `k` pools; pool size appears in the returned data.
    - Unranked mine for K and DEF; locked own K/DEF; started-game exclusion for both.
    - Kind status: `ok`, `stale`, `missing`; card text expectations for each via the data returned (no DOM test needed beyond a simple render test if you add one).
    - Rostered-DEF exclusion for each platform data shape: Sleeper bare `"SEA"` normalized to `DEF_SEA`; Fleaflicker team name resolved to `DEF_{ABBR}`; Yahoo/MyFFPC `DEF_{ABBR}`.
    - Agreement test against `streamItems`/`streamKickerItems` using one shared league fixture.

## Tasks / Subtasks

- [x] **Task 1: Engine DEF + pool size** (AC: 1, 3, 4, 7, 8, 10)
  - [x] Add `dst` to `GAP_THRESHOLDS.weekly`; add `poolSize` to `HorizonGap`; DEF slot handling and unranked/locked states in `slot-gaps.ts`.
- [x] **Task 2: Kind status helper** (AC: 6, 10)
  - [x] `getWeeklyKindStatus()` in `src/lib/weekly-rankings.ts` (one grouped query: `SELECT kind, MAX(week), COUNT(*) FILTER (WHERE week = overallLatest)`). Keep the status classification as a pure function so it can be unit tested without the DB.
- [x] **Task 3: DEF candidates + platform identity** (AC: 2, 5, 10)
  - [x] DEF injection in `team-slot-gaps.ts`.
  - [x] Sleeper team page: normalize roster and starter ids.
  - [x] Fleaflicker team page: resolve defense names to ids.
  - [x] Confirm Yahoo/MyFFPC.
  - [x] Regression tests.
- [x] **Task 4: Card states** (AC: 3, 4, 6)
  - [x] "#N of M" labels, unranked wording, stale/missing line with `/admin` link, "locked (game started)".
- [x] **Task 5: Agreement test** (AC: 9)
  - [x] One league fixture drives both `computeSlotGaps` and `buildActionCenter`'s stream items; assert the same best available and ranks.
- [x] **Task 6: Verify** (AC: all)
  - [x] `npm run test`, `npx tsc --noEmit`; manual check on a real Sleeper league during an in-season week (the Sleeper defense identity fix is the riskiest part: confirm my defense shows in my lineup and the optimizer).
  - [x] Add a CHANGELOG entry.

### Review Findings

Code review 2026-11-25 (three layers; reviewed `8461850..47dc6b9`).

- [x] [Review][Decision] RESOLVED (option 1, extend to QB and Flex): Should the upload-staleness notice also cover the QB and Flex lists? Today only K and DEF produce a notice. If the flex or qb list is stale or missing, those slots show nothing comparable and no message explains why, because other lists keep `hasWeeklyData` true. Options: (1) extend notices and stale handling to qb and flex for any league that starts those slots (a quiet one-line message, only shown when something is wrong); (2) leave K and DEF only, as specified.
- [x] [Review][Patch] Kicker team abbreviations: the weekly rankings store Jacksonville as `JAC` (confirmed in the database: 1 kicker, 4 flex, 1 QB row for week 12), but the started-teams set and the players table use `JAX`. A Jacksonville kicker whose game already started is not excluded or locked, in Roster Gaps and in the Action Center's kicker stream (same source). Normalize with `fixTeamAbbr` at the source and defensively in the candidate helpers; make `defenseCandidates` take the team from the id (AC 7) before the row's team. [src/lib/weekly-rankings.ts:getWeeklyKickerRankings, src/lib/slot-gaps.ts:kickerCandidates/defenseCandidates]
- [x] [Review][Patch] If my kicker or defense is not in this week's list and no ranked free agent exists, the row shows nothing, so the "Your kicker isn't in this week's ranking" line (AC 4) never appears. Show the line whenever my K/DEF has no weekly rank and the list is current, and keep the row quiet (no "worth a move" without something to move to). [src/components/RosterGapsCard.tsx]
- [x] [Review][Patch] Test gaps: no started-team case in the K agreement test, no alias case (`JAC`) for `kickerCandidates`, and no card-level check for the unranked wording. [src/__tests__/lib/defense-identity.test.ts, slot-gaps.test.ts]
- [x] [Review][Defer] No automated tests for `getWeeklyKindStatus`'s queries or the page wiring (Fleaflicker name matching was verified live on 22 of 22 rostered defenses). [src/lib/weekly-rankings.ts] — deferred, no database test harness

Dismissed as noise or handled elsewhere (about 18): `getWeeklyKindStatus` shape differs from the spec text (intentional, split into a pure module); a failed freshness query (the rows then read "unavailable", not "no action"); rows with null ranks (never occurs); alias handling for rostered ids (platform ids already match); DEF swap guards (consistent with the Action Center's stream); the `PK`/`DST` token handling; reserve/taxi ids (included in Sleeper's `players` list); card edge cases; the pinned-threshold test; admin link; and similar.

## Dev Notes

### Known pitfalls this story exists to prevent

1. **Value-capped free-agent lists drop K and DEF.** Neither has a FantasyCalc value, so `fc_value > 0` queries omit them (see CHANGELOG 2026-09-27 and 2026-10-06; commit `69f39c4`). Candidates must come from the weekly ranking lists, not the page's value list.
2. **Sleeper team-page defenses are not normalized.** `src/app/league/[leagueId]/team/[rosterId]/page.tsx` line ~67 sets `allLeaguePlayerIds = rosters.flatMap(r => r.players || [])` with raw Sleeper ids. A rostered `"SEA"` never matches the `DEF_SEA` key. Effects: my defense is missing from `enrichedPlayers` (so the optimizer never sees it), and the league-wide rostered set does not exclude rostered defenses. Fix by mapping ids through `normalizeSleeperStarterId` right where `allLeaguePlayerIds` and `roster.starters` are consumed. Be careful about other uses of `allLeaguePlayerIds` on that page (trade evaluator, ownership maps): normalizing at the source is correct for all of them because the `players` table only has `DEF_*` keys, but run the page before and after and compare.
3. **`getLatestWeek()` returns the newest week across all kinds.** If flex rankings for week 6 are uploaded but kickers were not, `getWeeklyKickerRankings()` (which defaults to that week) returns an empty list. That silent empty list is the "no kicker suggestion, no explanation" experience. The kind-status helper exists to turn it into an explicit message.
4. **Fleaflicker defenses have no stable sleeper id on the roster.** They are matched by team name (CHANGELOG 2026-10-06: `resolveDefenseId`). The Fleaflicker team page builds its player list via `nameToPlayerMap`; verify defenses resolve through it (the `normalizeName` path may or may not handle "Seattle Seahawks"). If they do not, add the `resolveDefenseId` step.

### Existing code to reuse

- `src/lib/weekly-rankings.ts`: `getWeeklyDstRankings(week?)`, `getWeeklyKickerRankings(week?)`, `getLatestWeek()`, `getWeeklyRanks`, `rankForPosition` (already routes `DEF`/`DST` to the `dst` kind and `K`/`PK` to `k`).
- `src/lib/action-center.ts#streamItems`/`#streamKickerItems`: the behavioral reference for gating, rostered exclusion, and "unranked mine".
- `src/lib/nameUtils.ts#resolveDefenseId`, `fixTeamAbbr`, `kickerMatchKey`.
- `src/lib/sleeper.ts#normalizeSleeperStarterId`.
- DB-league data already includes defenses and kickers in `data.freeAgents` (`db-league-data.ts`, `[...valued, ...defenses, ...kickers]`), so Yahoo/MyFFPC need no extra candidate query.

### Architecture compliance

- Same rules as Story 3.1: reuse `src/lib/`, `sleeper_id` canonical, read-only, no new tables.
- Only one new query (`getWeeklyKindStatus`); put it in `weekly-rankings.ts` next to its siblings, not in a page.

### Technical requirements

- DEF ids are `DEF_{ABBR}` with ABBR in our abbreviation convention (JAX, LAR, etc.). Use `fixTeamAbbr` when comparing against `startedTeams`.
- Keep `computeSlotGaps` pure. The kind status is computed by the server helper and passed in as plain data (`kindStatus` input).

### Library / framework requirements

- No new dependencies. No web research needed.

### File structure requirements

| Action | Path |
|---|---|
| Edit | `src/lib/slot-gaps.ts` |
| Edit | `src/lib/team-slot-gaps.ts` |
| Edit | `src/lib/weekly-rankings.ts` (add `getWeeklyKindStatus`) |
| Edit | `src/components/RosterGapsCard.tsx` |
| Edit | `src/app/league/[leagueId]/team/[rosterId]/page.tsx` (normalize defense ids) |
| Edit | `src/app/fleaflicker/[leagueId]/team/[teamId]/page.tsx` (resolve defense names) |
| Edit | `src/__tests__/lib/slot-gaps.test.ts` |
| New | `src/__tests__/lib/weekly-kind-status.test.ts` |
| New | `src/__tests__/lib/defense-identity.test.ts` |

### Testing requirements

- Same conventions as Story 3.1. The agreement test imports `buildActionCenter` (see `src/__tests__/lib/action-center.test.ts` for how it builds `PortfolioLeague` and `ActionCenterInput` fixtures) and `computeSlotGaps`, then compares outputs.
- Identity tests should be pure: test the normalization/resolution functions with Sleeper/Fleaflicker/Yahoo/MyFFPC-shaped inputs, not the pages.

### Previous story intelligence (Story 3.1)

- 3.1 defines `SlotGap`/`HorizonGap`, `GAP_THRESHOLDS`, `getTeamSlotGaps`, `RosterGapsCard`, and `getStartedTeams`. This story extends them; keep the 3.1 public shapes backward compatible (add optional fields only).
- 3.1 renders unranked/unavailable states generically. 3.2 supplies K/DEF-specific wording and the freshness line.

### Git intelligence

- `7840f10`, `4493118`, `69f39c4`: K and DEF were added to free-agent screens with separate fetches because of the value cap. Mirror that approach rather than relying on the value list.
- `8c83ccb`, `91ef8fb` (weekly kicker rankings moved from scrape to CSV): upload-based data is the established model, which is why freshness matters.

### Project Structure Notes

- Same as 3.1. Definition of Done applies: tests, `tsc`, CHANGELOG/README update, local confirmation before pushing.

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md]
- [Source: _bmad-output/implementation-artifacts/3-1-slot-gap-engine-and-team-gap-view.md]
- [Source: src/lib/action-center.ts#streamItems, #streamKickerItems]
- [Source: src/lib/weekly-rankings.ts]
- [Source: src/lib/sleeper.ts#normalizeSleeperStarterId]
- [Source: src/lib/nameUtils.ts#resolveDefenseId]
- [Source: src/app/league/[leagueId]/free-agents/page.tsx (defense/kicker handling pattern)]
- [Source: CHANGELOG.md: 2026-09-27, 2026-10-04, 2026-10-06]

## Dev Agent Record

### Agent Model Used

Kiro (bmad-dev-story workflow), model: Auto.

### Debug Log References

- Red phase confirmed for `weekly-kind-status`, `defense-identity` and the new `slot-gaps` DEF/pool/stale tests before implementing.
- The K agreement test first failed because kicker streams are per-league actions (`buildLeagueActions`), not part of the cross-league Action Center; test changed to read them there. Engine was correct.
- Test typing: a `...extra` spread widened `position` to `string | null`; moved the spread first.
- Live dev server briefly served the old compile after edits; touching the files forced a rebuild.

### Completion Notes List

- All 10 acceptance criteria implemented.
- **AC 1/3/4/7/8 (engine):** `WeeklyPool` gained `dst`; `GAP_THRESHOLDS.weekly.dst = 5`; DEF slots are no longer skipped; `HorizonGap` gained `poolSize` and `noRanking`; DEF recommendation is a one-for-one swap (`source: 'stream'`); an empty single-position slot (K/DEF) resolves its pool from the slot.
- **AC 2 (candidates):** pure `defenseCandidates` / `kickerCandidates` in `slot-gaps.ts`; `getTeamSlotGaps` now builds both from the uploaded lists. Rostered ids are normalized inside the helper too (defense in depth).
- **AC 5 (identity):** the Sleeper team page now normalizes `roster.players`, league roster ids, ownership map keys, starters and the health-dashboard lists with `normalizeSleeperStarterId`. **Fleaflicker: no change needed.** Verified against the real league: 22 of 22 rostered defenses already match by name through the page's `normalizeName`, and `resolveDefenseId` agrees. **Yahoo/MyFFPC:** confirmed all 40 DEF `roster_players` rows are `DEF_{ABBR}`.
- **AC 6 (freshness):** new pure `weekly-freshness.ts` (`classifyKinds`, `kindNotices`) and `getWeeklyKindStatus()` (two grouped queries) in `weekly-rankings.ts`. Notices are produced only for kinds the league starts; the card prints them with an Admin link, K/DEF rows read "no current ranking", and the all-clear line is worded to claim only what could be compared.
- **AC 9 (agreement):** shared-fixture tests assert the same best defense/kicker and ranks as `streamItems` / `streamKickerItems`, including started-team exclusion. Thresholds stay separate (Action Center 3, card 5); documented in `GAP_THRESHOLDS`.
- Tests: 32 added (slot-gaps +16, weekly-kind-status 9, defense-identity 9; includes updated DEF-slot test). Full suite: 23 files, 292 tests passing. `tsc`: no errors outside the 17 pre-existing test-file ones. ESLint not run (hangs in this repo).
- **Live verification (read-only):** your Sleeper team with DEF + SUPER_FLEX slots now shows "DEF New England Patriots DEF #12" in the optimizer (was "—") and `Wk DEF #12 of 24 · no action` in Roster Gaps; a 12-team league confirmed all 32 defenses are rostered, so "No ranked free agents" is accurate. K and DEF rows with real free agents render `Wk K #22 of 32 vs #7` and `Wk DEF #9 of 24 vs #6`; locked kickers show "locked (game started)".
- **Not verified live:** the stale/missing notice. Week 12 has all four kinds uploaded, so it was covered by unit tests only. It will appear on its own the first week a kind is skipped.
- **Observed, out of scope:** the older "Waiver-wire upgrades" card on team pages still suggests kickers whose game already started (it does not use started teams). Roster Gaps correctly excludes them.
- **Not committed or pushed.** Waiting for Chino's local confirmation per the Definition of Done.

### File List

- src/lib/slot-gaps.ts (DEF pool, candidates, pool sizes, stale handling)
- src/lib/weekly-freshness.ts (new)
- src/lib/weekly-rankings.ts (`getWeeklyKindStatus`)
- src/lib/team-slot-gaps.ts (DEF candidates, freshness, normalization)
- src/components/RosterGapsCard.tsx
- src/app/league/[leagueId]/team/[rosterId]/page.tsx (Sleeper id normalization, notices)
- src/app/fleaflicker/[leagueId]/team/[teamId]/page.tsx (notices)
- src/app/db-league/[platform]/[leagueId]/team/[rosterId]/page.tsx (notices)
- src/__tests__/lib/slot-gaps.test.ts
- src/__tests__/lib/weekly-kind-status.test.ts (new)
- src/__tests__/lib/defense-identity.test.ts (new)
- CHANGELOG.md
- README.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/lib/weekly-freshness.ts, src/lib/weekly-rankings.ts, src/lib/team-slot-gaps.ts, src/lib/slot-gaps.ts, src/components/RosterGapsCard.tsx (review patches)
- src/__tests__/components/RosterGapsCard.test.tsx (new, review)
- src/__tests__/lib/weekly-kind-status.test.ts, src/__tests__/lib/defense-identity.test.ts, src/__tests__/lib/slot-gaps.test.ts (review tests)

### Change Log

- 2026-11-25: Implemented Story 3.2 (DEF in Roster Gaps, pool sizes, unranked wording, upload-freshness notices, Sleeper defense identity fix, agreement tests). Status to review.
- 2026-11-25: Code review: decision resolved by Chino, the upload-staleness notice now also covers the QB and Flex lists (AC 6 extended: kinds the league starts are QB, Flex, K, DEF). Patches applied: kicker/defense team abbreviations normalized (JAC to JAX) at the source and in the candidate helpers, defense team taken from the DEF_ id; an unranked K/DEF with no ranked free agent now says "isn't in this week's ranking"; a stale weekly list no longer hides a ROS-driven gap; tests added. Status to done.
