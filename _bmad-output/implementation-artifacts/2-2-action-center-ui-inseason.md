# Story 2.2: Action Center UI (In-season, by action type)

Status: ready-for-dev

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

- [ ] **Task 1 — Wire the engine into the page** (AC: 1)
  - [ ] In `src/app/portfolio/page.tsx`, once leagues are loaded + my-teams known, call the Story 2.1 engine with `seasonMode = useSeasonMode().mode`. Memoize.
- [ ] **Task 2 — ActionCenter component** (AC: 1,2,3,4,7,8)
  - [ ] New `src/components/portfolio/ActionCenter.tsx` (client). Render the summary + `byType` groups as sub-cards per DESIGN.md. Reuse lucide icons + existing pill/chip styles.
  - [ ] `ActionRow` subcomponent: headline/detail/league-chip + deep-link button (`target="_blank"`, `rel`), edge badge for waivers, `Fleaflicker` chip on trade group header.
- [ ] **Task 3 — Quiet state** (AC: 5)
  - [ ] When `isEmpty`, render the green all-caught-up bar instead of groups.
- [ ] **Task 4 — Mobile collapse** (AC: 6)
  - [ ] Groups collapsed to count rows under a breakpoint; expand on tap. Dashboard wrapped in a mobile "Your teams" collapse.
- [ ] **Task 5 — Verify** (AC: all)
  - [ ] `npx next build` clean. Manual check both a populated and an all-optimal (quiet) portfolio. Confirm groups omit when empty and order is lineup→trade→waiver.

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
