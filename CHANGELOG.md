# Changelog

All notable changes to the Volatile Fantasy Football platform.

## [Unreleased]

### Added - Defense (DST) Free-Agent Tab (2026-10-06)

- **Every free-agent view now has a DEF tab** listing available team defenses,
  defaulting to this week's DST rank (best first) since defenses carry no dynasty
  value. Switching tabs away from DEF restores the dynasty-value sort; a manual
  column sort still overrides until you change tabs.
- Defenses tagged add/buy on the analyst Buy/Sell board get the same green star
  as skill players.
- Rostered defenses are correctly excluded per platform: Sleeper normalizes its
  bare team-abbr ids (SEA → DEF_SEA); Fleaflicker resolves rostered defense team
  names → DEF_{ABBR} via `resolveDefenseId`; Yahoo/MyFFPC already store DEF_{ABBR}.
  Defenses are fetched separately from the value-capped top-200 so they're never
  dropped for lacking an FC value.
- Covers the shared `FreeAgentTable` (Sleeper, Fleaflicker, Yahoo/MyFFPC via
  db-league) plus the standalone MyFFPC free-agents table (added a Wk Rank column
  + DEF tab there too).
- Verified against a real Sleeper league (week 5): 14 rostered defenses excluded,
  18 available with weekly ranks, zero leaks.

### Changed - Kicker Rankings via CSV Upload (retire scrape) (2026-10-04)

- **Weekly kicker rankings are now uploaded as a CSV** (Admin → Weekly Rankings →
  K), matching the DST model — replacing the Subvertadown HTML scrape. Removes
  the scrape fragility (silent breakage on markup/ToS changes) and gives a single
  source of truth.
- CSV columns: `Rank, Kicker, Team, Tier, Opponent`. The Kicker column is a LAST
  NAME only (e.g. "Aubrey"); rows resolve to a seeded kicker by
  `(cleansed last-name, normalized team abbr)` via the new shared `kickerMatchKey`
  helper. Team abbrs are normalized (JAC→JAX, LA→LAR, etc.) so the CSV's
  convention matches our DB. Verified 32/32 on a real sample.
- `upload-weekly` POST now accepts `kind='k'` and stores rows in `weekly_rankings`
  (kind='k') — the same table/shape flex/qb/dst use, so the lineup optimizer and
  kicker-streaming engine read them unchanged.
- `getWeeklyKickerRankings` moved to `src/lib/weekly-rankings.ts` (DB reader,
  mirrors `getWeeklyDstRankings`); `src/lib/kicker-rankings.ts` (scraper, cheerio)
  deleted. `team-waiver-upgrades` repointed to the DB reader.
- New helpers `kickerMatchKey` + `fixTeamAbbr` in `nameUtils` (unit-tested).

### Fixed - Defense Streaming Availability & Game-Time Gating (2026-09-27)

