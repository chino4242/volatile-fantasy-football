# Epic 2: Portfolio Hub Redesign

Status: ready-for-dev

## Epic Goal

Transform `/portfolio` from a flat grid of per-league cards into a **year-round cross-league management hub** whose focus shifts by season mode: an **Action Center** of clear, deep-linkable recommended actions on top, and a **banded, tiered dashboard** of passive team health below.

## Design Contract

Built against the UX spines (spines win on conflict with any mock):
- `_bmad-output/ux-portfolio-hub-2026-08-27/DESIGN.md` — visual tokens (light zinc/indigo, semantic urgency colors, sub-card group pattern, tier pills)
- `_bmad-output/ux-portfolio-hub-2026-08-27/EXPERIENCE.md` — IA, season-adaptive grouping, acknowledge flow, consultant/deep-link primitive, states, key journeys
- Mocks: `.../mockups/mock-hub-inseason.html`, `.../mockups/mock-hub-offseason.html`

## Load-bearing principles (apply to every story)

- **Consultant, not controller.** The app advises; the user executes on the real platform. Every action = *review → deep-link out* to Sleeper/Fleaflicker/Yahoo/MyFFPC. No "do it" buttons.
- **Season mode sets focus.** Reuse the shipped `useSeasonMode` hook. In-season → Action Center grouped by ACTION TYPE; off-season → grouped by TEAM. Dashboard emphasis shifts too.
- **Action Center = actions only.** Passive observations (tier, core age, weakest starter, strengths/weaknesses) live only in the dashboard below.
- **Light mode is primary.** Extend the existing zinc/indigo system; keep dark mode working.
- **Reorganization over reinvention.** Most inputs already exist: `labelTeam`, `weakestStarter`, `undervaluedFreeAgents`, `optimizePortfolioTeam` (`src/lib/portfolio.ts`), the targeted-trade + suggested-transactions engines, and the per-league fetch route. The net-new work is cross-league AGGREGATION, season-adaptive GROUPING, the BANDED dashboard, and the per-week ACKNOWLEDGE state.

## Stories

1. **2.1 — Action Center aggregation engine + contract** (pure lib + tests). The cross-league roll-up of recommended actions, season-adaptive grouping, quiet state.
2. **2.2 — Action Center UI (in-season, by action type)** — Lineup fixes / Trades / Waiver adds sub-cards, deep-links, quiet state, mobile collapse.
3. **2.3 — Acknowledge ("On purpose") state** — per-week dismissal of lineup flags.
4. **2.4 — Banded, tiered dashboard** — Top/Middle/Lower bands with format-honest labels + rich health.
5. **2.5 — Off-season Action Center (by team) + manual "Evaluate a trade"** — team sub-cards with strengthen-moves; manual trade entry for non-Fleaflicker.

Suggested build order: 2.1 → 2.2 → 2.4 → 2.3 → 2.5. (Engine first, then the two hero surfaces, then the acknowledge refinement, then the off-season/manual-trade layer.)

## Out of scope (v1)

- Countdown/kickoff timers (urgency granularity is "this week").
- Auto trade-pull for non-Fleaflicker platforms (manual entry only).
- Setting lineups / executing moves in-app (consultant model).
- Persisted acknowledge audit trail (week-scoped, local only).
