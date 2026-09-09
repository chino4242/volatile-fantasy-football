# Story 2.1: Action Center Aggregation Engine + Contract

Status: ready-for-dev

## Story

As Chino, a multi-league fantasy manager,
I want a pure engine that rolls up every actionable recommendation across all my leagues into one prioritized, season-aware structure,
so that the portfolio hub can show me "what needs attention" in a single place instead of forcing me to scan a dozen league cards.

## Context & Intent

This is the foundation story for the hub redesign (Epic 2). It's a **pure aggregation library** — no UI, no new data fetching — that takes the already-loaded `PortfolioLeague` objects (+ my-team selection per league) and produces the Action Center model the UI will render.

The engine is **season-adaptive**:
- **In-season** → group by ACTION TYPE: `lineup` → `trade` → `waiver`.
- **Off-season** → group by TEAM, each team carrying its strengthen-moves.

It emits a **quiet state** when nothing is actionable. It contains ONLY deep-linkable actions; passive health stays in the dashboard (Story 2.4).

[Source of design: EXPERIENCE.md §Information Architecture, §State Patterns; DESIGN.md semantic colors]

## Acceptance Criteria

1. A new pure module `src/lib/action-center.ts` exports a function that, given an array of `{ league: PortfolioLeague, myRosterId: string | null, seasonMode: 'in-season'|'off-season' }` plus the current NFL week, returns an `ActionCenter` structure.
2. **In-season**, the result groups actions by type in order: **Lineup fixes**, **Trades to review**, **Waiver adds** — each item carrying its league name + platform + a deep-link target.
3. **Off-season**, the result groups by team; each team group carries the team's tier + its primary weakness + a list of strengthen-moves (add / trade / sell-window).
4. **Lineup fixes** derive from the existing lineup optimizer (`optimizePortfolioTeam`): each suggested non-optimal swap becomes one action ("Start X over Y"), only when weekly data exists.
5. **Waiver adds** derive from `undervaluedFreeAgents` (buy-tagged / analyst-add / rank-edge ≥ threshold), carrying the edge value.
6. **Trades to review** are populated for Fleaflicker leagues that have pending/incoming offers; each carries a scope marker indicating it's Fleaflicker-sourced. (If pending-trade data isn't wired into `PortfolioLeague` yet, the engine accepts it as an optional input and simply emits nothing when absent — see Dev Notes.)
7. Every action item exposes a `deepLink` (platform URL for that league/team) and a stable `id`.
8. When no leagues produce any action, the engine returns an explicit **quiet** result (`isEmpty: true`) — it does NOT fabricate proactive suggestions into the urgent set.
9. A league whose my-team is unknown contributes no personalized actions (lineup/trade) but may still contribute FA edges if those are team-agnostic; it never throws.
10. The module is covered by unit tests (pure, no network) mirroring `src/__tests__/lib/lineup-optimizer.test.ts` style: in-season grouping+order, off-season by-team grouping, quiet state, my-team-unknown, and FA/lineup derivation.

## Contract (types)

```ts
export type SeasonMode = 'in-season' | 'off-season';
export type ActionKind = 'lineup' | 'trade' | 'waiver' | 'sell';

export interface ActionItem {
  id: string;
  kind: ActionKind;
  headline: string;          // "Start Jaylen Waddle over Romeo Doubs"
  detail?: string;           // "FLEX · +6 proj"
  leagueName: string;
  platform: PortfolioPlatform;
  leagueId: string;
  deepLink: string;          // outbound platform URL (ends the UI label with ↗)
  scope?: 'fleaflicker';     // set on auto trade items to render the (Fleaflicker) chip
  edge?: number | null;      // for waiver items: rank edge
  meta?: Record<string, unknown>;
}

// In-season shape
export interface ActionTypeGroup { kind: ActionKind; label: string; items: ActionItem[]; }

// Off-season shape
export interface TeamActionGroup {
  rosterId: string; teamName: string;
  tier: 'top'|'middle'|'lower'; tierLabel: string;   // format-honest label (Story 2.4 shares this)
  weakness?: string;
  items: ActionItem[];
}

export interface ActionCenter {
  seasonMode: SeasonMode;
  isEmpty: boolean;
  byType?: ActionTypeGroup[];   // present in-season
  byTeam?: TeamActionGroup[];   // present off-season
  counts: { lineup: number; trade: number; waiver: number; sell: number };
}
```

## Tasks / Subtasks

