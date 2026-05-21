# Architecture — Volatile Fantasy Football

> Developer guide for the VFF platform. Read before writing new code.

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        External APIs                                 │
│  Sleeper API │ Fleaflicker API │ FantasyCalc API │ NFL Data (Python) │
└──────┬───────┴────────┬────────┴────────┬────────┴────────┬─────────┘
       │                │                 │                  │
       ▼                ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Ingestion Layer                                   │
│  scripts/ingest-players.ts  │  scripts/ingest-nfl-*.py/ts           │
│  scripts/ingest-prospects.py │  /api/sync/market-values (cron)      │
│  /api/leagues/connect (user-triggered)                               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PostgreSQL (Supabase)                             │
│  ┌─────────────────────────┐  ┌──────────────────────────────────┐  │
│  │   SHARED (public read)  │  │   USER-SCOPED (RLS per user)     │  │
│  │   players               │  │   user_leagues                   │  │
│  │   playerValues          │  │   user_sources                   │  │
│  │   leagues / rosters     │  │   user_rankings                  │  │
│  │   weeklyPlayerStats     │  │   user_signals                   │  │
│  │   prospectData/Writeups │  │                                  │  │
│  │   draftHistory          │  │                                  │  │
│  └─────────────────────────┘  └──────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Next.js App (Vercel)                              │
│  Server Components → Drizzle queries → Render                        │
│  API Routes → Auth check → Drizzle mutations                         │
│  Client Components → fetch API routes                                │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Existing Libraries (`src/lib/`)

**Always check here before writing new fetch/utility code.**

| Module | Exports | Purpose |
|--------|---------|---------|
| `sleeper.ts` | `getLeagueUsers`, `getLeagueRosters`, `getTradedPicks`, `getLeagueData`, `getCurrentSeasonLeagueId`, `getAllDraftPicks`, `getSleeperUserId`, `getUserLeagues` | All Sleeper API interactions |
| `fleaflicker.ts` | League/roster fetching for Fleaflicker | Fleaflicker API interactions |
| `cache.ts` | `cache.get`, `cache.set`, `TTL` | In-memory cache with configurable TTL |
| `utils.ts` | General utilities | Shared helpers |
| `supabase/client.ts` | `createClient()` | Browser-side Supabase client (auth) |
| `supabase/server.ts` | `createClient()` | Server-side Supabase client (auth) |

## 3. Data Layer

### Shared Tables (public read, admin/script write)

| Table | Purpose | Source of Truth |
|-------|---------|-----------------|
| `players` | Canonical player list | FantasyCalc + Sleeper IDs |
| `playerValues` | Market valuations (SF + 1QB) | FantasyCalc API |
| `leagues` | League metadata (legacy) | Sleeper/Fleaflicker API |
| `rosters` | Team rosters (legacy) | Sleeper/Fleaflicker API |
| `roster_players` | Roster membership (legacy) | Sleeper/Fleaflicker API |
| `weeklyPlayerStats` | NFL stats per player/week | nfl_data_py / Sleeper |
| `prospectData` | Prospect scouting (ZAP, AI) | Late Round PDF + Claude |
| `prospectWriteups` | Multi-source writeups | Manual ingestion |
| `rankingSources` | Custom ranking source defs | Admin upload |
| `customRankings` | Rankings from external sources | Admin upload |
| `rankingsHistory` | Archived VFF ranking snapshots | Admin upload |
| `valueSnapshots` | Weekly value tracking | Cron |
| `draftHistory` | Saved mock/live drafts | User action |
| `weeklyRosterSnapshots` | Roster composition per week | Cron |

### User-Scoped Tables (RLS: `auth.uid() = user_id`)

| Table | Purpose | Source of Truth |
|-------|---------|-----------------|
| `user_leagues` | Connected leagues per user | Sleeper API (user-triggered) |
| `user_sources` | Uploaded rankings/analysis | User upload |
| `user_rankings` | Extracted per-player rankings | Parsed from user_sources |
| `user_signals` | Generated BUY/SELL/HOLD | Computed (rankings vs market) |

