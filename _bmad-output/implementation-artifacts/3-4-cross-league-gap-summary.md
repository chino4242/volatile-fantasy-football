# Story 3.4: Cross-League Gap Summary (Optional, Lowest Priority)

Status: backlog (parked; re-evaluate after Stories 3.1 to 3.3 ship)

<!-- Note: Not ready-for-dev. This story is intentionally held back. Chino works one league at a time and wants less noise in the app. Build it only if the team-page card (3.1 to 3.3) leaves "which league should I open?" unanswered. -->

## Story

As Chino, when I open the portfolio hub,
I want one quiet line per league saying whether any of my starters has a better free agent available,
so that I know which league to open without scanning each one.

## Context & Intent

This story answers one question: "which league do I open?" It must not add alerts, badges, sub-cards, or color emphasis anywhere, and it must not touch the Action Center. It is tracked now so the idea is not lost, with the analysis below so it can be picked up quickly.

Epic: `_bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md`

## Acceptance Criteria (provisional)

1. In the portfolio hub's per-league dashboard rows (`LeagueInsights` in `src/app/portfolio/page.tsx`, **not** the Action Center), each league shows one muted line: `{n} slots worth a move` or `No better free agents`, linking to that league's team page where the Roster Gaps card lives.
2. The count comes from the same `computeSlotGaps` engine and `GAP_THRESHOLDS` as Story 3.1. There is no second definition of "gap".
3. Where the gap cannot be computed (no weekly upload, no lineup slots, my team not chosen via `useMyTeams`), the league shows nothing.
4. No new badge, color emphasis, or urgent styling. A league with zero gaps looks unchanged.
5. Hidden in off-season mode (`useSeasonMode`).
6. Tests cover the count mapping and the "cannot compute" cases.

## Analysis for whoever picks this up

- **The portfolio data contract differs from team pages.** `/api/portfolio/league` (`src/app/api/portfolio/league/route.ts`) returns a `PortfolioLeague` (`teams`, `freeAgents`, `rosterPositions`, `weeklyWeek`), already format-resolved and already carrying `weeklyRank`, ROS fields, and DEF normalization (`buildSleeper` applies `normalizeSleeperStarterId`). `computeSlotGaps` takes `PortfolioPlayer[]`, so it can run directly on that data client-side or in the route, without the team-page helper (`getTeamSlotGaps`). The portfolio page already has `startedTeams` and DST/K rankings in state.
- **Where to compute.** Prefer computing in the page from the already-loaded league payload (as `optimizePortfolioTeam` and `buildActionCenter` do), not in the API route, so the payload size does not change.
- **Candidate parity.** The portfolio `freeAgents` list is built differently from the team-page list (check how the route caps it). Confirm that K/DEF candidates come from the same sources as 3.1/3.2, or the hub and the team page can disagree on the count, which would break AC 2.
- **Hub already crowded.** Epic 2 built the banded dashboard. Before building, re-read `_bmad-output/ux-portfolio-hub-2026-08-27/EXPERIENCE.md` for where a muted per-league line fits, and get Chino's call on placement.

## Tasks (provisional)

- [ ] Re-evaluate need after 3.1 to 3.3 (decision with Chino).
- [ ] Wire `computeSlotGaps` into the per-league dashboard row using loaded portfolio data.
- [ ] Muted line component and link to the team page (resolve the team-page URL per platform; Sleeper `/league/{id}/team/{rosterId}`, Fleaflicker `/fleaflicker/{id}/team/{teamId}`, db-league `/db-league/{platform}/{id}/team/{numericId}`).
- [ ] Tests.

## References

- [Source: _bmad-output/implementation-artifacts/epic-3-roster-gap-visibility.md]
- [Source: _bmad-output/implementation-artifacts/epic-2-portfolio-hub-redesign.md (Action Center = actions only)]
- [Source: src/app/portfolio/page.tsx#LeagueInsights]
- [Source: src/app/api/portfolio/league/route.ts]
- [Source: src/lib/portfolio.ts#PortfolioLeague]
