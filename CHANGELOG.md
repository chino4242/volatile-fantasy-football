# Changelog

All notable changes to the Volatile Fantasy Football platform.

## [Unreleased]

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
