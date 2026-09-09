# Story 2.5: Off-season Action Center (by team) + Manual "Evaluate a trade"

Status: ready-for-dev

## Story

As Chino, sitting at my computer in the off-season,
I want the Action Center grouped by team with concrete strengthen-moves, plus a way to evaluate a trade offer from any platform,
so that I can work team-by-team to improve each roster and still assess offers that come in outside Fleaflicker.

## Context & Intent

The off-season face of the Action Center: when season mode = off-season, group by TEAM (each team = tier + weakness + strengthen-moves: add / trade / sell-window). Also add a persistent **"Evaluate a trade"** entry point so a texted Sleeper/Yahoo/MyFFPC offer can be assessed manually (auto pending-trades remain Fleaflicker-only). If a live Fleaflicker pending-trade fetch isn't yet wired, add it here so the in-season Trades group (Story 2.2) lights up.

[Source: EXPERIENCE.md §IA (off-season by team), §Component Patterns (manual evaluate-a-trade); mock `mockups/mock-hub-offseason.html`]

## Acceptance Criteria

1. With season mode = off-season, the Action Center renders `byTeam` groups: each a sub-card headed by team name + tier pill + format badge + weakness note.
2. Each team group lists strengthen-moves: ➕ add (green, with edge, deep-link), ⇄ trade (indigo, "see trades" → targeted-trade generator), ↘ sell-window (red, for sell-tagged/aging vets).
3. Trade/sell moves reuse the existing targeted-trade generator (`proposeAcquire`/`proposeShed`) and buy/sell tags — no new trade math.
4. A persistent **"Evaluate a trade"** control (in the trades group in-season; and available off-season) opens the existing trade evaluator, letting me select a league + paste/pick players for platforms without auto pending-trades.
5. **Fleaflicker pending/incoming trades** are fetched and surfaced as auto trade items with the `(Fleaflicker)` scope chip (feeds the in-season Trades group from Story 2.2). If the fetch fails or none exist, nothing breaks.
6. Non-Fleaflicker leagues never show phantom auto trade alerts; the manual entry point is the path for them (honest scoping).
7. `npx next build` clean; existing trade evaluator/targeted-trade tests still pass.

## Tasks / Subtasks

- [ ] **Task 1 — Off-season rendering** (AC: 1,2)
  - [ ] Extend `ActionCenter.tsx` (Story 2.2) to render `byTeam` when `seasonMode==='off-season'`: team sub-cards with tier pill (shared label helper) + weakness + move rows.
- [ ] **Task 2 — Wire strengthen-moves** (AC: 2,3)
  - [ ] In the engine (Story 2.1) off-season path, populate each team's items: waiver adds (`undervaluedFreeAgents`), acquire/sell suggestions (`proposeAcquire`/`proposeShed` on buy/sell-tagged or weakness-driven targets). Keep it to a sensible top-N per team.
- [ ] **Task 3 — Manual Evaluate-a-trade** (AC: 4)
  - [ ] Add an entry point (button/row) that opens the existing trade evaluator component/flow with a league selector. Reuse `TradeEvaluator` (`src/components/TradeEvaluator.tsx`) or the player-situation trade path — do not build new trade UI.
- [ ] **Task 4 — Fleaflicker pending trades** (AC: 5,6)
  - [ ] Add a fetch for Fleaflicker pending/incoming offers (see `src/lib/fleaflicker.ts` `FleaflickerTrade` types already present) and pass them into the engine as the optional trade input. Map to `ActionItem{kind:'trade', scope:'fleaflicker', deepLink}`.
  - [ ] Ensure other platforms contribute no auto trade items.
- [ ] **Task 5 — Verify** (AC: 7)
  - [ ] `npx next build` clean; `npm run test -- --run` green. Manual: off-season shows by-team moves; toggle to in-season shows the Fleaflicker trade item + manual entry; a Sleeper offer can be evaluated manually.

## Dev Notes

- Targeted trades: `proposeAcquire` / `proposeShed` (`src/lib/targeted-trade.ts`) — already reused by the player-situation route; feed them `TradePlayer`s from the `PortfolioLeague`.
- Buy/sell tags: existing tag system (TagManager / `/api/portfolio/tags`).
- Fleaflicker trades: `FleaflickerTrade` / `FleaflickerTradeTeam` types already in `src/lib/fleaflicker.ts` — check for an existing pending-trades fetch before adding one; `PendingTrades.tsx` component may already exist (seen imported on the FF team page) — reuse it for the manual/auto rendering if suitable.
- Manual evaluator: `TradeEvaluator.tsx` is used on team pages across platforms — the least-risk reuse for the manual path.
- Keep the engine the single source of trade items so in-season (Story 2.2) and off-season render consistently.

### References
- [Source: src/lib/targeted-trade.ts#proposeAcquire/#proposeShed]
- [Source: src/lib/fleaflicker.ts (FleaflickerTrade types); src/components/PendingTrades.tsx, TradeEvaluator.tsx]
- [Source: EXPERIENCE.md §IA off-season, §Component Patterns; mockups/mock-hub-offseason.html]
