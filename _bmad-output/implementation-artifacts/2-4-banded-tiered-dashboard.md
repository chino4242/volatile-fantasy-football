# Story 2.4: Banded, Tiered Dashboard

Status: review
baseline_commit: 5ea828879957f967711332d0d1d27f9adb211b17

## Story

As Chino, managing a mix of dynasty and redraft leagues,
I want my teams grouped into competitive tiers (Top / Middle / Lower) with format-honest labels and rich health info,
so that I can see the shape of my whole fantasy operation at a glance and dive into any team.

## Context & Intent

Replaces the flat 2-column league grid below the Action Center with three **bands** — 🟢 Top · ⚪ Middle · 🟠 Lower — so mixed dynasty/redraft portfolios read consistently. Each team card keeps its **rich health** (tier pill, value %, core age, weakest starter, undervalued FAs) and deep-links into the league. Label text is format-honest.

[Source: EXPERIENCE.md §IA (tier model), §Component Patterns; DESIGN.md §Components (teamCard, tierPill); mock `mockups/mock-hub-offseason.html`]

## Acceptance Criteria

1. Below the Action Center, teams are grouped into three bands in order: 🟢 **Top tier**, ⚪ **Middle**, 🟠 **Lower tier**, each with a count ("3 teams"). Empty bands are omitted.
2. Band assignment derives from `labelTeam` state: contender→top, middle→middle, rebuild→lower. Redraft teams (no age dimension) use the value-percentile state from `labelTeam`.
3. Each team card shows a **tier pill with format-honest label**: dynasty = Contender / Middle / Rebuild; redraft = Contender / In the mix / Falling behind. Plus a `DYNASTY`/`REDRAFT` badge.
4. Cards retain rich health: value context (e.g. "119% of median" / "core age 26.1"), **Weakest starter** (from `weakestStarter`), and **Undervalued FAs** (top few from `undervaluedFreeAgents`).
5. In-season, a team with an active lineup flag shows a `⚠ N lineup` pill on its card (cross-referencing the Action Center count for that team).
6. Within a band, cards sort **needs-action-first**, then by value.
7. The whole card (or an explicit "Open league →") deep-links to that league view (`dbHref` pattern).
8. Bands are expanded by default on desktop; the my-team picker (for leagues where team is unknown) still appears on the relevant card as today.
9. Visual tokens per DESIGN.md; light primary, dark still acceptable.
10. **De-duplication (build feedback):** the dashboard cards must NOT repeat the Action Center's waiver content. The legacy "Undervalued free agents" list with inline analyst essays is removed from the card; replaced by a **collapsed scouting hint** (top ~3 names + edge, no essays, behind a "show" toggle). Full analyst write-ups appear only on click-through (player detail page).

## Tasks / Subtasks

- [x] **Task 1 — Shared tier mapping** (AC: 2,3)
  - [x] Reuse the band+label mapping from Story 2.1 (`tierFor`) so Action Center (off-season) and dashboard agree.
- [x] **Task 2 — Banded layout** (AC: 1,6,8)
  - [x] Refactored the flat grid into three band sections (`BandSection`) + an "unassigned" section for leagues with unknown my-team; sort within band needs-action-first (lineup count) then value.
- [x] **Task 3 — Team card health + flag pill** (AC: 3,4,5,7)
  - [x] `LeagueInsights` shows the format-honest tier pill (`tierFor`) + `⚠ N lineup` pill (from the same engine count map), rich health lines, and preserves the my-team picker.
- [x] **Task 4 — De-dup scouting (build feedback)** (AC: 10)
  - [x] Replaced the verbose "Undervalued free agents" list (with inline analyst essays) with a collapsed "Scouting" hint (top 3 names + edge, expandable, essays removed; each name links to the player detail page for the write-up).
- [x] **Task 5 — Verify** (AC: all)
  - [x] `npx next build` clean; full suite 116/116.

## Dev Notes

- Tiering: `labelTeam(team, league)` returns `state` + `reason` + `coreAvgAge`; it already branches redraft vs dynasty internally — do NOT re-implement, just map its `state`/`reason` to band + label text.
- Existing card code to refactor: `LeagueCard`, `LeagueInsights`, `UndervaluedList` in `src/app/portfolio/page.tsx` (keep the FA list + weakest-starter blocks; reorganize into bands).
- Lineup flag pill should read from the SAME engine output used by the Action Center (pass it down or lift it) so counts never disagree.
- `STATE_STYLE` map already exists in `page.tsx` for contender/middle/rebuild pills — extend labels for redraft rather than adding a parallel map.

### References
- [Source: src/lib/portfolio.ts#labelTeam, #weakestStarter, #undervaluedFreeAgents]
- [Source: src/app/portfolio/page.tsx — LeagueCard/LeagueInsights/UndervaluedList/STATE_STYLE/dbHref]
- [Source: EXPERIENCE.md §IA tier model; DESIGN.md §Components; mockups/mock-hub-offseason.html]


## Dev Agent Record

### Agent Model Used
Kiro (bmad-dev-story workflow).

### Completion Notes List
- Dashboard refactored in `src/app/portfolio/page.tsx` from a flat 2-col grid into three tier bands (Top 🟢 / Middle ⚪ / Lower 🟠) via `BandSection`, plus a separate "Pick your team" section for leagues whose my-team is unknown (they still show the picker).
- `banded` memo partitions loaded leagues using `labelTeam(myTeam, data).state` → `tierFor(state, leagueType)` (the SHARED helper from Story 2.1) so band + label are format-honest (dynasty Contender/Middle/Rebuild; redraft Contender/In the mix/Falling behind). Within a band: sort needs-action-first (lineup count) then team market value.
- `lineupCountByKey` memo derives per-league lineup-fix counts from the SAME Action Center engine output, so the card's `⚠ N lineup` pill can never disagree with the Action Center.
- `LeagueCard`/`LeagueInsights` now take `lineupCount`; tier pill uses `tierFor` (replaced the old `STATE_STYLE` map); `⚠ N lineup` pill shows when count > 0; rich health (reason, core age, weakest starter) preserved; my-team picker preserved.
- **De-duplication fix (build feedback):** the verbose "Undervalued free agents" list with inline analyst essays is gone. Replaced with a collapsed **Scouting** hint — a one-line "top 3 names +edge", expandable to the full edge list (names + edge only, no essays); each name links to `/portfolio/player/{id}` where the analyst write-up lives. This removes the duplication between the Action Center (actionable add/drop) and the dashboard (pure board-vs-market scouting).

### Verification
- `npx next build` — Compiled successfully.
- Full suite 116/116 (no regressions).

### File List
- src/app/portfolio/page.tsx (banded dashboard, BandSection, tier pill via tierFor, lineup pill, collapsed Scouting list; removed STATE_STYLE + verbose FA list; imports updated)

### Change Log
- 2026-08-27: Implemented Story 2.4 — banded tiered dashboard + de-dup of waiver/scouting content. Status → review.
