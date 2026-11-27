---
baseline_commit: 7840f100a279e14c218fc9c12ca08b1ea1dc7208
---

# Story 3.1: Slot Gap Engine + Per-Team "Roster Gaps" View

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Chino, managing one league at a time,
I want to see, for each starting slot on my team, where my player ranks next to the best available free agent, both this week and rest-of-season,
so that I can tell at a glance whether a better free agent exists and whether I need to act.

## Context & Intent

The app already has engines that compare free agents to a roster (`findWaiverUpgrades`, `recommendWaiverValue`, the DEF/K streaming items). Their output is a capped, filtered list of suggestions, so "nothing shown" is indistinguishable from "nothing exists", and no suggestion ever shows where my current player ranks. This story adds the **comparison layer**: for each starting slot, `my rank` vs `best available rank`, for two horizons (this week, ROS), plus the recommended move when the gap is worth acting on.

The output must be **quiet by default**: slots without a worthwhile gap collapse to a single line; slots with an actionable gap expand and say how to fix it. When nothing needs doing, the card says so in one line. This card must not add alerts, badges, or counts anywhere else in the app (Epic 3 noise budget).

Scope of this story: QB, RB, WR, TE and K slots (including FLEX/SUPERFLEX), on the **team page** of Sleeper, Fleaflicker, and the DB-backed (Yahoo/MyFFPC) leagues. **DEF slots are Story 3.2.** Kicker-specific polish (pool size, freshness warning) is also Story 3.2; this story only needs K to render correctly through the same engine.

Epic: `_bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md`

## Acceptance Criteria

1. **Pure engine.** `src/lib/slot-gaps.ts` exports `computeSlotGaps(input): SlotGap[]` with no I/O. It returns one `SlotGap` per starting slot (from `buildSlots(rosterPositions)`), in slot order.
2. **"My player at the slot" = the optimal-lineup assignment.** Use `optimizeLineup` (not the current `is_starter` flags, which carry no slot identity). Players whose game has started are passed with `locked: true`, exactly as `findWaiverUpgrades` does, so a played starter keeps its slot.
3. **Two horizons per slot, each independent:**
   - **Weekly:** my player's `weeklyRank` vs the best-ranked eligible free agent's `weeklyRank`, compared **only within the same weekly rank pool** as my player (`qb`, `flex` for RB/WR/TE, `k`). Weekly ranks are pool-scoped, so a QB rank is never compared to a flex rank, even in a SUPERFLEX slot.
   - **ROS:** my player's `rosPosRank` vs the best free agent's `rosPosRank` **at the same position as my player** (a FLEX slot filled by a WR compares to WR free agents). `rosRank` breaks ties. `rosPpg` is carried as a supporting number only.
   - The best weekly free agent and the best ROS free agent may be different players, and both are returned.
4. **Gap and status.** For each horizon: `gap = myRank − bestAvailableRank` (positive means the free agent is better). Status values: `none` (gap ≤ 0), `minor` (0 < gap ≤ threshold), `actionable` (gap > threshold), `unranked-mine` (my player has no rank for this horizon but a ranked free agent exists), `unavailable` (no usable data for this horizon). Thresholds live in one exported constant:
   ```ts
   export const GAP_THRESHOLDS = {
     weekly: { qb: 4, flex: 8, k: 5 },          // rank spots within the pool
     ros:    { QB: 4, RB: 6, WR: 6, TE: 4 },    // position-rank spots
   } as const;
   ```
   These are starting values, to be tuned against real weeks. K has no ROS threshold; see AC 11.
