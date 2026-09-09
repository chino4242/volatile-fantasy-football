# Story 2.3: Acknowledge ("On purpose") State for Lineup Flags

Status: review
baseline_commit: e4fb9e12c1a96a992dc13dc58c85179b37b66e6f

## Story

As Chino, who sometimes benches the "better" player on purpose (injury hedge, matchup read),
I want to mark a flagged lineup as intentional so it stops nagging me,
so that the remaining lineup flags in my Action Center are all real mistakes worth fixing.

## Context & Intent

Lineup fixes are the one action type where the system can be "wrong" about my intent. Each lineup row gets a **"✓ On purpose"** control. Tapping it removes that flag from the urgent list **for the current week**; it resets next week when matchups change. Local-only, week-scoped, no persisted audit trail (kept deliberately simple per the design decision).

[Source: EXPERIENCE.md §State Patterns (acknowledged lineup flag), §Interaction Primitives; decision: simplified acknowledge]

## Acceptance Criteria

1. Each lineup-fix row shows a secondary ghost button "✓ On purpose".
2. Tapping it immediately removes that row from the Action Center (optimistic), and decrements the lineup count.
3. The acknowledgment is scoped to the **current NFL week + that specific swap** (league + startPlayer/benchPlayer). A different week does not inherit it.
4. Acknowledgments persist across reloads within the same week (localStorage), mirroring the `useMyTeams`/`useSeasonMode` pattern.
5. When a new week's matchups load, prior acknowledgments no longer suppress flags (they reset).
6. If acknowledging empties the lineup group (and no other actions exist), the quiet state appears.
7. No persisted "show intentional" list / audit UI (explicitly out of scope).

## Tasks / Subtasks

- [x] **Task 1 — Ack store hook** (AC: 3,4,5)
  - [x] Pure helpers in `src/lib/lineup-acks.ts` (localStorage key `vff_lineup_acks`, value `{week: ackKey[]}`, `ackKeyFor`, `readAcks`, `writeAck`, `isAcked`, `pruneToWeek`) + `src/hooks/useLineupAcks.tsx` wrapper (custom-event sync, prunes stale weeks on mount).
- [x] **Task 2 — Filter acked items** (AC: 2,6)
  - [x] `ActionCenter` filters lineup items whose `ackKey` is acked for the current week before rendering; recomputes shown counts + quiet state.
- [x] **Task 3 — Button + optimistic update** (AC: 1,2)
  - [x] "✓ On purpose" ghost button on `kind==='lineup'` rows; calls `ack(...)`; the memoized filter drops it immediately.
- [x] **Task 4 — Verify** (AC: all)
  - [x] `npx next build` clean; full suite 123/123 (7 new lineup-acks tests: key building, week-scoping, no cross-week leak, pruning, null-week no-op).

## Dev Notes

- Current week: `getLatestWeek()` (`src/lib/weekly-rankings.ts`) — same source the optimizer/game-day use. The client can read it from the league payload (`league.weeklyWeek`) to avoid an extra call; confirm it's present.
- Keep the ack purely client-side/local (personal tool; no backend needed). Mirror the storage + custom-event pattern in `useSeasonMode.tsx` if cross-component sync is desired (Action Center is one component, so a simple hook likely suffices).
- `ackKey` must be stable: derive from the engine's lineup `ActionItem.meta` (include startId/benchId there in Story 2.1 if not already — small addition).

### References
- [Source: EXPERIENCE.md §State Patterns, §Interaction Primitives]
- [Source: src/hooks/useSeasonMode.tsx, src/hooks/useMyTeams.tsx (storage pattern)]
- [Source: src/lib/weekly-rankings.ts#getLatestWeek]


## Dev Agent Record

### Agent Model Used
Kiro (bmad-dev-story workflow).

### Completion Notes List
- `src/lib/lineup-acks.ts` (pure): week-scoped ack storage. `ackKeyFor(platform, leagueId, startId, benchId)` matches the lineup ActionItem id suffix. `readAcks/writeAck/isAcked/pruneToWeek`. Storage `{week: ackKey[]}` under `vff_lineup_acks`.
- `src/hooks/useLineupAcks.tsx`: client wrapper — prunes stale weeks on mount, cross-component sync via `vff-lineup-acks-change` custom event (+ storage event), exposes `isAckedKey`, `ack`, `loaded`.
- `ActionCenter` now takes `currentWeek`, filters acked lineup items before render, recomputes shown counts + quiet state (acking the last flag → green "all caught up"). Added "✓ On purpose" ghost button on lineup rows (optimistic — filter drops it immediately).
- Page passes `currentWeek` derived from any loaded league's `weeklyWeek`.
- Week-scoped by design: acks reset next week when matchups change (pruneToWeek keeps only the current week's bucket). No persisted audit trail (out of scope per decision).

### Verification
- New tests: `src/__tests__/lib/lineup-acks.test.ts` — 7 (key building; same-week remembered; no cross-week leak; unknown key; prune drops other weeks; null-week no-op; namespaced key).
- Full suite 123/123 (was 116; +7). `npx next build` clean.

### File List
- src/lib/lineup-acks.ts (new)
- src/hooks/useLineupAcks.tsx (new)
- src/__tests__/lib/lineup-acks.test.ts (new)
- src/components/portfolio/ActionCenter.tsx (currentWeek prop, ack filter, "On purpose" button)
- src/app/portfolio/page.tsx (currentWeek memo + prop)

### Change Log
- 2026-08-27: Implemented Story 2.3 — week-scoped "On purpose" lineup acknowledgment. Status → review.
