# Story 3.3: "Roster Move" in the Lineup Optimizer

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As Chino, setting my lineup for the week,
I want the lineup optimizer to show one combined move when a free agent would improve my lineup ("pick up this free agent, then start these players"),
so that I don't have to cross-reference the optimizer and the free-agent list myself.

## Context & Intent

The optimizer card only reshuffles players already on the roster. A free agent can unlock a better lineup than any reshuffle does, for example a better kicker, or a flex-eligible RB who forces a current starter to the bench. This story adds a single **Roster move** section to `LineupOptimizerCard`. It shows the full sequence: the add, the drop, and the resulting start/bench changes versus the current lineup.

Shows **at most one** move. A ranked list would add the noise this epic is meant to remove.

**Depends on Stories 3.1 and 3.2** (`getTeamSlotGaps`, `SlotGap`/`SlotMove`, `GAP_THRESHOLDS`, `getStartedTeams`, DEF support).

Epic: `_bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md`

> **Update 2026-11-25:** the lock-awareness part of AC 6 (`optimizeTeam` takes `startedTeams`, `RosterPlayerLite.team`, `isGameStarted`, three pages pass them, `🔒 locked` marker in the card) was delivered early as a bug fix, outside this story. Do not redo it. This story still owns the roster-move logic and the move-suppression rules in AC 6.

## Acceptance Criteria

1. **Pure builder.** `src/lib/roster-move.ts` exports `buildRosterMove({ roster, slots, gaps, upgrades, startedTeams }): RosterMove | null` with no I/O.
2. **Candidate moves** come from two sources, then the single best is chosen:
   - Weekly upgrades from `findWaiverUpgrades` (QB/RB/WR/TE/K), restricted to actionable ones (`!informational`) where `cracksLineup` is true.
   - One-for-one DEF streams from 3.2's DEF slot gap (the free agent defense replaces my defense).
   "Best" = largest weekly gap in rank spots **relative to that pool's `GAP_THRESHOLDS.weekly` value**, with ties broken by drop tier (`safe` before `caution`), then by `weeklyRankGain`. Discard any candidate whose gap is not above its threshold.
3. **Re-optimized result.** The move's `startChanges` and `benchChanges` are computed by running `optimizeAndDiff` on the roster **with the add included and the drop removed**, then diffing against the **current** lineup (`is_starter`). The displayed lineup is exactly what the user ends up with.
4. **Drop rules.** Reuse the existing guardrails: only `safe` or `caution` drops (as already selected by `findWaiverUpgrades`). An open roster spot yields a pure add (`drop: null`). If the only possible drops are `block`-tier, no move is produced.
5. **Threshold suppression.** No move is produced when the best candidate's gap is not above its pool threshold (so the optimizer card stays free of tiny "upgrades").
6. **Game-time awareness.** The optimizer on team pages today does not know which games have started (`optimizeTeam` never sets `locked`). For this story:
   - `optimizeTeam` gains an optional `startedTeams?: Set<string>` parameter and `RosterPlayerLite` gains an optional `team: string | null`. When provided, started players are marked `locked`, exactly as `optimizePortfolioTeam` already does (`src/lib/portfolio.ts#optimizePortfolioTeam`). When omitted, behavior is unchanged.
   - The three team pages pass `startedTeams` (from `getStartedTeams()`, added in 3.1) and each roster player's `team`.
   - This intentionally changes the optimizer card's swaps once games begin (a played starter is no longer suggested for the bench). Add a regression test and a CHANGELOG line, since it is a user-visible behavior change.
   - No move is produced when the add's NFL team has started or the drop's player is locked.
7. **Weekly data required.** No move when the week has no weekly rankings for the add's pool (honest absence, no message).
8. **Combined, not contradictory.** In `LineupOptimizerCard`, the move appears as one section below the existing swap list:
   `Add K. Aubrey (K #3), drop M. Gay (K #19), then start K. Aubrey`
   followed by the changed starters (`Start X`, `Bench Y`) from AC 3. If a roster move changes or removes one of the existing swaps, show only the combined version: remove the superseded swaps from the swap list when a move is present. A swap that the move does not touch stays.
