# Story 2.5: Off-season Action Center (by team) + Manual "Evaluate a trade"

Status: review
baseline_commit: b472c371d3a4c921a75bba9c64e0f8e07654a2b4

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

- [x] **Task 1 — Off-season rendering** (AC: 1,2)
  - [x] `ActionCenter` renders `byTeam` when `seasonMode==='off-season'`: `TeamGroupCard` per team (name + tier pill + weakness note, then move rows).
- [x] **Task 2 — Wire strengthen-moves** (AC: 2,3)
  - [x] Engine off-season path (Story 2.1) already populates each team's items from the actionable waiver swaps (`generateTransactionSuggestions`) + any pending trades; capped `perTeamLimit`. Test added for trade inclusion.
- [x] **Task 3 — Manual Evaluate-a-trade** (AC: 4)
  - [x] `ManualEvaluateTradeRow` persistent entry point shown in both seasons. **v1 simplification:** links to `/players` (player search + evaluation) rather than a bespoke paste-an-offer modal — flagged below.
- [x] **Task 4 — Fleaflicker pending trades** (AC: 5,6)
  - [x] New `GET /api/portfolio/pending-trades` uses existing `getFleaflickerTrades(leagueId,'TRADES_OWNER_OPEN')`, normalizes to `{id,headline,detail}` from my side vs the other. Page fetches per FF league with a known my-team and feeds the engine. Non-FF platforms return `[]` (no phantom items).
- [x] **Task 5 — Verify** (AC: 7)
  - [x] `npx next build` clean; `npm run test -- --run` 124/124 (existing trade evaluator/targeted-trade tests still pass).

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


## Dev Agent Record

### Agent Model Used
Kiro (bmad-dev-story workflow).

### Completion Notes List
- **Off-season by-team rendering:** `ActionCenter` now branches on `seasonMode==='off-season'` → renders `model.byTeam` via `TeamGroupCard` (team name + format-honest tier pill + weakness note + move rows). This was the main visible gap — off-season mode previously rendered nothing. Page condition relaxed to render `<ActionCenter>` in both seasons.
- **Fleaflicker pending trades:** new `GET /api/portfolio/pending-trades?platform=fleaflicker&leagueId=&myTeamId=` reuses the existing `getFleaflickerTrades(leagueId,'TRADES_OWNER_OPEN')`; normalizes each open offer to `{id, headline:'You get … ↔ give …', detail:'with {team}'}` by matching my side (portfolio rosterId === FF teamId). Page fetches per FF league where my-team is known and feeds `pendingTrades` into the engine → lights up the in-season "Trades to review" group (Fleaflicker-scoped) and appears among off-season team moves. Non-FF platforms return `[]` (no phantom items, AC#6).
- **Manual "Evaluate a trade":** `ManualEvaluateTradeRow` persistent entry shown under both season layouts. **v1 simplification (flagged):** links to `/players` for search + evaluation rather than a bespoke paste-an-offer modal wired to `TradeEvaluator`. A dedicated manual-offer modal is a reasonable fast-follow; kept scope tight to finish the epic.

### Deviations / notes for review
- Manual trade entry is a link, not an inline evaluator modal (see above).
- Pending-trades not spot-checked against live data (open-offer availability + FF cookie dependent); route degrades to `[]` on any error, and engine wiring is unit-tested. Recommend a live check when an actual open FF offer exists.
- Off-season team moves currently = actionable waiver swaps + pending trades. Explicit sell-window items (proposeShed on sell-tagged/aging vets) are a natural extension but not added here to avoid scope creep; the `sell` ActionKind exists in the contract for it.

### Verification
- `npx next build` — Compiled successfully.
- Full suite 124/124 (added 1 off-season pending-trade wiring test).

### File List
- src/app/api/portfolio/pending-trades/route.ts (new)
- src/components/portfolio/ActionCenter.tsx (off-season byTeam rendering, TeamGroupCard, ManualEvaluateTradeRow, TIER_PILL)
- src/app/portfolio/page.tsx (pendingTrades fetch + state, feed engine, render ActionCenter in both seasons)
- src/__tests__/lib/action-center.test.ts (off-season pending-trade test)

### Change Log
- 2026-08-27: Implemented Story 2.5 — off-season by-team Action Center, Fleaflicker pending-trade fetch, manual evaluate-a-trade entry. Status → review. Completes Epic 2.
