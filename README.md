# Volatile Fantasy Football (VFF)

A personal fantasy football analytics platform built with **Next.js 16**, **Drizzle ORM** and **PostgreSQL (Supabase)**. It started as a dynasty valuation dashboard and now works as a cross-league portfolio manager. It connects **Sleeper, Fleaflicker, Yahoo and MyFFPC** leagues, and covers dynasty, keeper and redraft formats.

- **Current status:** single-user tool with a "soft login" (a username stored in localStorage). Supabase auth and the multi-tenant tables exist but are not enforced yet. See [Known Limitations](#known-limitations).
- **Where to read next:** [ARCHITECTURE.md](ARCHITECTURE.md) for development rules, [CHANGELOG.md](CHANGELOG.md) for a dated feature history, [docs/DEFINITION_OF_DONE.md](docs/DEFINITION_OF_DONE.md) for the change workflow.

## Features

### Portfolio hub (`/portfolio`)

The main in-season surface. It loads every connected league across all four platforms into one format-resolved contract (`src/lib/portfolio.ts`).

- **Action Center** (`src/lib/action-center.ts`, a pure aggregation engine). It produces prioritized, season-adaptive recommendations and deep-links each one to the real platform:
  - In-season, items group by action type: lineup fixes, pending trades, waiver upgrades, sells, defense streaming and kicker streaming.
  - Off-season, items group by team, each with its strengthen-moves.
  - Lineup flags can be acknowledged "on purpose" for the current week (`lineup-acks.ts`, stored locally).
- **Season mode toggle** switches the app between in-season and off-season views.
- **Lineup optimizer** (`lineup-optimizer.ts`). It computes the optimal legal lineup from weekly ranks, with kickoff locks and bench and close-call detail.
- **Waiver finders:**
  - `waiver-upgrades.ts` finds free agents who improve this week's lineup.
  - `waiver-value.ts` finds value-based pickups for deep leagues where weekly ranks are empty.
  - `transaction-suggestions.ts` suggests pickups and drops by dynasty value.
- **Streaming:** weekly defense (DST) and kicker streaming, gated by NFL game start times.
- **Player status page** (`/portfolio/player/[sleeperId]`). It shows whether a player is available or rostered, and by whom, in each of your leagues. It includes a "Plan a move" flow with a guarded suggested drop and an Add / Drop / Δ comparison table (ROS rank, ROS PPG, this week, dynasty value).
- **Player tags** (`player_tags`), including the analyst Buy/Sell board. Add and buy tags show as indicators on free-agent screens.
- **Game-Day Rooting Guide / For & Against board** (`/portfolio/game-day`). For each NFL game it lists who you are rooting for and against across leagues. It shows live scores from ESPN box scores, with per-league filters.
- **Trade tools:** a cross-league trade finder and a targeted one-player trade generator (`targeted-trade.ts`). Pending-trade evaluation currently covers Fleaflicker.

### League pages

- **League dashboards** rank every team by total dynasty value (players plus draft picks). Pages exist for Sleeper (`/league/[id]`), Fleaflicker (`/fleaflicker/[id]`) and Yahoo and MyFFPC (`/db-league/[platform]/[id]`, with `/myffpc` for setup).
- **Per-league settings:** Dynasty, Keeper or Redraft, 1QB or Superflex, and keeper count. A keeper line and a "Value Dropped" column appear for keeper leagues.
- **Roster Gaps card** on team pages: for each starting slot, your player's rank vs the best available free agent, this week and rest-of-season, with collapsed "no action" rows and a recommended move only where a gap is worth acting on (`slot-gaps.ts`).
- **Team rosters** with a configurable column picker (market value, FC and VFF ranks, tier, signal, trend, ROS and weekly ranks, advanced stats), position filters, and a roster composition chart.
- **Free agents.** Each league has a free-agent view with QB/RB/WR/TE/K/DEF tabs, ranked by dynasty value (DEF by this week's rank). It supports position and rookie filters, analyst pickup indicators, and a team-specific suggested drop.
- **Trade evaluator** with player and pick search, a dynasty/redraft blend slider, auction value, position-group before/after impact, and roster fit.
- **Trade history** for Sleeper.
- **Value movers**, showing value changes since the last weekly snapshot. It can filter to your rostered players across leagues.
- **Draft capital:** picks for the next three years, valued with FantasyCalc pick data and adjusted for traded picks.

### Drafting

- **Mock draft** for Sleeper and Fleaflicker leagues (`/league/[id]/mock-draft`, `/fleaflicker/[id]/mock-draft`).
  - CPU picks use a value and positional-need model with ZAP and AI-confidence modifiers.
  - Also included: trades, a watch list, undo, a draft board grid, CSV export, and post-draft grades.
  - Completed drafts are saved to `draft_history`.
- **Generic rookie mock draft** (`/mock-draft`) needs no league.
- **Live draft mode** (`/live-draft`) tracks real drafts with manual pick entry and unrestricted trades.
- **Draft plan** (`/draft-plan`) provides keeper selection, a pool-depletion draft board, availability percentages, and a Monte Carlo EV optimizer (`draft-monte-carlo.ts`). It supports multiple saved plans per league (`draft_plans`).
- **Cheat sheet** (`/cheat-sheet`) is a league-free ranking sheet.

### Players and research

- **All Players** (`/players`) is searchable and sorts by ROS rank by default, with weekly rank, value, and K/DEF included.
- **Player profile card** with tabs for profile, trends, scouting and move.
- **Prospect Guide** (`/prospects`) holds Late Round Fantasy Football data (ZAP scores, categories, comps, analysis text) ingested from PDF.
- **Multi-source writeups** and **AI scouting analysis** (Claude): confidence, summary, bull/bear cases and comps.
- **Advanced NFL stats** (nflreadpy): NGS, PFR, snap counts, breakout and regression flags, and a player comparison tool.
- **Stats leaderboard** (`/stats`) is an NFL-wide opportunity and production table, by single week or cumulative.
- **DFS** (`/dfs`) has a DraftKings Classic lineup optimizer and a value finder. It uses DK salary CSVs and rank-based synthetic projections.
- **Podcast claims** (`pod-claims.ts`). Fantasy-podcast transcripts are turned into structured player-claim atoms and aggregated for review in the Admin page.
- **My Rankings** (`/my-rankings`) is the early multi-user feature: upload your own rankings and generate BUY/SELL/HOLD signals (`user_*` tables, requires Supabase auth).

### Admin (`/admin`)

- Upload VFF rankings (1QB, SF, redraft, ROS) from Excel.
- Upload custom ranking sources (for example RP) with signals.
- Upload **weekly rankings** as CSV: flex, QB, DST and K.
- Paste the analyst transactions feed.
- Upload prospect writeups and podcast transcripts.
- Review podcast claims.

### Platform

- Installable **PWA**.
- In-memory cache with a 10-minute TTL for external API calls, plus a manual refresh button.
- Player-name matching with nickname aliasing (`nameUtils.ts`).

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components), React 19 |
| Database | PostgreSQL on Supabase, accessed with Drizzle ORM and `postgres` |
| Auth | Soft login (localStorage). Supabase SSR auth is wired up but disabled in `src/middleware.ts` |
| Styling | Tailwind CSS v4, lucide-react |
| AI | Anthropic SDK (Claude) for scouting analysis and transcript extraction |
| Data scraping | cheerio, Playwright (Yahoo and MyFFPC sessions) |
| NFL data | `@camfleety/nfl-data-js` (schedules), Python `nflreadpy` (stats ingestion) |
| Testing | Vitest and Testing Library (unit), Playwright (e2e) |
| Hosting | Vercel (one daily cron) plus local launchd for Python and browser jobs |

## Getting Started

### Prerequisites

- Node.js 18 or later and npm
- A PostgreSQL database (Supabase)
- Python 3.8 or later with `pip install -r requirements.txt` (for stats ingestion)
- `npx playwright install chromium` (only for Yahoo and MyFFPC syncing)

### Setup

```bash
git clone <repo-url> && cd volatile-fantasy-football
npm install
```

Create `.env.local`:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `CRON_SECRET` | Bearer token the Vercel cron sends to `/api/cron/*` |
| `ANTHROPIC_API_KEY` | AI analysis scripts and transcript or rankings extraction |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase auth (optional while auth is disabled) |
| `YAHOO_COOKIE`, `YAHOO_LEAGUE_IDS` | Yahoo sync (the cookie is written by `npm run leagues:refresh`) |
| `MYFFPC_LEAGUES` | MyFFPC league list |

Then:

```bash
npx drizzle-kit push              # create tables
npx tsx scripts/ingest-players.ts # seed players + FantasyCalc values
npm run dev                       # http://localhost:3000
```

The `user_settings` table is created by `scripts/` SQL rather than the Drizzle schema. The multi-user tables are also defined in `migrations/001_multi_user_tables.sql`.

## Data Sources and Refresh

| Source | How it gets in | Cadence |
| --- | --- | --- |
| FantasyCalc (values, pick values) | `scripts/ingest-players.ts` via `/api/cron/ingest-players` (the only job in `vercel.json`, which also takes the weekly `value_snapshots`) | Daily, 06:00 UTC |
| Sleeper and Fleaflicker rosters | Fetched live at request time (`sleeper.ts`, `fleaflicker.ts`) | Per request, cached 10 min |
| Yahoo and MyFFPC rosters | Synced into `leagues`, `rosters` and `roster_players` (`npm run yahoo:sync`, `npm run myffpc:sync`) | Local, on demand or launchd |
| NFL weekly and advanced stats | `ingest-weekly-stats-year.py`, `ingest-advanced-stats.py` | `npm run refresh:data`, weekly |
| ESPN scoreboard and box scores | Fetched live (`nfl-live.ts`, `nfl-live-stats.ts`) | Per request |
| VFF, ROS and custom rankings | Admin uploads | Manual |
| Weekly flex, QB, DST and K rankings | Admin CSV upload (`weekly_rankings`) | Weekly |
| Late Round Prospect Guide | `scripts/ingest-prospects.py <pdf> <year>` | Per guide release |
| Writeups and AI analysis | `ingest-writeups.ts`, `analyze-writeups.ts`, `analyze-prospects.ts` | Per source |

`npm run refresh:data` (`scripts/refresh-data.sh`) refreshes weekly stats, advanced stats, Yahoo and MyFFPC in one run. Each step is independent, and a stale Yahoo cookie or MyFFPC login fails without stopping the others. To run it weekly on your Mac, see [scripts/launchd/README.md](scripts/launchd/README.md). When a login goes stale, run `npm run leagues:refresh` to re-authenticate in a browser and sync.

## Project Structure

```
volatile-fantasy-football/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # Home: connect and list leagues (all 4 platforms)
│   │   ├── portfolio/            # Hub, game-day (For & Against), player/[sleeperId]
│   │   ├── league/[leagueId]/    # Sleeper: dashboard, team, free-agents, mock/live draft, draft-plan
│   │   ├── fleaflicker/[leagueId]/  # Fleaflicker: same, plus trades
│   │   ├── db-league/[platform]/[leagueId]/  # Yahoo and MyFFPC: dashboard, team, free-agents
│   │   ├── myffpc/               # MyFFPC setup and legacy views
│   │   ├── yahoo/                # Redirect into db-league
│   │   ├── mock-draft/           # Generic rookie mock draft
│   │   ├── players/  prospects/  stats/  cheat-sheet/  dfs/  my-rankings/
│   │   ├── admin/                # Rankings, weekly CSV, transactions, transcripts, pod claims
│   │   ├── login/  auth/callback/
│   │   └── api/                  # ~55 route handlers (admin, cron, portfolio, dfs, rankings, signals, ...)
│   ├── components/               # Shared UI (FreeAgentTable, PlayerProfileCard, TradeEvaluator, portfolio/ActionCenter, ...)
│   ├── hooks/                    # useUser (soft login), useMyTeams, useSeasonMode, useLineupAcks
│   ├── lib/                      # Domain logic and API clients (see below)
│   ├── db/                       # schema.ts (Drizzle) and index.ts (connection)
│   ├── types/player.ts
│   ├── middleware.ts             # Currently a no-op
│   └── __tests__/                # Vitest suites
├── scripts/                      # Ingestion, sync, verification and refresh scripts (TS, Python, shell)
│   └── launchd/                  # Weekly local refresh job
├── migrations/                   # SQL for the multi-user tables
├── e2e/                          # Playwright specs
├── docs/                         # Definition of done, planning notes, draft decision tree
├── _bmad-output/                 # BMAD planning artifacts (stories, UX specs)
├── drizzle.config.ts  vitest.config.ts  playwright.config.ts  vercel.json
```

### `src/lib/` map

| Area | Modules |
| --- | --- |
| Platform clients | `sleeper.ts`, `fleaflicker.ts`, `yahoo.ts`, `myffpc-parser.ts`, `db-league-data.ts`, `db-matchups.ts` |
| Portfolio and actions | `portfolio.ts`, `action-center.ts`, `lineup-optimizer.ts`, `lineup-acks.ts`, `waiver-upgrades.ts`, `waiver-value.ts`, `team-waiver-upgrades.ts`, `transaction-suggestions.ts`, `analyst-signals.ts` |
| Trades | `trade-advisor.ts`, `targeted-trade.ts` |
| Live game data | `nfl-live.ts`, `nfl-live-stats.ts`, `nfl-schedule.ts`, `rooting-guide.ts` |
| Drafting | `draft-data.ts`, `draft-simulation.ts`, `draft-monte-carlo.ts`, `post-draft-analysis.ts`, `sleeper-adp.ts` |
| Rankings | `rankings-upload.ts`, `rankings-vintage.ts`, `custom-rankings.ts`, `weekly-rankings.ts`, `transactions-parser.ts`, `pod-claims.ts` |
| Stats | `advanced-stats.ts`, `stats-queries.ts`, `nfl-data.ts` |
| DFS | `dk-optimizer.ts`, `dk-projection.ts`, `dk-salaries.ts` |
| Utilities | `cache.ts`, `nameUtils.ts`, `positionColors.ts`, `supabase/{client,server}.ts` |

Check `src/lib/` before writing new fetch or utility code (see ARCHITECTURE.md).

## Database

Drizzle schema in [`src/db/schema.ts`](src/db/schema.ts), 24 tables:

| Group | Tables |
| --- | --- |
| Players and values | `players`, `player_values`, `value_snapshots`, `player_advanced_stats`, `weekly_player_stats` |
| Leagues | `leagues`, `rosters`, `roster_players`, `weekly_roster_snapshots` |
| Rankings | `rankings_history`, `ranking_sources`, `custom_rankings`, `weekly_rankings` |
| Scouting | `prospect_data`, `prospect_writeups`, `player_tags`, `player_transactions`, `pod_claims` |
| Drafts and trades | `draft_history`, `draft_plans`, `trade_scenarios` |
| Per-user (RLS design) | `user_leagues`, `user_sources`, `user_rankings`, `user_signals` |

`players.sleeper_id` is the canonical player key across tables. Team defenses are stored as `DEF_{ABBR}`. Rookies are `years_exp === 0`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (unit and component) |
| `npm run test:e2e` | Playwright e2e |
| `npm run test:all` | Both test suites |
| `npm run refresh:data` | Weekly stats, advanced stats, Yahoo and MyFFPC sync |
| `npm run ingest:2026` | Weekly and advanced NFL stats for 2026 |
| `npm run ingest:nfl` | Legacy NFL stats ingestion |
| `npm run yahoo:login` / `yahoo:refresh` / `yahoo:sync` | Yahoo auth and sync |
| `npm run myffpc:refresh` / `myffpc:sync` / `myffpc:verify` | MyFFPC sync |
| `npm run leagues:refresh` | One browser login, then Yahoo and MyFFPC sync |
| `npx drizzle-kit push` / `studio` | Apply schema, browse DB |
| `npx tsx scripts/ingest-players.ts` | FantasyCalc players and pick values |
| `python3 scripts/ingest-prospects.py <pdf> <year>` | Prospect Guide ingestion ([details](scripts/README-PROSPECTS.md)) |
| `npx tsx scripts/ingest-writeups.ts <dir> <year> <source>` | Writeup ingestion |
| `npx tsx scripts/analyze-writeups.ts` / `analyze-prospects.ts` | Claude analysis |
| `npx tsx scripts/ingest-defenses.ts` / `ingest-kickers.ts` | Seed DEF and K players |
| `python3 scripts/repair-gsis-mapping.py` / `audit-gsis-mapping.py` | Fix or audit the GSIS to Sleeper ID mapping |
| `npx tsx scripts/verify-db.ts` | Check DB connection and data |

## Testing

- **Unit and component (Vitest, jsdom):** 20 files and 238 tests, about 2 seconds. They cover pure engines (action center, lineup optimizer, waiver upgrades, targeted trades, rooting guide, DK optimizer, advanced stats, post-draft analysis, name matching, cache, Sleeper client, live NFL data) plus the ingestion script and `AppHeader`.
- **E2E (Playwright):** `e2e/navigation.spec.ts` covers the home to players to league to team journey on desktop and mobile.
- **Type check:** `npx tsc --noEmit`. Test files currently report missing `expect` and `it` types, because tsconfig doesn't include the Vitest globals.

Workflow per change: update or add tests for `lib/`, API and data-transform changes, run `npm run test` and `npx tsc --noEmit`, update docs, wait for local confirmation, then push. See [docs/DEFINITION_OF_DONE.md](docs/DEFINITION_OF_DONE.md).

## Deployment

Pushes to `main` deploy automatically on Vercel. Set `DATABASE_URL` and `CRON_SECRET` (plus `ANTHROPIC_API_KEY` if you use AI routes) in the Vercel project. The only scheduled Vercel job is the daily FantasyCalc ingest in `vercel.json`. See [AUTOMATED_INGESTION.md](AUTOMATED_INGESTION.md) and [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## Known Limitations

- **Most API routes are unauthenticated.** `src/middleware.ts` is a no-op, and only the cron routes and the Supabase-backed routes check credentials. That includes the admin upload routes, `/api/ingest` and `/api/cache/clear`. Don't expose the deployment publicly until these are protected.
- **`x-user-id` is client-supplied.** `/api/user-settings` (which stores the Fleaflicker session cookie) and `/api/draft-plans` trust this header, so it is not real authentication.
- **Baked-in analysis is unlicensed.** Prospect writeups, ZAP data and third-party rankings are in shared tables. This is fine for personal use and must change before the app opens to other users. See [docs/2026-09-12-platform-vision-party-mode.md](docs/2026-09-12-platform-vision-party-mode.md).
- **Yahoo and MyFFPC depend on a logged-in browser session** and break when that session expires. Re-run `npm run leagues:refresh`.

## Other Docs

Feature notes: [CUSTOM_RANKINGS.md](CUSTOM_RANKINGS.md), [QUICK_START_RANKINGS.md](QUICK_START_RANKINGS.md), [CACHING_IMPLEMENTATION.md](CACHING_IMPLEMENTATION.md), [PYTHON_SETUP.md](PYTHON_SETUP.md), [SKILLS.md](SKILLS.md). Some of these were written during earlier phases (for example `NFL_STATS_INTEGRATION.md` and `PLAYER_STATS_MODAL.md` describe the old `nfl_stats` table and a removed modal). Treat them as historical.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

Private. Contact the maintainer for licensing inquiries.