- [ ] **Task 1 — Module + types** (AC: 1,7)
  - [ ] Create `src/lib/action-center.ts` with the types above (import `PortfolioLeague`, `PortfolioPlatform` from `src/lib/portfolio.ts`).
  - [ ] `deepLinkFor(platform, leagueId, rosterId?)` helper mirroring the `dbHref` logic in `src/app/portfolio/page.tsx` (sleeper→`/league/{id}`, fleaflicker→`/fleaflicker/{id}`, yahoo/myffpc→`/db-league/{platform}/{id}`). NOTE: v1 deep-links to the in-app league view; the "leave to real platform" URL can be a follow-up — confirm target in Dev Notes.
- [ ] **Task 2 — Derive lineup actions** (AC: 4)
  - [ ] For each league with a known my-team + weekly data, call `optimizePortfolioTeam(league, team)`; map each swap to an `ActionItem{kind:'lineup', headline:'Start {startPlayer} over {benchPlayer}', detail: slot/rankGain}`.
- [ ] **Task 3 — Derive waiver actions** (AC: 5)
  - [ ] Run `undervaluedFreeAgents(league)`; map each to `ActionItem{kind:'waiver', headline:'{name} ({pos})', edge: rankEdge}`. Respect existing surfacing rules (buy/add/edge).
- [ ] **Task 4 — Trades (optional input)** (AC: 6)
  - [ ] Accept optional per-league pending-trade input; when present (Fleaflicker), emit `ActionItem{kind:'trade', scope:'fleaflicker'}`. When absent, emit nothing. Do NOT block on wiring the live pending-trade fetch — that's the UI/route story.
- [ ] **Task 5 — Grouping + quiet state** (AC: 2,3,8,9)
  - [ ] In-season: assemble `byType` in fixed order lineup→trade→waiver; compute `counts`.
  - [ ] Off-season: assemble `byTeam`; reuse `labelTeam` for tier + tierLabel and `weakestStarter`/position-value for `weakness`; attach add/trade/sell moves.
  - [ ] `isEmpty` = no items in any group.
- [ ] **Task 6 — Tests** (AC: 10)
  - [ ] `src/__tests__/lib/action-center.test.ts` — fixtures of `PortfolioLeague`; assert in-season order+counts, off-season by-team, quiet state, my-team-unknown safety, and that only deep-linkable actions appear (no passive health).

## Dev Notes

### Reuse — do NOT reinvent
- Tiering + reason: `labelTeam(team, league)` → `{state, reason, coreAvgAge}` (`src/lib/portfolio.ts`). Map `state` (`contender|middle|rebuild`) to band `top|middle|lower` and to the format-honest label (dynasty vs redraft) — this mapping is SHARED with Story 2.4, put it in `action-center.ts` or a small shared helper.
- Weakest starter: `weakestStarter(team)` (`src/lib/portfolio.ts`).
- FA edges: `undervaluedFreeAgents(league, minEdge?, limit?)` (`src/lib/portfolio.ts`).
- Lineup swaps: `optimizePortfolioTeam(league, team)` → `{swaps[], isOptimal, hasWeeklyData}` (`src/lib/portfolio.ts`); swaps carry `startPlayer`, `benchPlayer`, `slot`, `rankGain`.
- Deep-link/href pattern: `dbHref` in `src/app/portfolio/page.tsx`.
- My-team memory (UI passes it in): `useMyTeams` (`src/hooks/useMyTeams.tsx`).

### Format-honest tier labels (shared with 2.4)
- Bands: top / middle / lower.
- Dynasty label text: Contender / Middle / Rebuild. Redraft: Contender / In the mix / Falling behind.
- Drive off `labelTeam` state + `league.leagueType === 'redraft'`.

### Trades caveat
- Only Fleaflicker exposes pending/incoming offers today. Keep the engine agnostic: it takes trades as an optional input keyed by league. The route/UI story decides where that data comes from (a Fleaflicker pending-trades fetch). Manual "evaluate a trade" (Story 2.5) is a UI entry point, not an engine item.

### Testing standards
- Vitest, `src/__tests__/lib/`. Pure fn, no network. Mirror `lineup-optimizer.test.ts` / `transaction-suggestions.test.ts`.

### Project structure
- Lib in `src/lib/action-center.ts`; test in `src/__tests__/lib/action-center.test.ts`. No DB or schema change.

### References
- [Source: src/lib/portfolio.ts — labelTeam, weakestStarter, undervaluedFreeAgents, optimizePortfolioTeam]
- [Source: src/app/portfolio/page.tsx — league enumeration + dbHref]
- [Source: EXPERIENCE.md §IA, §State Patterns; DESIGN.md semantic colors]