5. **Slot status** is the worse of the two horizons (`actionable` > `unranked-mine` > `minor` > `none` > `unavailable`).
6. **Game-time gating.** Free agents whose NFL team is in `startedTeams` are excluded from the **weekly** horizon only. A slot whose player is locked reports `weekly.status = 'unavailable'` with `locked: true` (nothing can change this week). The ROS horizon is never gated.
7. **Empty slot.** If no roster player fills a slot, the slot is `actionable` for any horizon where an eligible ranked free agent exists, with `myRank = null` and `myPlayer = null`.
8. **Recommended move for actionable slots.** `computeSlotGaps` accepts the `WaiverUpgrade[]` already produced by `findWaiverUpgrades` and attaches, per slot, the matching move (add, guarded drop or `null` for an open roster spot, drop tier, weekly rank gain). Matching rule: the move for a slot is the upgrade whose `add` is the slot's best weekly free agent. A slot that is actionable on the ROS horizon only has no `WaiverUpgrade` (that engine is weekly-only), so show the best ROS free agent **without** a drop and with the label "Check your bench for a drop". Do not invent drop logic for ROS in this story. Informational (`block`-tier-only) upgrades surface as the note "Help exists, but every droppable player is a core asset" and never name a drop. A given free agent is attached as the recommended add to at most one slot (the slot with the largest gap).
9. **Team-page card.** New server component `src/components/RosterGapsCard.tsx`, rendered **directly below `LineupOptimizerCard`** on:
   - `src/app/league/[leagueId]/team/[rosterId]/page.tsx` (Sleeper)
   - `src/app/fleaflicker/[leagueId]/team/[teamId]/page.tsx` (Fleaflicker)
   - `src/app/db-league/[platform]/[leagueId]/team/[rosterId]/page.tsx` (Yahoo, MyFFPC)

   Pure display (no client JS). Layout:
   - Header: `Roster Gaps` and a summary such as `2 slots worth a move · 7 fine`. Omit the count of "fine" slots if zero.
   - One row per slot using native `<details>`. `none`/`minor` rows are **closed** and show on the summary line only: slot label, my player, and `wk {pool} #{mine} vs #{best} · ROS #{mine} vs #{best}`, followed by `no action` (or `close` for `minor`). `actionable` and `unranked-mine` rows are **open** by default and show the best free agent(s) by name, the recommended move, and a deep link to the platform.
   - When every slot is `none`/`minor`/`unavailable`, show one green line, "No better free agents for your starters", with the slot rows still available (collapsed) underneath.
10. **No noise leakage.** The card adds no badge, count, or color to any other component (headers, nav, Action Center, other cards). It renders nothing visible when the league has no starting-slot config (the optimizer card already explains that), and it does not render a placeholder.
11. **Honest data states** (never guess):
    - No weekly rankings for the week: only the ROS horizon renders, with one muted line, "Weekly rankings aren't uploaded for week N" linking to `/admin`.
    - No ROS data for the slot's position (for example K, which the ROS upload does not cover): that horizon is simply not rendered for the row. No "unranked" text.
    - No ranked free agents in a horizon: `none` with the text "no ranked free agents".
12. **Candidate sourcing is not limited to the value-capped free-agent list.** The team pages currently pass a free-agent list of the top ~300 players by FantasyCalc value (`fc_value > 0`). That list drops useful weekly plays that have little or no dynasty value. The team-page helper must add **weekly-ranked unrostered players** (see Dev Notes, "Candidate sourcing") so the weekly horizon sees them.
13. **Started-teams on team pages.** Team pages do not currently gate on started games. Add a server-side `getStartedTeams()` (see Dev Notes) and pass it to the new helper. Existing cards on those pages keep their present behavior; wiring `startedTeams` into `getTeamWaiverUpgrades`/`optimizeTeam` is explicitly **not** part of this story (see Story 3.3 for the optimizer).
14. **Tests** in `src/__tests__/lib/slot-gaps.test.ts` (and a small one for `getStartedTeams`) cover:
    - Each of QB, RB/WR/TE (flex pool), K slots; FLEX and SUPERFLEX eligibility; pool isolation (QB in SUPERFLEX never compared to a flex rank).
    - Threshold boundaries: gap equal to threshold is `minor`; threshold + 1 is `actionable`; zero and negative gaps are `none`.
    - ROS compares same-position only; weekly and ROS name different best players.
    - Started-game exclusion (weekly only); locked slot player; empty slot.
    - `unranked-mine`; no ranked free agents; no weekly data at all.
    - Move attachment: pure add (open spot), swap with `safe`/`caution` tier, `block`-only informational, a free agent attached to only one slot.
    - `getStartedTeams` returns teams whose game state is not `pre`, returns an empty set on failure (fail open), and the `/api/nfl/started-teams` route still returns the same JSON shape.

