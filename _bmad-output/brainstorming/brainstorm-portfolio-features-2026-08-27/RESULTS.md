# Portfolio-Wide Features — Brainstorm Results

**Date:** 2026-08-27 · **Mode:** Creative Partner · **Status:** Complete

## The core insight
The home screen is a bare launcher. The real job isn't *display* — it's **triage**:
"Given everything I know, what's the highest-value action I can take right now,
and take me there." Now that every league (Sleeper, Fleaflicker, Yahoo, MyFFPC)
normalizes to one shape, cross-league reasoning is finally possible.

## The product spine
**Player buy/sell tags** (Chino's input) **× each team's context** (format, current
roster, need, contender/rebuild) → **ranked delta actions** (only fire when the move
actually improves that lineup) → **routed to where it's executed.**

## The moat
Analyzing **other teams at portfolio scale** — trade partners + waiver edge.
This is the work that collapses when you manage many leagues, and Volatile
already ingests every roster in every league.

**The unlock — dual-value lens:** the DB already holds BOTH
- *market/consensus* value (FantasyCalc) = how opponents perceive players, and
- *Chino's board* (custom rankings) = his edge.

The biggest positive gap between them = the best trade bait and the best waiver
edge. Mining that difference is the differentiator.

---

## Build order (Impact × Effort)

### Phase 1 — High impact / Low effort (BUILD NOW)
- **A. Buy/Sell player tags** — input layer the whole guidance system needs.
- **H. Contender/Rebuild auto-label** — cheap heuristic; an *input* many features reuse.
- **G. Weakest-starter per team** — lowest-value current starter = upgrade target; portfolio-sorted.
- **R. Undervalued FA sweep** — per league, free agents where *Chino's board > market* value.
  The moat's logic in its cheapest form (no combinatorial search). **First real win.**

### Phase 2 — Flagship (the moat)
- **M. Surplus/Need matrix** — every team's positional surplus/need; foundational layer.
- **Trade proposer** — MVP = **O** (dual-value scoring, the brain) + **P** (scarcity:
  one best deal per league + one-line "why it works for both"). **Q** (target-driven:
  "get me player X here" → plausible package) is phase 2b.
- **L. Fit Finder** — falls out of M cheaply (complementary-imbalance partners).

### Phase 3 — Home-screen triage + delight
- **C. Action Queue** — the home-screen CTA; ranked cross-league moves, click-to-route.
  Aggregator — comes after Phase 1/2 features produce output to rank.
- **F. Strengths/weaknesses heatmap grid** — table stakes; ship quietly.
- **J. Exposure alarm** / **I. Blindspot finder** — roster-% turned into alerts/contradictions.

### In-season (gated on weekly rankings)
- **T. Lineup optimizer** — advisory: highlight *why* a lineup is sub-optimal + the
  recommendation. Chino may override; the tool must at least flag it. Not autopilot.

### Parked
- D. Waiver-day mode (needs per-league waiver schedules — data-acquisition cost)
- E. Buy/sell radar (subsumed by C + R)
- K. Weekly briefing · N. Motivated-seller (refines M) · S. Drop-bait (refines R)

## Design principles (locked)
1. **Recommendations are deltas, not absolutes** — only surface a move when it beats
   the current roster, scored in the correct format (dynasty / redraft / in-season).
2. **Dual-value everywhere** — separate "Chino's board" from "market perception."
3. **Scarcity over volume** — one great recommendation beats twenty noisy ones.
4. **Advisory, human-in-the-loop** — the tool flags and proposes; Chino decides.


---

## Build notes (Phase 1 kickoff — architecture decisions)

**Data flow: Option A** — Sleeper/FF league membership is CLIENT-SIDE (localStorage via
useAuth: sleeperUserId → live Sleeper API; fleaflickerLeagueIds stored). Yahoo/MyFFPC in
DB (list APIs). `/portfolio` is a client page that enumerates all 4 platforms, then calls a
new normalized route `GET /api/portfolio/league?platform=&leagueId=&format=&type=` per
league (branches: sleeper→getLeagueData, fleaflicker→getFleaflickerLeague,
yahoo|myffpc→getDbLeagueData). Lean PortfolioLeague contract (teams + FAs, each player:
position, myRank, marketRank/value, is_starter) — lighter than full DbLeagueData.

**CRITICAL correctness rule (user-emphasized):** format MUST stay consistent per league
(1QB vs Superflex) and use the matching ranking set. Every value/rank read is format-resolved:
SF → fc_value_sf / fc_rank_sf / rank_sf_*; 1QB → fc_value_1qb / fc_rank_1qb / rank_1qb_*.
Redraft leagues → redraft_rank_*. The per-league format comes from auth state
(sleeperLeagueFormats/fleaflickerLeagueFormats) or leagues.scoring_format (Yahoo/MyFFPC).
Never mix format lenses within a league. Wrong format = wrong advice.

**Dual-value gap (feature R):** compare Chino's board RANK vs market RANK
(fc_rank_*), format-matched. "Undervalued" = Chino ranks player meaningfully higher
(lower rank number) than FantasyCalc does, and the player is a free agent in that league.
(No proprietary *value* number exists — only proprietary ranks; market has both value+rank.)

**"My team" identification:** pick my team per league ONCE and persist the choice
(new lightweight store, e.g. localStorage map leagueId→rosterId, mirroring the auth pattern).
Needed for G (weakest starter) and H (contender/rebuild) which are about MY team.



---

## Phase 1 — SHIPPED (2026-08-27)

Built `/portfolio` (client page, CTA added to home header) + two API routes:
- `GET /api/portfolio/league` — normalizes any of the 4 platforms to the
  format-resolved `PortfolioLeague` contract (src/lib/portfolio.ts). Branches:
  sleeper→getLeagueData, fleaflicker→getFleaflickerLeague (name-bridge),
  yahoo|myffpc→getDbLeagueData. Format resolved ONCE via formatColumns().
- `GET/POST/DELETE /api/portfolio/tags` — the buy/sell board (feature A),
  backed by the new global `player_tags` table.

Features live: **H** contender/rebuild label · **G** weakest starter (skill
positions only) · **R** undervalued-FA sweep (dual-value rank gap, tagged buys
surface first) · **A** buy/sell tag board (TagManager, boosts R).

Decisions during build:
- **K/DEF excluded from all value calculations** (no market value; only noise).
  VALUED_POSITIONS = QB/RB/WR/TE across teamMarketValue, teamCoreAvgAge,
  weakestStarter, freeAgentSweep.
- "My team" picked once per league, persisted in localStorage (useMyTeams).
- Format consistency enforced per league (SF/1QB/redraft → matching rank set).
- player_tags applied via scripts/create-player-tags.ts (drizzle-kit push has a
  pre-existing CHECK-constraint introspection bug on this DB).

Verified: full `next build` clean; tags DB layer + H/G/R computations tested on
real synced MyFFPC data (e.g. undervalued FA Cedric Tillman: your rank 181 vs
market 360 = +179 edge). Not yet committed to git.

**Next up (Phase 2 — the moat):** surplus/need matrix (M) → trade proposer
(dual-value O + scarcity P). See build order above.
