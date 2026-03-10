# Automated Data Ingestion

This document explains how player data is automatically updated in the Volatile Fantasy Football platform.

## Overview

Player valuations and team assignments are automatically refreshed daily via a Vercel Cron Job. This ensures the platform stays current with:
- Player value changes from FantasyCalc
- Team changes (trades, free agency signings)
- Rookie data updates
- Draft pick valuations

## Automatic Updates

### Vercel Cron Job

**Schedule:** Daily at 6:00 AM UTC (2:00 AM EST / 11:00 PM PST)

**What it does:**
1. Fetches latest player data from FantasyCalc API (both Superflex and 1QB)
2. Updates player values, ranks, and metadata in PostgreSQL
3. Updates draft pick valuations
4. Logs results to Vercel function logs

**Configuration:**
- Defined in `vercel.json`
- Runs via `/api/cron/ingest-players` endpoint
- Protected by `CRON_SECRET` environment variable

### Monitoring

Check cron job execution in Vercel Dashboard:
1. Go to your project → Deployments → Functions
2. Filter by `/api/cron/ingest-players`
3. View logs for success/failure status

## Manual Triggers

### Option 1: API Endpoint (Production)

Trigger ingestion manually via POST request:

```bash
curl -X POST https://theprovingground.co/api/ingest
```

This is useful when:
- Major free agency news breaks
- You want fresh data immediately
- Cron job failed and needs retry

### Option 2: Local Script (Development)

Run the ingestion script locally:

```bash
npx tsx scripts/ingest-players.ts
```

This is useful for:
- Testing ingestion logic changes
- Debugging data issues
- Initial database setup

## Environment Variables

Required in Vercel project settings:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `CRON_SECRET` | Authentication token for cron endpoint | Generate with `openssl rand -base64 32` |

## Data Sources

### FantasyCalc API

**Superflex Endpoint:**
```
https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5
```

**1QB Endpoint:**
```
https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=0.5
```

**Rate Limits:** None documented, but we fetch once per day to be respectful

## What Gets Updated

### Players Table
- `full_name` — Player name
- `position` — QB, RB, WR, TE, PICK
- `team` — Current NFL team
- `age` — Player age
- `years_exp` — Years of experience (for rookie identification)

### Player Values Table
- `fc_value_sf` / `fc_value_1qb` — Dynasty trade values
- `fc_rank_sf` / `fc_rank_1qb` — Overall dynasty ranks
- `fc_position_rank_sf` / `fc_position_rank_1qb` — Position ranks (e.g., RB5)
- `fc_combined_value` — Dynasty + redraft combined score
- `fc_trade_frequency` — How often player is traded
- `fc_trend_30_day` — Value change over last 30 days
- `redraft_value` — Redraft-only value

### Draft Picks
- All future picks (3 years, 5 rounds)
- Both specific picks (1.01, 1.02) and generic rounds (2026 1st)
- Valued separately for Superflex and 1QB formats

## Troubleshooting

### Cron job not running

1. Check `vercel.json` is deployed (commit and push)
2. Verify `CRON_SECRET` is set in Vercel environment variables
3. Check Vercel function logs for errors

### Data not updating

1. Check FantasyCalc API is responding: `curl https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=0.5`
2. Verify database connection in Vercel logs
3. Run manual ingestion to see detailed error messages

### Stale data after free agency

1. Trigger manual ingestion via `/api/ingest` endpoint
2. FantasyCalc may take 1-2 hours to update after major news
3. Check FantasyCalc website to confirm they've updated their data

## Future Enhancements

Potential improvements:
- Multiple daily updates during free agency periods
- Webhook triggers from FantasyCalc (if they add support)
- Slack/Discord notifications on ingestion completion
- Differential updates (only changed players) for faster execution
- Historical value tracking for trend analysis