## Tasks / Subtasks

- [x] **Task 1: Engine** (AC: 1–8, 14)
  - [x] Define types in `src/lib/slot-gaps.ts`: `SlotGap`, `HorizonGap`, `GapStatus`, `SlotMove`, `GAP_THRESHOLDS`, `SlotGapInput`.
  - [x] Build per-slot "my player" via `buildSlots` + `optimizeLineup` with `locked` flags (reuse `toOptimizer` logic from `waiver-upgrades.ts`; export a shared helper instead of copying if cheap).
  - [x] Weekly horizon with pool isolation; ROS horizon same-position.
  - [x] Move attachment from the supplied `WaiverUpgrade[]`; one-slot-per-add rule.
  - [x] Tests (AC 14). Follow the `P()`/`team()` factory style in `src/__tests__/lib/waiver-upgrades.test.ts`.
- [x] **Task 2: Started teams helper** (AC: 6, 13, 14)
  - [x] Add `getStartedTeams(): Promise<Set<string>>` to `src/lib/nfl-live.ts` (logic currently inline in `src/app/api/nfl/started-teams/route.ts`); make the route call it. Fail open (empty set).
  - [x] Unit test (mock `getLiveGameStates`; see `src/__tests__/lib/nfl-live.test.ts` for the existing mocking pattern).
- [x] **Task 3: Server data helper** (AC: 11, 12)
  - [x] New `src/lib/team-slot-gaps.ts` exporting `getTeamSlotGaps(...)`, modeled on `getTeamWaiverUpgrades`. It builds candidates, stamps weekly ranks, runs `findWaiverUpgrades`, and calls `computeSlotGaps`.
  - [x] Export `toPortfolioPlayer` from `src/lib/team-waiver-upgrades.ts` (rename optional) so the stamping code is shared. Do **not** change `getTeamWaiverUpgrades` behavior or its return type.
  - [x] Add the weekly-ranked unrostered candidate query (Dev Notes).
- [x] **Task 4: Card** (AC: 9, 10, 11)
  - [x] `src/components/RosterGapsCard.tsx` (server component, `<details>` rows, lucide icons only if needed).
  - [x] Deep link via `deepLinkFor` (exported from `src/lib/action-center.ts`).
- [x] **Task 5: Wire three team pages** (AC: 9, 12, 13)
  - [x] Sleeper, Fleaflicker, db-league pages (see Dev Notes for the exact inputs each page already has).
- [x] **Task 6: Verify** (AC: all)
  - [x] `npm run test` and `npx tsc --noEmit` (note: test files currently emit pre-existing `expect`/`it` type errors; do not count those as regressions, and do not try to fix them in this story).
  - [x] Manual check on one league per platform against a known case, for example a kicker whose rank and the best available rank you can read from the Admin upload.

## Dev Notes

### What exists today (read before touching anything)

- **`src/lib/waiver-upgrades.ts#findWaiverUpgrades(team, freeAgents, rosterPositions, leagueType, options)`** is the weekly-lineup engine. Key facts:
  - It only considers free agents with a `weeklyRank`, and drops those whose team is in `options.startedTeams`.
  - `poolOf()` maps QB→`qb`, RB/WR/TE→`flex`, K/PK→`k`. **DEF has no pool** (`poolOf` returns null), so the engine never produces DEF upgrades. DEF is Story 3.2.
  - Drop tiers: `blockAtValue`/`cautionAtValue` thresholds, supplied by callers as `KEEP_SCALE.BLOCK`/`KEEP_SCALE.CAUTION` with `longTermValueOf: blendedKeepValue` (see `getTeamWaiverUpgrades`). Mirror these exact options.
  - Returns `WaiverUpgrade[]` with `add`, `drop`, `type: 'add'|'swap'`, `tier`, `informational`, `cracksLineup`, `weeklyRankGain`, `comparedTo`, `pool`, `addWeeklyRank`, `dropWeeklyRank`, `valueSurrendered`.
