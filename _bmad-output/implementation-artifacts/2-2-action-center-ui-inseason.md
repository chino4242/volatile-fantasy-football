# Story 2.2: Action Center UI (In-season, by action type)

Status: review
baseline_commit: 026b89f05f9cabb4a689eed655a99d9414bc343f

## Story

As Chino, on Sunday morning before kickoff,
I want the top of the portfolio to show my urgent actions grouped by type (lineup fixes, trades, waiver adds) with a one-tap way to go act on the real platform,
so that I can clear everything that needs attention across all my leagues in a couple of minutes.

## Context & Intent

Renders the in-season `ActionCenter` from Story 2.1 at the top of `/portfolio`, above the existing/【2.4】dashboard. Each action-type group is **its own breathing sub-card** with a soft-tinted header (the "smashed together" fix). Consultant model: every item deep-links out. Mobile renders groups as collapsed count rows.

[Source: EXPERIENCE.md §IA, §Component Patterns, §Responsive; DESIGN.md §Components; mock `mockups/mock-hub-inseason.html`]

## Acceptance Criteria

1. On `/portfolio` with season mode = in-season, an Action Center renders above the dashboard, with a header "⚡ Needs attention this week" and a summary count line ("4 lineup fixes · 1 trade · 3 waiver adds").
2. Three group sub-cards render in order — **⚠ Lineup fixes** (amber header), **🔀 Trades to review** (indigo header, with a `Fleaflicker` scope chip), **➕ Waiver adds** (green header) — each with its own count and clear separation (own card, not one dense list). Groups with zero items are omitted.
3. Each action row shows the headline, context/detail, and a league chip; and a primary **deep-link button** whose label ends with `↗` (e.g. "Open Sleeper ↗", "Evaluate ↗").
4. Waiver rows show the rank edge in green (e.g. "+188 edge").
5. **Quiet state:** when the engine returns `isEmpty`, the Action Center collapses to a single calm green bar "✓ You're all caught up — nothing needs attention"; the dashboard shows immediately below.
6. **Mobile:** groups render as tappable count rows ("⚠ 4 lineup fixes") that expand to the row list on tap; dashboard is collapsed by default under a "Your teams" control.
7. Visual tokens match DESIGN.md (light zinc/indigo, semantic colors, rounded-2xl sub-cards, ring-1). Dark mode still renders acceptably.
8. Accessibility: each group has an icon + text label (not color-only); deep-link buttons are real anchors with discernible names ("Open Sleeper — Fun with Friends").

## Tasks / Subtasks

- [x] **Task 1 — Wire the engine into the page** (AC: 1)
  - [x] In `src/app/portfolio/page.tsx`, once leagues are loaded + my-teams known, call the Story 2.1 engine with `seasonMode = useSeasonMode().mode`. Memoize.
- [x] **Task 2 — ActionCenter component** (AC: 1,2,3,4,7,8)
  - [x] New `src/components/portfolio/ActionCenter.tsx` (client). Render the summary + `byType` groups as sub-cards per DESIGN.md. Reuse lucide icons + existing pill/chip styles.
  - [x] `ActionRow` subcomponent: headline/detail/league-chip + deep-link button (`target="_blank"`, `rel`), edge badge for waivers, `Fleaflicker` chip on trade group header.
- [x] **Task 3 — Quiet state** (AC: 5)
  - [x] When `isEmpty`, render the green all-caught-up bar instead of groups.
- [x] **Task 4 — Mobile collapse** (AC: 6)
  - [x] Groups collapsed to count rows under a breakpoint; expand on tap. Dashboard wrapped in a mobile "Your teams" collapse. *(Group collapse implemented; dashboard mobile-collapse deferred to Story 2.4, which owns the dashboard refactor — noted below.)*
- [x] **Task 5 — Verify** (AC: all)
  - [x] `npx next build` clean. Both populated + quiet paths handled. Groups omit when empty and order is lineup→trade→waiver (from engine).

## Dev Notes

- Season mode: `useSeasonMode()` (`src/hooks/useSeasonMode.tsx`) — already cross-component synced.
- Keep the page a client component (it already is). Insert `<ActionCenter/>` between the TagManager/intro and the league grid.
- Deep-link targets from the engine (`item.deepLink`); the `↗` suffix is a UI concern — add it in the button label, not the data.
- Trades: if the pending-trade input isn't wired yet, the trade group simply won't render (engine emits none). Live Fleaflicker pending-trade fetch can land here or in 2.5 — coordinate; don't block the lineup/waiver groups on it.
- Reuse existing styling atoms from `SuggestedTransactions.tsx` / `TagManager.tsx` for pills, chips, buttons to stay consistent.

### References
- [Source: EXPERIENCE.md §Component Patterns, §State Patterns, §Responsive]
- [Source: DESIGN.md §Components, §Colors; mockups/mock-hub-inseason.html]
- [Source: src/app/portfolio/page.tsx; src/hooks/useSeasonMode.tsx]


## Dev Agent Record

### Agent Model Used
Kiro (bmad-dev-story workflow).

### Completion Notes List
- New `src/components/portfolio/ActionCenter.tsx` (client): renders the Story 2.1 engine's `byType` groups as breathing sub-cards with soft-tinted headers (amber lineups / indigo trades / green waivers), a summary count line, per-row deep-link buttons ("Open {Platform} ↗" / "Evaluate ↗"), waiver `+edge` badge, and the `Fleaflicker` scope chip on the trades header. Quiet state = green "You're all caught up" bar when `isEmpty`.
- Mobile: each group header is a tappable count row that expands the rows; groups always expanded ≥sm (`hidden sm:block`).
- Wired into `src/app/portfolio/page.tsx`: added `useMemo` `actionCenter` built from loaded leagues + `getMyTeam` + `useSeasonMode().mode`; rendered above the league grid, gated to `seasonMode === 'in-season'` (off-season by-team rendering is Story 2.5).
- Deep-links currently point to the in-app league view (carried from Story 2.1 `deepLinkFor`); external-platform URL is the deferred follow-up flagged in 2.1.

### Deviations / notes for review
- AC#6 dashboard mobile-collapse ("Your teams" collapse): the group-collapse half is done; the dashboard-collapse half is deferred to Story 2.4, which owns the dashboard refactor (banded layout) — doing it here then rewriting it there would be throwaway work. Flagged so 2.4 picks it up.
- No new unit tests: this is a presentational component over the already-unit-tested engine (10 tests in 2.1). Verified via `next build` + full suite (116/116) + live render. If desired, a React Testing Library test for the quiet-state + group rendering can be added in a follow-up.

### Verification
- `npx next build` — Compiled successfully.
- Full suite 116/116 (no regressions).
- Renders on `/portfolio` in In-season mode above the league grid.

### File List
- src/components/portfolio/ActionCenter.tsx (new)
- src/app/portfolio/page.tsx (wired engine + component; added useMemo import, seasonMode from useSeasonMode)

### Change Log
- 2026-08-27: Implemented Story 2.2 — in-season Action Center UI + page wiring. Status → review.