## 4. API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/sync/market-values` | GET | CRON_SECRET | Refresh FantasyCalc values nightly |
| `/api/leagues/connect` | POST | Supabase Auth | Connect user's Sleeper leagues |
| (existing page routes) | GET | None | Legacy single-user pages |

## 5. Ingestion Scripts (`/scripts`)

| Script | Purpose | When to Run |
|--------|---------|-------------|
| `ingest-players.ts` | Seed players + playerValues from FantasyCalc | Weekly or on-demand |
| `ingest-nfl-stats-py.py` | NFL stats via nfl_data_py | Weekly during season |
| `ingest-nfl-stats.ts` | NFL stats (JS alternative) | Weekly during season |
| `ingest-nfl-data.ts` | Additional NFL data | As needed |
| `ingest-prospects.py` | Parse Late Round PDF → prospectData | Per new PDF release |
| `ingest-writeups.ts` | Ingest prospect writeups | Per new source |
| `ingest-sleeper-stats.py` | Sleeper-specific stats | Weekly during season |
| `import-rankings.ts` | Import custom rankings CSV | Admin action |
| `verify-*.ts`, `check-*.ts` | Data verification | After ingestion |

## 6. Platform Boundaries

### Legacy (single-user, no auth)
- All existing pages (`/league/[id]`, `/mock-draft`, `/prospects`, etc.)
- Shared tables (`leagues`, `rosters`, `roster_players`)
- Admin dashboard (rankings upload)
- Draft history (stored by username string, not auth user)

### Multi-Tenant Platform (authenticated, RLS)
- `/api/leagues/connect` — user connects their leagues
- `/api/sync/market-values` — shared data refresh
- `user_*` tables — all per-user data
- Signal generation — computed from user_rankings vs playerValues
- (Future) Ingestion UI — paste/upload rankings

### Decision Table

| Question | Answer |
|----------|--------|
| Does this data belong to a specific user? | → `user_*` table with RLS |
| Is this shared reference data? | → Shared table, no RLS |
| Am I fetching from Sleeper/Fleaflicker? | → Use `src/lib/sleeper.ts` or `fleaflicker.ts` |
| Am I fetching from FantasyCalc? | → Use `/api/sync/market-values` or `ingest-players.ts` |
| Does this route need auth? | → Use `createClient()` from `src/lib/supabase/server.ts` |

## 7. Development Rules

1. **Check `src/lib/` before writing any API fetch.** If a function exists, use it.
2. **User-scoped data always goes in `user_*` tables** with `user_id` column.
3. **Never write to shared tables from authenticated user routes.** Shared tables are updated by crons/scripts only.
4. **All new API routes that handle user data must check auth** via Supabase `getUser()`.
5. **Sleeper/Fleaflicker API calls go through `src/lib/sleeper.ts` or `fleaflicker.ts`** — never inline fetch.
6. **FantasyCalc data lives in `playerValues`** — don't create parallel value tables.
7. **Player matching uses `sleeper_id` as the canonical key** across all tables.
8. **Signals are always DERIVED, never manually set.** Regenerate on ranking upload or market value change.
9. **Legacy pages can read from shared tables directly.** New platform features read from `user_*` tables.
10. **Don't store licensed/paid content in shared tables.** User-uploaded analysis goes in `user_sources` / `user_rankings` only.

## 8. Migration Path (Legacy → Platform)

### Phase 1 (Current): Foundation
- Auth + user tables + RLS ✅
- Market values sync ✅
- League connection ✅

### Phase 2: Ingestion
- User uploads rankings (paste/CSV/PDF)
- Claude extraction → user_rankings
- Fuzzy matching against players table

### Phase 3: Signals
- BUY/SELL/HOLD generation from user_rankings vs playerValues
- League-contextualized trade targets from user_leagues roster data

### Phase 4: Convergence
- Legacy pages gain "log in to personalize" prompts
- Shared `leagues`/`rosters` tables deprecated in favor of `user_leagues`
- Draft history migrated to use auth user_id
- Admin upload becomes self-service for all users

### Guiding Principles
- Legacy features continue working without auth (read-only shared data)
- New features require auth and use user-scoped tables
- No breaking changes to existing URLs
- Shared data (players, market values) remains the single source of truth for everyone