- **`src/lib/lineup-optimizer.ts`**: `buildSlots`, `optimizeLineup(players, slots)` (greedy, most-restrictive slot first, locked players reserve slots), `optimizeAndDiff`. `OptimizerPlayer.locked` exists. **`optimizeTeam` in `weekly-rankings.ts` does not set `locked`** (it never receives started teams); you do not need to change it in this story.
- **`src/lib/team-waiver-upgrades.ts#getTeamWaiverUpgrades`** is the model to copy: it injects unrostered kickers from `getWeeklyKickerRankings()`, stamps weekly ranks with `getWeeklyRanks(ids)` + `rankForPosition`, converts to `PortfolioPlayer` via a private `toPortfolioPlayer`, and runs `findWaiverUpgrades` with `maxSuggestions: 25`.
- **`PortfolioPlayer`** (`src/lib/portfolio.ts`) already has `weeklyRank`, `rosRank`, `rosPosRank`, `rosPpg`, `rosSos`, `byeWeek`. No new fields are needed.
- **The Action Center (`src/lib/action-center.ts`) is a separate consumer.** Do not modify it, `findWaiverUpgrades` defaults, or `waiverPerLeague` caps. Those limits are deliberate noise control for the hub.

### Rank semantics (easy to get wrong)

- Weekly ranks come from `weekly_rankings` and are **per uploaded list**: `qb` list, `flex` list (RB/WR/TE ranked together, so "flex #14" is not "RB #14"), `k` list, `dst` list. Show the pool in the label ("Flex #14", "K #5", "QB #9").
- ROS ranks are on `player_values` (`rank_ros_overall`, `rank_ros_pos`, `rank_ros_ppg`, `ros_sos`, `ros_next4_sos`). Position ranks only.
- Lower rank is better everywhere. Unranked sorts last.
- The ROS upload does not appear to cover K or DEF. Treat missing ROS for a position as "horizon not applicable" (AC 11), not an error.

### Candidate sourcing (the part most likely to be done wrong)

Team pages build a free-agent list with a query like: `players ⨝ player_values WHERE fc_value > 0 AND position IN (QB,RB,WR,TE,K,DEF) AND id NOT IN rostered ORDER BY fc_value DESC LIMIT 300` (see the Sleeper page near line 361, and the Fleaflicker page, which slices to 300). Consequences:
1. Players with no FantasyCalc value never appear, including most kickers and defenses.
2. A strong weekly flex play with low dynasty value may fall outside the top 300.

`getTeamSlotGaps` must therefore build candidates from three sources and de-duplicate by `sleeper_id`:
1. The page's existing `freeAgentsForTxn` list.
2. Unrostered kickers from `getWeeklyKickerRankings()` (copy the block in `getTeamWaiverUpgrades`; `rosteredInLeague` decides availability).
3. **New:** unrostered players present in `weekly_rankings` for the week with kind `flex` or `qb`, ordered by `rank`, `LIMIT 150`, excluding `rosteredInLeague`, joined to `players` for `full_name`, `position`, `team`, and left-joined to `player_values` for `fc_value` and ROS fields. This is the fix for "better free agent that I never see".

Stamp weekly ranks once for the combined set with `getWeeklyRanks(ids)`.

### Per-page inputs (what each page already has)

| Page | Roster | Free agents | `rosteredInLeague` | Roster positions | League type |
|---|---|---|---|---|---|
| Sleeper `league/[leagueId]/team/[rosterId]/page.tsx` | `myPlayersForTxn` | `freeAgentsForTxn` | `rosteredIdSet` | `sleeperRosterPositions` | `leagueTypeVal` |
| Fleaflicker `fleaflicker/[leagueId]/team/[teamId]/page.tsx` | `myPlayersForTxn` (no `is_starter`) | `freeAgentsForTxn` | `rosteredIdSetFF` | `ffLineup?.rosterPositions` | `leagueTypeFF` |
| DB `db-league/[platform]/[leagueId]/team/[rosterId]/page.tsx` | `myPlayers` (has `is_starter`, ROS fields) | `data.freeAgents` (already includes defenses and kickers) | all `data.teams[*].players` ids | `data.rosterPositions` | **not fetched today**; query `leagues.league_type` as the Sleeper page does |

