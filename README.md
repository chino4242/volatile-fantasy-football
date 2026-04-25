# Volatile Fantasy Football

A high-performance dynasty fantasy football analytics platform built with **Next.js 16**, **Drizzle ORM**, and **PostgreSQL**.

## Features

- **League Dashboard** — View all teams in a Sleeper or Fleaflicker league ranked by total dynasty value (players + draft picks)
- **Keeper League Support** — Designate leagues as Dynasty, Keeper, or Redraft. For keeper leagues, set the number of keepers and see a visual "keeper line" on team rosters showing which players would be kept. League dashboard shows "Value Dropped" column indicating total value of players that would need to be dropped per team
- **Team Rosters** — Drill into any team to see their full roster with per-player valuations and a configurable column picker. For keeper leagues, displays "Value Dropped" stat showing the total value of players beyond the keeper limit
- **Draft Capital** — All draft picks (next 3 years) are displayed with FantasyCalc values and integrated into team valuations
- **Specific Pick Values** — Individual pick slots (e.g., 1.02 vs 1.09) are valued using real FantasyCalc pick data, not generic round averages
- **Position Filters** — Interactive position filters on team pages to toggle between viewing players and draft picks
- **Configurable Columns** — Users can toggle which data columns are visible on team roster and free agent tables, grouped into Core, FantasyCalc, and VFF Rankings sections. Includes: Market Value, FC Overall Rank, FC Position Rank, Combined Value, 30-Day Trend, Trade Frequency, VFF Rank, VFF Position, Tier, and Signal
- **Scoring Format per League** — Each league on the dashboard can be independently set to 1QB or Superflex (SF). The format is stored in localStorage and passed through all league, team, and free agent pages
- **Market Value Gap Analysis** — BUY/SELL/HOLD indicators comparing FantasyCalc market rankings vs. proprietary analysis rankings for both 1QB and Superflex formats
- **Trade Target Finder** — Click any draft pick to see trade targets from other teams within 5% value range, with value gap indicators and expandable results
- **Free Agent View** — See available waiver wire players ranked by dynasty value for the selected scoring format (1QB or SF), with position and rookie filters. Position value summary cards show total available value by position (QB, RB, WR, TE)
- **Position Value Analytics** — All Players page and Free Agent pages display summary cards showing total value by position, making it easy to identify position scarcity and opportunity
- **Rookie Filter** — On the Free Agent page, filter specifically by rookies (identified by `years_exp === 0` from FantasyCalc)
- **Column Sorting** — All table columns are sortable on League and Free Agent pages
- **Mock Draft Simulator** — Full snake/linear draft simulation with intelligent CPU auto-pick logic, manual user picks, real-time roster tracking, position filters, column picker (9+ columns), CSV export, and visual draft board grid. Supports both Sleeper and Fleaflicker leagues with accurate draft order including traded picks. Features:
  - **Cross-Season Draft Resolution (Sleeper)** — Automatically resolves the current season's draft across Sleeper's league chain (each season creates a new league ID). Falls back to manual setup only when no API draft exists
  - **Smart CPU Logic** — 92% value weight + 8% positional need, selecting from top 3 candidates with weighted random (squared scores). ZAP category modifier (+15% Elite to -10% Dart Throw) and AI confidence modifier (±8%) influence scoring
  - **Positional Need Calculation** — Factors in lineup-derived target allocation (from Fleaflicker roster requirements API), depth vs starting slots, waiver wire scarcity, and players drafted during the mock
  - **Pick Reasoning** — Shows score breakdown below each CPU pick (rank, value, need %, composite score)
  - **User Recommendations** — When on the clock, displays top 3 recommended picks; click to open player detail modal with full scouting data before drafting
  - **Player Detail Modal** — Full scouting view with FC/VFF rankings, 30-day trend, ZAP data, AI analysis (confidence, summary, comps, bull/bear case), and writeups from all sources. Draft button inside modal
  - **In-Draft Trading** — Full trade evaluator with player search, side-by-side asset builder (your picks/players vs their picks/players), live value comparison, and 10% fair-value auto-acceptance. Pick values estimated from best-available-player projections, not static startup values
  - **Suggest Trade (Live Draft)** — When another team is on the clock, propose a package from your assets to acquire their pick
  - **Watch List** — Star/pin players of interest; persisted to localStorage per league. Filter available players to show only watched players
  - **Search** — Filter available players by name in real-time
  - **Undo Last Pick** — Reverts the most recent pick, restoring the player to the available pool
  - **On-Deck Indicator** — Shows your next pick and how many picks away (e.g., "Your next pick: 2.05 (7 picks away)")
  - **Last Pick Display** — Shows who was just drafted in the on-the-clock banner
  - **Recent Picks Log** — Scrollable strip showing last 12 picks with team, player, and position
  - **Visual Draft Board** — Grid layout (columns = draft slots, rows = rounds) with position color coding, traded pick indicators, and current pick highlight
  - **Draft Grades** — Post-draft league-wide grades based on starter impact (drafted players that crack the starting lineup weighted 3x over bench depth). Progressive roster simulation for accurate STARTER/BENCH classification. Per-team position group snapshots (pre-draft → post-draft values)
  - **Draft History** — Completed drafts auto-saved to database. Collapsible "Past Drafts" section with expandable pick details, grades, and team info. Persists across devices via user login