9. **Presentation details.** Show the drop tier with the same caution styling as `WaiverUpgradesCard` (⚠ for `caution`), and a deep link to the platform via `deepLinkFor`. Nothing renders when there is no move: no empty state, no "no moves" text.
10. **Acknowledgments.** Lineup acks are local (`src/lib/lineup-acks.ts`, key `vff_lineup_acks`, week-scoped). If Chino marked any swap that the move depends on as "On purpose" for the current week, the move is hidden for that week. Because acks live in localStorage, apply this in a small client component (see Dev Notes). The `ackKeyFor(platform, leagueId, startId, benchId)` format must be used so keys agree with the Action Center's.
11. **Tests** in `src/__tests__/lib/roster-move.test.ts` plus additions to `lineup-optimizer.test.ts` for the new `optimizeTeam` lock behavior (via the pure `optimizeAndDiff` with `locked` players, since `optimizeTeam` itself hits the DB):
    - Selects the single best candidate across K and skill positions; DEF stream as a one-for-one move.
    - Re-optimized diff correct with FLEX and SUPERFLEX (the add displaces a starter and the displaced starter moves to FLEX).
    - Pure add on an open spot; `block`-only yields no move; `caution` drop shows tier.
    - Threshold suppression; started add suppressed; locked drop suppressed.
    - Superseded swaps are removed, untouched swaps remain.
    - Ack suppression helper (the pure decision function, given an acks map).
    - Regression: with no `startedTeams`, optimizer results are identical to before.

## Tasks / Subtasks

- [ ] **Task 1: Lock-aware optimizer glue** (AC: 6, 11)
  - [ ] `optimizeTeam(roster, rosterPositions, week?, opts?: { startedTeams?: Set<string> })`; add `team` to `RosterPlayerLite`; set `locked` in the mapped `OptimizerPlayer`s.
  - [ ] Update the three pages' `optimizerRoster` mapping to include `team`.
- [ ] **Task 2: Builder** (AC: 1–5, 7, 11)
  - [ ] `src/lib/roster-move.ts`: candidate collection, selection, re-optimization diff.
- [ ] **Task 3: Pages compute the move** (AC: 2, 6, 9)
  - [ ] Reuse the `upgrades` and `gaps` that `getTeamSlotGaps` already computes (3.1/3.2). Do not call `findWaiverUpgrades` a second time. Extend `getTeamSlotGaps` to also return `{ gaps, upgrades }` (or expose `upgrades` on its result).
  - [ ] Pass `rosterMove` and `startedTeams` into `LineupOptimizerCard`.
- [ ] **Task 4: Card section** (AC: 8, 9)
  - [ ] Extend `LineupOptimizerCard` with an optional `rosterMove` prop; filter superseded swaps. The card must remain a presentational component.
- [ ] **Task 5: Ack suppression** (AC: 10)
  - [ ] `src/components/RosterMoveSection.tsx` (client) using `useLineupAcks`, wrapping the roster-move block. The optimizer card stays a server component and renders this client child.
- [ ] **Task 6: Verify** (AC: all)
  - [ ] `npm run test`, `npx tsc --noEmit`; manual check on a league with a known kicker or flex upgrade; confirm that with no upgrade the card looks exactly as before.
  - [ ] CHANGELOG entry covering both the new section and the lock-aware optimizer behavior.

## Dev Notes

### Current state of the files being modified

- **`src/components/LineupOptimizerCard.tsx`** (server component; props `{ opt: TeamOptimization }`): renders "optimal" green line or a swap list (`slot`, `Start X`, `bench Y`, ranks), then the optimal lineup grid, then the bench with "close call" highlighting (`CLOSE_CALL_THRESHOLD = 5`). Early returns for "no weekly rankings" and "no starting slots". **Preserve all of these.** Add the roster-move section between the swap list and the optimal lineup; keep the rest intact.
- **`src/lib/weekly-rankings.ts#optimizeTeam`**: maps the roster through `rankForPosition`, builds `OptimizerPlayer` (no `locked`), calls `optimizeAndDiff`, returns `TeamOptimization { ...result, week, hasWeeklyData }`. It is called by the Sleeper, Fleaflicker, and db-league team pages.
- **`src/lib/lineup-optimizer.ts#optimizeLineup`** already supports `locked`: locked starters reserve their slot and locked bench players are excluded from the movable pool. `optimizeAndDiff` never suggests starting or benching a locked player. This story only needs to **feed** `locked`.
- **`src/lib/portfolio.ts#optimizePortfolioTeam`** (line ~390) is the existing lock-aware precedent: `locked: !!(startedTeams && p.team && startedTeams.has(p.team.toUpperCase()))`.
- **`findWaiverUpgrades`** already returns `cracksLineup` (does the free agent crack the optimal lineup when re-optimized with him added). It does not return the full post-move lineup diff, which is why AC 3 re-runs `optimizeAndDiff` itself.
- **Defenses in the optimizer.** `optimizeTeam` already routes DEF through `rankForPosition` → `dst`, but only if my defense is present in the roster passed in. On the Sleeper page that depends on the 3.2 normalization fix.
- Existing Epic 2 lineup items in the Action Center come from `optimizePortfolioTeam` (`src/lib/action-center.ts#lineupItems`) and are **not** changed here. The Action Center keeps showing swaps only. A combined roster move there would be a new alert type, which the epic's noise budget forbids.

### Re-optimization recipe (AC 3)