Notes:
- `UpgradeSourcePlayer` (in `team-waiver-upgrades.ts`) already carries the optional ROS fields. The Sleeper and Fleaflicker `myPlayersForTxn`/`freeAgentsForTxn` mappings **omit them**; extend those mappings to pass `rank_ros_overall`, `rank_ros_pos`, `rank_ros_ppg`, `ros_sos`, `ros_next4_sos`, `bye_week` when the source rows have them. If a page's source query does not select the ROS columns, add them to the select (the recent fix "ROS Rank showing as '–' on team pages", commit `5066a65`, shows where the Sleeper and Fleaflicker pages already read them).
- The legacy route `src/app/myffpc/[leagueId]/team/[rosterId]/page.tsx` is **out of scope**.

### Deep links

`deepLinkFor(platform, leagueId, myRosterId, myffpcLtuid)` in `src/lib/action-center.ts` is exported and already encodes the confirmed URL patterns (Sleeper `/leagues/{id}/team`, Fleaflicker `/teams/{id}`, Yahoo league home, MyFFPC SetLineup with ltuid or the in-app fallback). The MyFFPC `ltuid` comes from env (`MYFFPC_LEAGUES`) via `/api/myffpc?list=true`; if it is not readily available server-side on the db-league page, pass `null` and accept the in-app fallback.

### Architecture compliance (ARCHITECTURE.md)

- Rule 1/5: reuse `src/lib/` modules; do not add inline Sleeper/Fleaflicker fetches.
- Rule 7: `sleeper_id` is the canonical player key.
- Legacy pages read shared tables directly (rule 9), which is what these team pages do. No auth work here, and no writes to shared tables.
- This feature is read-only. No new tables, no migrations.

### Technical requirements

- TypeScript strict. New files `.ts`/`.tsx`; engine is pure and synchronous.
- Server component for the card; avoid client state. Use Tailwind classes consistent with `LineupOptimizerCard` (white card, `rounded-xl`, `ring-1 ring-zinc-900/5`, zinc text, green for the all-clear line).
- `export const dynamic = "force-dynamic"` is already set on the pages; do not cache the gap data.
- Keep the engine free of `@/db` imports so it is unit-testable (the DB-touching code lives in `team-slot-gaps.ts`).

### Library / framework requirements

- No new dependencies. Next.js 16.1.6 / React 19.2.3 (App Router, server components), Vitest 4, existing `lucide-react` icons. No web research needed; this story uses only in-repo APIs.

### File structure requirements

| Action | Path |
|---|---|
| New | `src/lib/slot-gaps.ts` |
| New | `src/lib/team-slot-gaps.ts` |
| New | `src/components/RosterGapsCard.tsx` |
| New | `src/__tests__/lib/slot-gaps.test.ts` |
| Edit | `src/lib/nfl-live.ts` (add `getStartedTeams`) |
| Edit | `src/app/api/nfl/started-teams/route.ts` (use the helper) |
| Edit | `src/lib/team-waiver-upgrades.ts` (export `toPortfolioPlayer`; no behavior change) |
| Edit | the three team `page.tsx` files listed above |

### Testing requirements

- Vitest, jsdom environment with globals (see `vitest.config.ts`), tests in `src/__tests__/lib/`. Import `describe, it, expect` from `vitest` explicitly as the existing tests do.
- Engine tests are pure and fixture-driven. Do not hit the database.
- Run `npm run test` (currently 18 files, 206 tests passing) and confirm the count only goes up.

### Previous story intelligence (Epic 2)

