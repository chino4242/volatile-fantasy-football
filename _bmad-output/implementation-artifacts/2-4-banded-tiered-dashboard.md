# Story 2.4: Banded, Tiered Dashboard

Status: ready-for-dev

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

## Tasks / Subtasks

- [ ] **Task 1 — Shared tier mapping** (AC: 2,3)
  - [ ] Reuse the band+label mapping from Story 2.1 (`labelTeam` state → band + format-honest label). Extract to a shared helper if not already, so Action Center (off-season) and dashboard agree.
- [ ] **Task 2 — Banded layout** (AC: 1,6,8)
  - [ ] Refactor the league grid in `src/app/portfolio/page.tsx` (currently a flat `grid` of `LeagueCard`) into three band sections with headers + counts; sort within band needs-action-first then value.
- [ ] **Task 3 — Team card health + flag pill** (AC: 3,4,5,7)
  - [ ] Update `LeagueCard`/`LeagueInsights` to show the tier pill (format label) + format badge, the rich health lines, and a `⚠ N lineup` pill when the team has lineup actions (read from the same engine result to stay consistent).
  - [ ] Preserve the existing my-team picker path (AC #8).
- [ ] **Task 4 — Verify** (AC: all)
  - [ ] `npx next build` clean. Manual: mixed dynasty+redraft portfolio shows correct bands + labels + badges; lineup flag pill matches Action Center; deep-links work.

## Dev Notes

- Tiering: `labelTeam(team, league)` returns `state` + `reason` + `coreAvgAge`; it already branches redraft vs dynasty internally — do NOT re-implement, just map its `state`/`reason` to band + label text.
- Existing card code to refactor: `LeagueCard`, `LeagueInsights`, `UndervaluedList` in `src/app/portfolio/page.tsx` (keep the FA list + weakest-starter blocks; reorganize into bands).
- Lineup flag pill should read from the SAME engine output used by the Action Center (pass it down or lift it) so counts never disagree.
- `STATE_STYLE` map already exists in `page.tsx` for contender/middle/rebuild pills — extend labels for redraft rather than adding a parallel map.

### References
- [Source: src/lib/portfolio.ts#labelTeam, #weakestStarter, #undervaluedFreeAgents]
- [Source: src/app/portfolio/page.tsx — LeagueCard/LeagueInsights/UndervaluedList/STATE_STYLE/dbHref]
- [Source: EXPERIENCE.md §IA tier model; DESIGN.md §Components; mockups/mock-hub-offseason.html]
