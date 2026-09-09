# Story 2.3: Acknowledge ("On purpose") State for Lineup Flags

Status: ready-for-dev

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

- [ ] **Task 1 — Ack store hook** (AC: 3,4,5)
  - [ ] `src/hooks/useLineupAcks.tsx` — localStorage key e.g. `vff_lineup_acks`, value keyed by `week` → set of `ackKey`. `ackKey = ${platform}:${leagueId}:${startId}->${benchId}`. Expose `isAcked(week, ackKey)`, `ack(week, ackKey)`. Prune entries for weeks != current on read.
- [ ] **Task 2 — Filter acked items** (AC: 2,6)
  - [ ] In the Action Center assembly (page or engine-consumer), filter out lineup items whose `ackKey` is acked for the current week before rendering; recompute counts/quiet.
- [ ] **Task 3 — Button + optimistic update** (AC: 1,2)
  - [ ] Add "✓ On purpose" to `ActionRow` for `kind==='lineup'`; on click call `ack(...)` and let the memoized filter drop it.
- [ ] **Task 4 — Verify** (AC: all)
  - [ ] `npx next build` clean. Manual: ack a flag → disappears + count drops; reload same week → stays gone; simulate week change → reappears. Unit-test the hook's week-scoping/pruning if practical.

## Dev Notes

- Current week: `getLatestWeek()` (`src/lib/weekly-rankings.ts`) — same source the optimizer/game-day use. The client can read it from the league payload (`league.weeklyWeek`) to avoid an extra call; confirm it's present.
- Keep the ack purely client-side/local (personal tool; no backend needed). Mirror the storage + custom-event pattern in `useSeasonMode.tsx` if cross-component sync is desired (Action Center is one component, so a simple hook likely suffices).
- `ackKey` must be stable: derive from the engine's lineup `ActionItem.meta` (include startId/benchId there in Story 2.1 if not already — small addition).

### References
- [Source: EXPERIENCE.md §State Patterns, §Interaction Primitives]
- [Source: src/hooks/useSeasonMode.tsx, src/hooks/useMyTeams.tsx (storage pattern)]
- [Source: src/lib/weekly-rankings.ts#getLatestWeek]
