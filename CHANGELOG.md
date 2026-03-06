# Changelog

All notable changes to the Volatile Fantasy Football platform.

## [Unreleased]

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