- **Live Draft Mode** — Separate mode for tracking real drafts in real-time. Same UI as mock draft but with manual pick entry for all teams, no CPU auto-pick, unrestricted trades (no value check), projected picks for every team, and "Suggest Trade" button. Available at `/league/{id}/live-draft` and `/fleaflicker/{id}/live-draft`
- **AI Scouting Analysis** — Prospect writeups and Late Round data analyzed by Claude (Anthropic) at ingestion time. Extracts confidence score (1-10), one-line summary, bull/bear cases, and NFL player comparisons. Displayed in player detail modal, writeup tabs, and keeper selection cards. AI confidence feeds into draft recommendation scoring
- **Prospect Writeups (Multi-Source)** — Ingest scouting writeups from multiple sources (e.g., Reception Perception) as `.txt` files. Matched to players by name, stored in `prospect_writeups` table with source tagging. Displayed across mock draft, live draft, free agent, and team roster pages as tabbed expandable rows
- **Prospect Guide Integration** — Late Round Fantasy Football prospect data (ZAP scores, categories, breakout scores, draft capital delta, statistical comparables) ingested from PDF and stored in the database. Features:
  - **Prospect Guide Page** (`/prospects`) — Sortable table with rookie/Year 2 tabs, position filters, color-coded ZAP categories, expandable analysis text per player
  - **Mock Draft Integration** — ZAP / Yr 2 score, Pos Rank, and Tier columns in the available players table. Year 2 scores take priority; stale ZAP shown dimmed italic. Click any prospect name to expand inline profile with comps and analysis
  - **Smart Ingestion** — Python script dynamically scans PDF pages (no hardcoded ranges), handles both rookie and Year 2 profiles, supports 1QB rookie rankings
