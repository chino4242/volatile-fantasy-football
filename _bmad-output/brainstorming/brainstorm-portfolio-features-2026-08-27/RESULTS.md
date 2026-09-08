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



---

## Ranking model (clarified 2026-08-27) — drives ingestion design

Four lenses across three time-scales:
- **Dynasty (Chino's board)** = analyst opinion on long-term value → Track A player_values.rank_1qb/sf_* (EXISTS).
- **FantasyCalc dynasty value** = MARKET sentiment → fc_value_* (EXISTS). Dynasty-rank vs FC = the dual-value gap the engine already uses.
- **Rest-of-Season (RoS)** = how valuable a player is for the REST OF THIS SEASON. Durable-ish, seasonal refresh. → extend Track A with new columns (rank_ros_*). Read by recommendations.
- **QB (weekly)** + **Flex (weekly)** = for a SPECIFIC WEEK, for START/SIT decisions. Disposable, re-uploaded weekly, carries matchup context (opponent, total, pos-matchup). → NEW week-keyed table `weekly_rankings` (sleeper_id, week, kind 'flex'|'qb', rank, opponent, total, pos_matchup). NOT player_values columns (would lose week history + mix durable vs weekly).

Flex sample columns: Rank | FLEX | Team | Opponent | Total | Pos | Matchup(pos-rank-vs-opp).
Decision: weekly rankings power the (Phase-3) lineup optimizer + start/sit; RoS + dynasty feed portfolio/trade recommendations.

## Transactions feed (buy/sell/add + writeups) — clarified
Parser modeled on myffpc-parser (typed result + cleanseName match + collect-unmatched).
Actions: buy / sell (portfolio-wide directives) + add (contextual waiver pickup). Store note (the writeup rationale) + week. New table player_transactions. buy tags already boost the FA sweep via player_tags — reconcile: transactions feed can WRITE player_tags for buy/sell AND keep the full writeup/add records in player_transactions.



---

## Ingestion features — SHIPPED (2026-08-27)

Three admin ingestion features, all build-verified + parsers unit-tested on real samples:

**A. Rest-of-Season ranking** — extends Track A. New player_values columns
rank_ros_overall/pos/tier + rank_ros_updated_at; 'ros' category in
/api/admin/upload-rankings; 'Rest of Season' radio on /admin; ros vintage case.

**B. Weekly QB/Flex rankings** — new week-keyed weekly_rankings table + POST
/api/admin/upload-weekly (CSV; kind flex|qb + week from form). Parses Rank/
Player/Team/Opponent/Total/Pos/Matchup, matches by cleanseName, replaces the
(week,kind) set on each upload. WeeklyRankingsForm on /admin. Foundation for the
Phase-3 lineup optimizer / start-sit.

**C. Transactions feed** — src/lib/transactions-parser.ts (splits Add/Buy/Sell
headers + captures rationale; "the Dallas Cowboys Defense"→DAL DST) + POST
/api/admin/upload-transactions (matches skill via cleanseName, DEF via
DEF_{ABBR}) → new player_transactions table (buy/sell/add + note + week).
buy/sell ALSO upsert player_tags → boost the portfolio FA sweep. TransactionsForm
paste box on /admin.

**Read wiring:** portfolio route now stamps txnAction/txnNote; undervalued-FA
sweep surfaces buy(tag or feed)/add/edge with a reason badge + analyst note,
explicit directives first. So a pasted "Add X" shows up as an ADD recommendation
(with the writeup) on the league where X is available, and "Buy/Sell X" propagate
portfolio-wide via tags.

Tables applied via scripts/create-ingestion-tables.ts (drizzle-kit push has a
pre-existing CHECK introspection bug on this DB). Parsers verified: transactions
7/7, weekly CSV 5/5. Not yet committed.

Note: RoS columns are populated + vintaged but not yet READ by the recommendation
engine — wire rank_ros_* into portfolio/db-league-data when you want RoS to drive
in-season recommendations.



---

## Lineup optimizer (Phase 3) — design locked 2026-08-27

CRITICAL semantics (user-confirmed):
- weekly_rankings.total = NFL TEAM implied total (Vegas), SAME for every player on
  an NFL team (Gibbs & ARSB both 28.25 = DET). NOT a player projection. Do NOT sum
  it across a lineup.
- The RANK is the projection signal. Optimal lineup = fill slots by best (lowest)
  weekly rank per eligible position (flex rank for RB/WR/TE/flex; qb rank for QB/SF).
- total + pos_matchup are TIEBREAKERS only — when ranks are close, prefer higher team
  total / softer positional matchup. total is NOT a per-player score.
- Output = rank-based lineup MISTAKES ("starting flex #45 over bench flex #12"), not a
  point differential. Players absent from the week's upload = unranked → treat as
  bench/last (don't fabricate a projection).

Scope: engine must be PLATFORM-AGNOSTIC. v1 = DB (Yahoo/MyFFPC: have start_positions +
is_starter). v2 (NOT optional — Sleeper/Fleaflicker are the MOST important leagues):
extend via data-plumbing (Sleeper starters[]+roster_positions from API; Fleaflicker
starters+slots). Surfaces: (1) team page — optimal lineup + suggested swaps; (2)
portfolio roll-up — ALERT on sub-optimal lineups to review. Week = latest uploaded.



---

## Lineup optimizer — SHIPPED all 4 platforms (2026-08-27)

Engine (src/lib/lineup-optimizer.ts, platform-agnostic, 10 vitest tests):
rank-driven slot fill (most-restrictive slots first so scarce QB isn't eaten by
superflex); total + posMatchup tiebreakers only; optimizeAndDiff → swaps vs
current starters with rankGain. src/lib/weekly-rankings.ts: latest-week lookup +
optimizeTeam glue. Verified on real MyFFPC team (found 2 real FLEX swaps).

Surfaces:
- Team pages (all 4): LineupOptimizerCard — suggested swaps + optimal lineup +
  'already optimal'/'no weekly data' states. Wired on db-league, /league
  (Sleeper: roster.starters + roster_positions from league API), /fleaflicker
  (is_starter from group==='START' + roster_positions from rosterRequirements).
- Portfolio roll-up: amber alert per my team ('N suggested changes for week W')
  via pure optimizePortfolioTeam() on the weekly ranks attached by the route.

Platform starter/slot sourcing:
- DB (Yahoo/MyFFPC): is_starter + start_positions from tables (verified).
- Sleeper: starters[] + /league/{id}.roster_positions (documented, solid).
- Fleaflicker: is_starter from roster entry group==='START' + rosterRequirements
  → token array. NOTE: FF group field inferred, not live-verified — if swaps look
  wrong or everyone shows benched, inspect the real FetchLeagueRosters JSON.

Verify: next build clean; full unit suite 73/73. Not yet committed.