```ts
const roster2 = [...rosterWithoutDrop, addAsOptimizerPlayer];   // add: isStarter = false
const after = optimizeAndDiff(roster2, slots);                  // its swaps are diffed vs is_starter
```
`after.swaps` are measured against the current `is_starter` flags, with the dropped player removed, so a dropped current starter shows up as a slot that needs filling. If the dropped player was a current starter, the add or another bench player takes that slot. Present `after.swaps` as the start/bench changes. Test the dropped-starter case explicitly.

### Ack suppression (AC 10)

`ackKeyFor(platform, leagueId, startId, benchId)` builds keys; `useLineupAcks(currentWeek)` exposes `isAckedKey`. Team pages know the platform (`'sleeper' | 'fleaflicker' | 'yahoo' | 'myffpc'`), the league id, and the current week (`lineupOpt.week`). Build the list of dependent ack keys from the move's `startChanges`/`benchChanges` and hide the section if any is acked. Keep the decision as a pure function `isMoveAcked(move, acks, week, platform, leagueId)` in `roster-move.ts` so it can be tested without the DOM.

### Architecture compliance

- Reuse existing engines; no new recommendation math (Epic 2 principle "Reorganization over reinvention"). The only new logic is composition and the post-move diff.
- Read-only. Consultant model: link out, never execute.

### Technical requirements

- Keep `roster-move.ts` free of `@/db` imports.
- `RosterMove` shape (suggested): `{ add, drop | null, tier, pool, weeklyRankGain, startChanges: LineupSwap[], benchChanges: OptimizerPlayer[], deepLink? }`. Keep the deep link outside the pure builder (pages attach it).
- Changes to `optimizeTeam` signature must be backward compatible (all new params optional) because three pages call it.

### Library / framework requirements

- No new dependencies. No web research needed.

### File structure requirements

| Action | Path |
|---|---|
| New | `src/lib/roster-move.ts` |
| New | `src/components/RosterMoveSection.tsx` (client) |
| New | `src/__tests__/lib/roster-move.test.ts` |
| Edit | `src/lib/weekly-rankings.ts` (`optimizeTeam`, `RosterPlayerLite`) |
| Edit | `src/lib/team-slot-gaps.ts` (also return upgrades) |
| Edit | `src/components/LineupOptimizerCard.tsx` |
| Edit | the three team `page.tsx` files (pass `team`, `startedTeams`, `rosterMove`) |
| Edit | `src/__tests__/lib/lineup-optimizer.test.ts` |

### Testing requirements

- Pure builder and acks decision function tested without DB or DOM.
- The `locked` behavior of `optimizeLineup`/`optimizeAndDiff` should already be covered in `lineup-optimizer.test.ts`; add only what is missing for the new glue (a test that `team` + `startedTeams` mark players locked can use an extracted pure mapper, so extract the mapping from `optimizeTeam` into an exported pure function such as `toOptimizerPlayers(roster, byId, startedTeams)`).

### Previous story intelligence (3.1, 3.2)

- 3.1 introduces `getTeamSlotGaps`, `computeSlotGaps`, `getStartedTeams`, and the team-page wiring. 3.2 adds DEF and identity fixes. Build on those; do not recompute upgrades.
- Epic 2 Story 2.3 (`lineup-acks.ts`, `useLineupAcks.tsx`) is the precedent for client-side ack filtering around a server-rendered list.

### Git intelligence

- `d692457` ("Expand Lineup Optimizer with bench + close calls") last changed `LineupOptimizerCard`; keep its bench and close-call UI untouched.
- `5066a65` shows the team pages being edited recently for ROS ranks; expect merge-sensitive edits in the three page files (small, localized changes).

### Project Structure Notes

- Same conventions as 3.1. Definition of Done applies.
- The optimizer behavior change (lock-awareness on team pages) is the only change that alters existing output. Call it out in the CHANGELOG and in the PR/commit message.

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md]
- [Source: _bmad-output/implementation-artifacts/3-1-slot-gap-engine-and-team-gap-view.md]
- [Source: _bmad-output/implementation-artifacts/3-2-kicker-and-defense-gap-clarity.md]
- [Source: _bmad-output/implementation-artifacts/2-3-acknowledge-on-purpose-state.md]
- [Source: src/lib/lineup-optimizer.ts#optimizeLineup, #optimizeAndDiff]
- [Source: src/lib/weekly-rankings.ts#optimizeTeam]
- [Source: src/lib/portfolio.ts#optimizePortfolioTeam]
- [Source: src/lib/waiver-upgrades.ts#findWaiverUpgrades]
- [Source: src/lib/lineup-acks.ts, src/hooks/useLineupAcks.tsx]
- [Source: src/components/LineupOptimizerCard.tsx, src/components/WaiverUpgradesCard.tsx]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
