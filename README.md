# Volatile Fantasy Football

A high-performance dynasty fantasy football analytics platform built with **Next.js 16**, **Drizzle ORM**, and **PostgreSQL**. Live at [theprovingground.co](https://theprovingground.co).

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
- **Mock Draft Simulator** — Full snake draft simulation with intelligent CPU auto-pick logic, manual user picks, real-time roster tracking, position filters, column picker (9+ columns), CSV export, and draft board visualization. Supports both Sleeper and Fleaflicker leagues with accurate draft order including traded picks. Features:
  - **Draft Setup (Sleeper)** — Pre-draft screen to select your draft slot and reassign picks for trades, persisted to localStorage per league
  - **Smart CPU Logic** — 92% value weight + 8% positional need, selecting from top 3 candidates with weighted random (squared scores)
  - **Positional Need Calculation** — Factors in lineup-derived target allocation (from Fleaflicker roster requirements API), depth vs starting slots, waiver wire scarcity, and players drafted during the mock
  - **Pick Reasoning** — Shows score breakdown below each CPU pick (rank, value, need %, composite score)
  - **User Recommendations** — When on the clock, displays top 3 recommended picks with full score breakdown; click to draft instantly
- **Prospect Guide Integration** — Late Round Fantasy Football prospect data (ZAP scores, categories, breakout scores, draft capital delta, statistical comparables) ingested from PDF and ready for mock draft integration. Easy-to-use Python script for importing new prospect guides
- **Soft Login / Dashboard** — Enter your Sleeper username to get a personalized dashboard showing all your 2025 leagues. Supports Fleaflicker accounts too
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
│   ├── test-db.js              # Quick DB connection test
│   └── verify-db.ts            # Verifies DB schema and data
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout (header, providers, fonts, metadata)
│   │   ├── page.tsx            # Home page / personalized dashboard (login)
│   │   ├── providers.tsx       # Client-side context providers (AuthProvider)
│   │   ├── players/
│   │   │   └── page.tsx        # Top 50 players list
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
- **Manual Trigger:** `curl -X POST https://theprovingground.co/api/ingest`
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

- **Production URL:** [theprovingground.co](https://theprovingground.co)
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