- **Player Stats Modal** — Click any player on team roster pages to view weekly stats (targets, receptions, yards, TDs, carries, passing stats, fantasy points). Season selector (2020-2025). Stats sourced from Sleeper API and nfl_data_py
- **Soft Login / Dashboard** — Enter your Sleeper username to get a personalized dashboard showing all your leagues. Supports Fleaflicker accounts too
- **Player Rankings** — Browse the top 50 dynasty players by FantasyCalc value
- **Live Sleeper Integration** — Roster data is fetched in real-time from the [Sleeper API](https://docs.sleeper.com/)
- **FantasyCalc Valuations** — Player trade values sourced from [FantasyCalc](https://fantasycalc.com/)
- **Mobile-Responsive** — Optimized table layouts for phones and tablets
- **Smart Caching** — In-memory cache with 10-minute TTL for external API calls, with manual refresh option for instant updates

## Tech Stack

| Layer      | Technology                                                       |
| ---------- | ---------------------------------------------------------------- |
| Framework  | [Next.js 16](https://nextjs.org/) (App Router, Server Components)|
| Database   | PostgreSQL (via [Supabase](https://supabase.com/))              |
| ORM        | [Drizzle ORM](https://orm.drizzle.team/)                        |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com/)                      |
| Icons      | [Lucide React](https://lucide.dev/)                              |
| Font       | [Inter](https://fonts.google.com/specimen/Inter) (via next/font) |
| Hosting    | [Vercel](https://vercel.com/)                                    |

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node)
- A **PostgreSQL** database (we use [Supabase](https://supabase.com/) for managed Postgres)

### 1. Clone the Repository

```bash
git clone https://github.com/<your-org>/volatile-fantasy-football.git
cd volatile-fantasy-football
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
```

> **Note:** The `DATABASE_URL` must point to a PostgreSQL database. If you're using Supabase, copy the connection string from your Supabase project settings under Database > Connection string > URI.

### 4. Set Up the Database

Push the Drizzle schema to your database:

```bash
npx drizzle-kit push
```

Then seed the database with player data from FantasyCalc:

```bash
npx tsx scripts/ingest-players.ts
```

### 5. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
volatile-fantasy-football/
├── scripts/                    # Data ingestion & DB utility scripts
│   ├── ingest-players.ts       # Fetches player + pick data from FantasyCalc API
│   ├── ingest-prospects.py     # Ingests Late Round Prospect Guide PDF data
│   ├── ingest-writeups.ts      # Ingests prospect writeups from .txt files (multi-source)
│   ├── analyze-writeups.ts     # AI analysis of writeups via Claude (confidence, summary, comps)
│   ├── analyze-prospects.ts    # AI analysis of Late Round prospect data via Claude
│   ├── ingest-sleeper-stats.py # Ingests weekly player stats from Sleeper API
│   ├── test-db.js              # Quick DB connection test
│   └── verify-db.ts            # Verifies DB schema and data
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout (header, providers, fonts, metadata)
│   │   ├── page.tsx            # Home page / personalized dashboard (login)
│   │   ├── providers.tsx       # Client-side context providers (AuthProvider)
│   │   ├── players/
│   │   │   └── page.tsx        # Top 50 players list
│   │   ├── prospects/
│   │   │   ├── page.tsx        # Prospect guide page (server component)
│   │   │   └── ProspectsTable.tsx  # Prospect table (client, tabs/filters/sort)
│   │   ├── league/
│   │   │   └── [leagueId]/
│   │   │       ├── page.tsx    # League dashboard (all teams ranked)
│   │   │       ├── free-agents/
│   │   │       │   └── page.tsx  # Free agent view (Sleeper)
│   │   │       └── team/
│   │   │           └── [rosterId]/
│   │   │               └── page.tsx  # Individual team roster
│   │   └── fleaflicker/
│   │       └── [leagueId]/
│   │           ├── page.tsx          # Fleaflicker league dashboard
│   │           ├── mock-draft/
│   │           │   ├── page.tsx      # Mock draft page (server component)
│   │           │   └── MockDraftClient.tsx  # Mock draft simulator (client)
│   │           ├── free-agents/
│   │           │   └── page.tsx      # Free agent view (Fleaflicker)
│   │           └── team/
│   │               └── [teamId]/
│   │                   └── page.tsx  # Fleaflicker team roster
│   ├── components/
│   │   ├── AppHeader.tsx       # Sticky navigation header (auth-aware)
│   │   ├── FreeAgentTable.tsx  # Client component for Free Agent view (with filters & sorting)
│   │   └── LeagueTable.tsx     # League dashboard table (sortable)
│   ├── db/
│   │   ├── index.ts            # Database connection (Drizzle + postgres.js)
│   │   └── schema.ts           # Drizzle schema (players, leagues, rosters, values, prospects)
│   ├── hooks/
│   │   └── useUser.tsx         # AuthProvider & useAuth hook (localStorage-backed login)
│   └── lib/
│       ├── sleeper.ts          # Sleeper API client (users, rosters, leagues)
│       └── fleaflicker.ts      # Fleaflicker API client
├── drizzle.config.ts           # Drizzle Kit configuration
├── package.json
└── tsconfig.json
```

## Database Schema

The app uses six tables managed by Drizzle ORM:

| Table             | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `players`         | Master player list (name, position, team, age, `years_exp`) |
| `player_values`   | Dynasty trade values from FantasyCalc and KTC          |
| `prospect_data`   | Late Round prospect guide data (ZAP scores, categories, analysis) |
| `prospect_writeups` | Multi-source scouting writeups (matched to players by name)    |
| `draft_history`   | Saved mock/live draft results (picks, grades, per user/league) |
| `leagues`         | League metadata (platform, scoring, roster settings)   |
| `rosters`         | Team rosters within a league (W/L record, points)      |
| `roster_players`  | Join table linking rosters to players                  |

> **Rookie identification:** The `players.years_exp` column (sourced from FantasyCalc's `maybeYoe` field) is used to flag rookies. Players with `years_exp === 0` are considered rookies.

See [`src/db/schema.ts`](src/db/schema.ts) for the full schema definition.

## Key APIs & Data Sources

### Sleeper API (Live)
Roster and user data is fetched **at request time** from the Sleeper API. No Sleeper data is cached in the database.

- **Endpoint:** `https://api.sleeper.app/v1/league/{leagueId}/users`
- **Endpoint:** `https://api.sleeper.app/v1/league/{leagueId}/rosters`
- **Endpoint:** `https://api.sleeper.app/v1/league/{leagueId}/traded_picks`
- **Client:** [`src/lib/sleeper.ts`](src/lib/sleeper.ts)

**Draft Picks:** The app generates all draft picks for each team (next 3 years, 5 rounds per year) and applies trades from the Sleeper API to show complete draft capital ownership.

### FantasyCalc API (Ingested & Auto-Updated)
Player valuations are automatically refreshed **daily at 6 AM UTC** via Vercel Cron Job. Data is stored in PostgreSQL for fast lookups.

- **Endpoint:** `https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5`
- **Script:** [`scripts/ingest-players.ts`](scripts/ingest-players.ts)
- **Automation:** See [AUTOMATED_INGESTION.md](AUTOMATED_INGESTION.md) for details
- **Manual Trigger:** `curl -X POST https://volatile-fantasy-football.vercel.app/api/ingest`
- **Local Run:** `npx tsx scripts/ingest-players.ts`

**Draft Pick Values:** FantasyCalc provides values for draft picks (e.g., `FP_2026_1` for 2026 1st round) which are stored alongside player values and used for trade analysis.

### Late Round Prospect Guide (Ingested)
Prospect analysis data is ingested from Late Round Fantasy Football PDF guides and stored in PostgreSQL.

- **Script:** [`scripts/ingest-prospects.py`](scripts/ingest-prospects.py)
- **Run:** `python3 scripts/ingest-prospects.py <pdf_path> <draft_year>`
- **Data:** ZAP scores, categories, breakout scores, draft capital delta, statistical comparables, analysis text

See [`scripts/README-PROSPECTS.md`](scripts/README-PROSPECTS.md) for detailed ingestion instructions.

## Available Scripts

| Command                             | Description                                      |
| ----------------------------------- | ------------------------------------------------ |
| `npm run dev`                       | Start the Next.js development server             |
| `npm run build`                     | Create a production build                        |
| `npm run start`                     | Start the production server                      |
| `npm run test`                      | Run the Vitest unit test suite                   |
| `npm run test:e2e`                  | Run the Playwright E2E test suite                |
| `npm run test:all`                  | Run both Unit and E2E test suites                |
| `npm run lint`                      | Run ESLint                                       |
| `npx drizzle-kit push`             | Push schema changes to the database              |
| `npx drizzle-kit studio`           | Open Drizzle Studio (visual DB browser)          |
| `npx tsx scripts/ingest-players.ts`| Ingest/update player data from FantasyCalc       |
| `python3 scripts/ingest-prospects.py <pdf> <year>` | Ingest prospect data from PDF |
| `npx tsx scripts/ingest-writeups.ts <dir> <year> <source>` | Ingest prospect writeups from .txt files |
| `npx tsx scripts/analyze-writeups.ts`  | AI-analyze writeups via Claude (confidence, summary, comps) |
| `npx tsx scripts/analyze-prospects.ts` | AI-analyze Late Round prospect data via Claude |
| `python3 scripts/ingest-sleeper-stats.py [year]` | Ingest weekly player stats from Sleeper API |
| `npx tsx scripts/verify-db.ts`     | Verify database connection and data              |

## Testing

We use a layered testing approach combining **Vitest** (Unit Tests) and **Playwright** (End-to-End Tests).

To run all tests sequentially:
```bash
npm run test:all
```

You can also run them individually:
- `npm run test` — Runs the Vitest unit/integration suite.
- `npm run test:e2e` — Runs the full Playwright E2E suite (verifies critical user journeys on both Desktop and Mobile viewports).

### Test Strategy
Our testing layers prioritize different areas:
1. **Unit Tests (Vitest)** — API clients (`src/lib/sleeper.ts`) and complex pure functions.
2. **E2E Tests (Playwright)** — Critical user journeys (home -> players -> league -> team) and mobile responsiveness formatting.
3. **Integration Tests (Vitest)** — Database ingestion scripts (`scripts/ingest-players.ts`) using Mocked Drizzle instances.

## Deployment

The app is deployed on **Vercel** and automatically deploys on pushes to `main`.

- **Production URL:** Deployed on Vercel
- **Vercel Root Directory:** `volatile-fantasy-football`

### Environment Variables on Vercel

Make sure the following environment variable is set in your Vercel project settings:

| Variable        | Description                          |
| --------------- | ------------------------------------ |
| `DATABASE_URL`  | PostgreSQL connection string         |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is private. Please contact the maintainer for licensing inquiries.