- **Rostered Sleeper defenses are now detected as unavailable.** Sleeper returns
  team defenses as a bare NFL abbr (e.g. `"SEA"`), but the players table keys them
  as `DEF_SEA`. The portfolio league builder wasn't normalizing these, so every
  rostered defense was dropped from team rosters — making the streaming engine
  think all 32 defenses were free agents (it would recommend a top-ranked defense
  already on someone's roster). `buildSleeper` now applies
  `normalizeSleeperStarterId` to roster ids, players, and starters.
  (`src/app/api/portfolio/league/route.ts`)
- **Defenses/kickers whose NFL game already kicked off are no longer suggested.**
  `streamItems`/`streamKickerItems` now consume `startedTeams` (already fetched by
  the portfolio): an available defense/kicker whose game has started is excluded
  from the pool and from the alternatives, and the suggestion is suppressed
  entirely when YOUR current DEF/K has already played (swapping a locked-in score
  is a no-op). Matches the existing weekly waiver-upgrade gating.
  (`src/lib/action-center.ts`)

### Changed - Defense Streaming Promoted to Action Center (2026-09-27)

- **DEF streaming is now a top-level "Stream a defense" action** in the Portfolio
  Action Center (⚡ Needs attention this week), instead of being buried inside
  each league card. It's week-scoped and time-sensitive, so it sits alongside
  lineup fixes and trades.
- **No longer redraft-only.** Streaming suggestions now fire for any league that
  *starts a defense* (has a DST/DEF lineup slot) — dynasty and keeper included —
  matching the kicker-streaming gate. Leagues without a DEF slot are skipped.
- **Surfaces the top 3 available streamers.** The headline names the single best
  available defense (with opponent · tier · spread); a muted sub-line lists the
  next-best options ("Also available: …"), and `meta.alternatives` carries the
  full top-3 for the UI.
- Upgrade threshold unchanged: recommend only when you have no DEF, your DEF is
  unranked this week, or an available one is ≥3 rank spots better.
- `src/lib/action-center.ts`: `streamItems` reworked (slot gate + alternatives);
  `stream` added to `URGENT_KINDS`; removed from `buildLeagueActions` to avoid a
  double-render. `src/components/portfolio/ActionCenter.tsx`: renders
  `meta.subDetail`. Tests updated in `src/__tests__/lib/action-center.test.ts`.

### Added - Live Draft, AI Analysis, Visual Draft Board (2026-04-19)

#### Live Draft Mode
- Separate `/live-draft` pages for both Sleeper and Fleaflicker
- Manual pick entry for all teams, no CPU auto-pick
- Projected top 3 picks shown for every team (clickable to record)
- Suggest Trade: propose packages from your assets to acquire the current pick
- Unrestricted trades (no value check) for recording agreed-upon deals
- Green "Live Draft" button on league dashboard pages

#### AI Scouting Analysis
- `analyze-writeups.ts`: Claude analyzes RP writeups → confidence (1-10), summary, bull/bear case, NFL comps
- `analyze-prospects.ts`: Claude analyzes Late Round prospect data with ZAP context
- AI fields stored in both `prospect_writeups` and `prospect_data` tables
- Displayed in player detail modal, writeup tabs, and keeper selection cards
- AI confidence feeds into `scorePlayer` (±8% modifier)

#### Player Detail Modal
- Click "View" on any available player to see full scouting data before drafting
- Shows FC/VFF rankings, 30-day trend, ZAP data, AI analysis, all writeup sources
- "Draft Player" button inside modal replaces instant-draft behavior
- Recommendation cards (top 3) now open detail modal instead of drafting

#### Visual Draft Board
- Grid layout: columns = draft slots, rows = rounds
- Position color coding (QB red, RB blue, WR green, TE orange)
- Traded pick indicators, current pick ring highlight
- Your team's picks highlighted in indigo

#### Draft Enhancements
- Undo last pick button (restores player to pool)
- On-deck indicator: "Your next pick: 2.05 (7 picks away)"
- Last pick result shown in on-the-clock banner
- Draft history saved to database (cross-device via user login)
- Collapsible "Past Drafts" section with expandable pick details

#### Keeper Selection Enrichment
- Cards now show: FC rank, position rank, 30-day trend, VFF rank, years exp
- ZAP category and score for rookies/prospects
- AI summary from writeup analysis

#### ZAP Category Scoring
- ZAP categories influence draft recommendations (+15% Legendary to -10% Dart Throw)
- Only applies to non-stale data (current rookies and valid Year 2 players)

#### Writeups on All Pages
- Free agent tables: expandable writeup rows with tabs
- Team roster: writeups in PlayerStatsModal
- ZAP score shown in Late Round tab across all views

#### Stats Ingestion
- `ingest-sleeper-stats.py`: Ingests weekly stats from Sleeper API (2020-2025)
- 2025 season: 4,846 rows across all 18 weeks
- Backfilled 2020-2024 for players missing from nfl_data_py
- PlayerStatsModal defaults to 2025, includes it in season selector

#### Data Fetching Refactor
- Shared `getFleaflickerDraftData()` and `getSleeperDraftData()` in `src/lib/draft-data.ts`
- All 4 draft pages reduced to ~10 lines each

#### Branding
- VFF logo in header, home page, favicon, PWA icons, apple touch icon

### Added - Mock Draft Enhancements & Prospect Writeups (2026-04-03)

#### Prospect Writeups (Multi-Source)
- New `prospect_writeups` table with source tagging and upsert support
- Ingestion script: `npx tsx scripts/ingest-writeups.ts <dir> <year> <source>`
- File naming: `firstname_lastname_source.txt`
- Tabbed display in mock draft expandable rows (Late Round + other sources)
- Player matching by normalized name against `players` table

#### Mock Draft — Sleeper Cross-Season Draft Resolution
- `getCurrentSeasonDraft()` follows Sleeper's league chain to find the current season's draft
- Fetches draft directly via `/draft/{id}` for full `slot_to_roster_id` data
- Falls back to manual setup only when no API draft exists
- Traded picks fetched from current season's league for accurate ownership

#### Mock Draft — In-Draft Trading
- Search for any rostered player across the league
- Side-by-side trade builder: your assets (pick + players + future picks) vs their assets (player + roster + picks)
- Live value comparison bar with ±% and fair/unfair indicator
- Pick values based on best-available-player projections, not static startup values
- 10% fair-value auto-acceptance threshold
- Position filters on both trade target browse and deal builder views
- CPU auto-drafts with acquired pick after trade execution

#### Mock Draft — UI Enhancements
- **Watch List**: Star/pin players, persisted to localStorage per league, filterable
- **Search**: Real-time name filter on available players
- **Recent Picks Log**: Scrollable strip showing last 12 picks
- **Draft Grades**: League-wide post-draft grades with starter impact weighting (3x)
- **Pre/Post Snapshots**: Per-position value comparison (QB/RB/WR/TE) for every team
- **STARTER/BENCH Classification**: Progressive roster simulation — each pick updates the lineup threshold before evaluating the next
- **CPU Pick Fix**: Moved auto-simulate from render body to `useEffect` with ref guard, eliminating the "roulette wheel" flicker

#### Scoring Format Persistence
- `setLeagueFormat` now saves to database via `/api/league-settings`
- All 8 league-scoped server pages fall back to DB when no URL param present
- Resolution order: URL param → DB → default (SF)

#### Keeper Settings Hardening
- All pages fall back to DB for `keeper_count` (not just URL params)
- `league_type === 'keeper'` check prevents keeper UI leaking into dynasty leagues
- API clears `keeper_count` when switching away from keeper type

### Added - Mock Draft & Prospect Guide (2026-03-05)

#### Mock Draft Simulator
- Full snake draft simulation for Fleaflicker leagues
- CPU auto-pick algorithm (85% value, 10% need, 5% random)
- User team selection and manual pick interface
- Real-time roster tracking with position totals
- Draft board visualization with team colors
- 9+ sortable columns (FC Rank, Pos Rank, Combined, 30d, Trade Freq, VFF Rank, VFF Pos, Tier, Signal)
- Position filters (ALL, QB, RB, WR, TE)
- Column picker for customizable display
- Export to CSV functionality
- Reset draft capability
- Mobile-responsive design with optimized layouts
- **Trade Evaluator** - Evaluate trades when on the clock
  - Shows rostered players from other teams within ±15% value
  - Select additional assets (future picks, rostered players)
  - Real-time trade package value calculation
  - Color-coded value indicators (green = getting value, red = giving value)
  - Displays fantasy team ownership for each target
  - Realistic pick values based on FantasyCalc data

#### Prospect Guide Integration
- Database schema for Late Round prospect data (`prospect_data` table)
- Python ingestion script (`scripts/ingest-prospects.py`)
- Support for ZAP scores, categories, breakout scores, draft capital delta
- Statistical comparables and full analysis text storage
- Year 2 player tracking
- 75 prospects from 2025 draft class ingested
- Easy-to-use command: `python3 scripts/ingest-prospects.py <pdf> <year>`

#### Documentation
- Updated README.md with mock draft and prospect guide features
- Updated SKILLS.md with technical implementation details
- Created `scripts/README-PROSPECTS.md` for ingestion instructions
- Added CHANGELOG.md for version tracking

### Technical Details
- Mock draft available at `/fleaflicker/[leagueId]/mock-draft`
- Prospect data stored in PostgreSQL with indexed lookups
- PDF parsing using `pypdf` library
- Regex-based data extraction from prospect guide PDFs
- Unique constraint on (full_name, draft_year) for upserts

---

## Previous Features

### Keeper League Support
- League type designation (Dynasty, Keeper, Redraft)
- Configurable keeper count per league
- Visual "keeper line" on team rosters
- "Value Dropped" calculation and display
- Persisted to database via `/api/league-settings`

### Mock Draft Foundation
- Draft order from Fleaflicker API
- Traded picks handling
- Player value integration
- Team roster building

### Core Platform
- League dashboard with team rankings
- Team roster views with configurable columns
- Free agent views with position filters
- Draft capital tracking and valuation
- Trade target finder
- Market value gap analysis (BUY/SELL/HOLD)
- Soft login / personalized dashboard
- Sleeper and Fleaflicker integration
- Smart caching with 10-minute TTL
- Mobile-responsive design