- Story 2.3 established the pattern of a pure `src/lib/*.ts` helper plus a thin UI layer, with tests alongside (`lineup-acks.ts` + `useLineupAcks.tsx` + 7 tests). Follow the same split.
- Epic 2's principle "Action Center = actions only" applies: passive gap information lives on the team page, not the hub.
- Epic 2 notes the consultant model: link out, never execute.

### Git intelligence

Recent commits (`7840f10` K on free-agent screens, `5066a65` ROS rank fix on team pages, `19ad74c` All Players ROS/weekly ranks, `69f39c4` DEF dropped from Yahoo/MyFFPC FAs by value cap) show the active pitfalls this story must respect: value-capped free-agent lists drop K/DEF, and ROS fields must be explicitly selected on team pages. Convention: commit per change, CHANGELOG entry per user-visible feature (add one under `[Unreleased]` when done).

### Project Structure Notes

- Matches the existing `src/lib` (pure engine) / `src/components` (display) / `src/__tests__/lib` split.
- No `project-context.md` exists in the repo; `ARCHITECTURE.md` and `docs/DEFINITION_OF_DONE.md` are the governing documents. Definition of Done: tests updated, `npm run test` + `npx tsc --noEmit`, docs updated (CHANGELOG, README feature list), **local confirmation from Chino before pushing**.

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md]
- [Source: src/lib/waiver-upgrades.ts#findWaiverUpgrades, #poolOf]
- [Source: src/lib/lineup-optimizer.ts#buildSlots, #optimizeLineup]
- [Source: src/lib/team-waiver-upgrades.ts#getTeamWaiverUpgrades]
- [Source: src/lib/weekly-rankings.ts#getWeeklyRanks, #getWeeklyKickerRankings, #rankForPosition]
- [Source: src/lib/portfolio.ts#PortfolioPlayer, #blendedKeepValue, #KEEP_SCALE]
- [Source: src/lib/action-center.ts#deepLinkFor]
- [Source: src/app/api/nfl/started-teams/route.ts]
- [Source: src/components/LineupOptimizerCard.tsx (display pattern)]
- [Source: ARCHITECTURE.md §7 Development Rules]
- [Source: docs/DEFINITION_OF_DONE.md]

## Dev Agent Record

### Agent Model Used

Kiro (bmad-dev-story workflow), model: Auto.

### Debug Log References

- Red phase confirmed for `slot-gaps.test.ts` (module missing) and `started-teams.test.ts` (export missing) before implementing.
- One test fixture bug found and fixed: `optimizeLineup` only reserves a slot for a locked player who is a current starter, so the "locked slot player" test now sets `is_starter: true`. The engine was correct.
- `tsc` emitted a type error in `team-slot-gaps.ts` from a spread-merge of ROS fields; replaced with an explicit merge.
- A stray placeholder file was created once outside the repo by mistake and removed immediately (`/Users/ryancontino/Documents/projects/`). Nothing else touched.

### Implementation Plan

- `slot-gaps.ts` (pure): per-slot "my player" from `optimizeLineup` (locked players for started games); weekly horizon within the same rank pool (`poolOf`), ROS horizon at the same position; status classification via `GAP_THRESHOLDS`; moves attached from `findWaiverUpgrades` output, one slot per add, ROS-only moves never invent a drop.
- `team-slot-gaps.ts` (server): candidates = page FA list + unrostered kickers + up to 150 unrostered weekly-ranked flex/qb players; one query for ROS detail across all ids; one `getWeeklyRanks`; runs `findWaiverUpgrades` with the same options as `getTeamWaiverUpgrades`; then `computeSlotGaps`.
- `RosterGapsCard.tsx`: server component with native `<details>`; actionable and unranked rows open, others collapsed.

### Completion Notes List

- All 14 acceptance criteria implemented. Engine covers QB/RB/WR/TE/K including FLEX and SUPERFLEX; DEF-only slots are skipped (Story 3.2).
- **Deviation from Dev Notes (approved by design intent):** ROS fields are fetched inside `getTeamSlotGaps` (single `player_values` query for roster + candidates) instead of editing the Sleeper and Fleaflicker page selects. This keeps the page changes to three small insertions. `UpgradeSourcePlayer` values already supplied by a page (DB-league pages) take precedence.
- Exported `poolOf` and `toOptimizer` from `waiver-upgrades.ts` and `toPortfolioPlayer` from `team-waiver-upgrades.ts` (keyword-only changes; behavior unchanged, existing 14 waiver-upgrade tests still pass). `getTeamWaiverUpgrades` itself is untouched.
- `getStartedTeams()` / `startedTeamsFromStates()` added to `nfl-live.ts`; `/api/nfl/started-teams` now uses it with identical JSON output. Team pages pass `startedTeams` only to the new gaps helper; existing optimizer/waiver cards are unchanged (as specified).
- Tests: 29 new in `slot-gaps.test.ts` (including `dedupeById`), 3 new in `started-teams.test.ts`. Full suite: 20 files, 238 tests, all passing (was 18 / 206). `npx tsc --noEmit`: no errors outside test files; the 17 pre-existing test-file type errors (`expect`/`it` globals) are unchanged and out of scope.
- **Live verification (read-only against the real DB and APIs, dev server):** the card rendered with correct data on a Yahoo league, the MyFFPC league, three Sleeper leagues and a Fleaflicker league. Observed states: "no action" with rank-vs-best numbers (for example a K ranked #1 vs best available #5), locked slot ("game started") with ROS still shown, "No ranked free agents" in a fully-rostered league, unranked TE flagged, actionable rows with an add + guarded drop and platform link.
- `npx eslint` was not run: it did not finish within 5 minutes earlier in this project (pre-existing), so no lint result is claimed.
- **Tuning note for Chino (noise):** a starter with no ROS or weekly rank (for example a deep TE) is classed `unranked-mine` and counts as "worth a move" whenever any ranked free agent exists, even if that free agent is only marginally better in absolute terms. In live data this produced a "worth a move" for a TE ranked "unranked" vs a free agent at ROS #18. It follows the AC as written. If it feels noisy, the lever is `attachMoves`/`gapSummary` treatment of `unranked-mine`, or requiring the free agent's rank to clear a floor.
- Thresholds are placeholders in `GAP_THRESHOLDS`; adjust after a few real weeks.
- CHANGELOG and README updated per Definition of Done. **Not committed or pushed**; per `docs/DEFINITION_OF_DONE.md` this waits for Chino's local confirmation.

### File List

- src/lib/slot-gaps.ts (new)
- src/lib/team-slot-gaps.ts (new)
- src/components/RosterGapsCard.tsx (new)
- src/__tests__/lib/slot-gaps.test.ts (new)
- src/__tests__/lib/started-teams.test.ts (new)
- src/lib/nfl-live.ts (added `startedTeamsFromStates`, `getStartedTeams`)
- src/app/api/nfl/started-teams/route.ts (uses `getStartedTeams`)
- src/lib/waiver-upgrades.ts (export `poolOf`, `toOptimizer`)
- src/lib/team-waiver-upgrades.ts (export `toPortfolioPlayer`)
- src/app/league/[leagueId]/team/[rosterId]/page.tsx (Sleeper: Roster Gaps wiring)
- src/app/fleaflicker/[leagueId]/team/[teamId]/page.tsx (Fleaflicker: Roster Gaps wiring)
- src/app/db-league/[platform]/[leagueId]/team/[rosterId]/page.tsx (Yahoo/MyFFPC: Roster Gaps wiring)
- CHANGELOG.md
- README.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-11-25: Implemented Story 3.1 (slot gap engine, server helper, Roster Gaps card on all team pages, `getStartedTeams`). Status to review.
- 2026-11-25: Missing ROS rank is now quiet at the slot level (decided with Chino). `unranked-mine` on the ROS horizon no longer makes a slot "worth a move" or attaches a move; a missing weekly rank still does. The ROS horizon keeps its numbers for display. 2 tests added (suite 254 passing). Refines AC 4/5 and the AC 8 attach rule; the noise tuning note in Completion Notes is resolved.
