# Scheduled local data refresh (macOS `launchd`)

Runs `scripts/refresh-data.sh` automatically on a weekly schedule, on **your
Mac** — no Vercel cron (Python + browser syncs can't run on Vercel serverless,
and the Hobby tier caps crons at 2 anyway).

## What it refreshes (all unattended)

| Step | Script | Needs |
|------|--------|-------|
| Weekly NFL stats (current season) | `ingest-weekly-stats-year.py` | Python + `nflreadpy` |
| Advanced/NGS stats (current season) | `ingest-advanced-stats.py` | Python + `nflreadpy` |
| Yahoo leagues | `npm run yahoo:sync` | fresh `YAHOO_COOKIE` |
| MyFFPC leagues | `npm run myffpc:sync` | logged-in Playwright profile |

Each step is independent — one failing doesn't stop the rest. When the Yahoo
cookie or MyFFPC profile goes stale, those steps fail *gracefully* (logged, the
job still exits and stats still update). Re-authenticate interactively with:

```bash
npm run leagues:refresh   # opens a browser, you log in, then it syncs
```

## Run manually anytime

```bash
npm run refresh:data            # current season, everything
./scripts/refresh-data.sh 2026  # force a season
```

## Install the weekly schedule (Tuesday 06:00)

The plist ships with this repo's absolute path baked in. If your repo lives
elsewhere, edit `WorkingDirectory` and the two `*Path` log lines first.

```bash
cp scripts/launchd/com.volatile.refresh-data.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.volatile.refresh-data.plist
launchctl start com.volatile.refresh-data      # optional: run once now to test
```

Check it's registered:

```bash
launchctl list | grep com.volatile.refresh-data
```

Logs land in `scripts/launchd/refresh*.log` (gitignored).

## Change the schedule

Edit `StartCalendarInterval` in the plist (`Weekday` 0=Sun…6=Sat, plus
`Hour`/`Minute`), then reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.volatile.refresh-data.plist
launchctl load   ~/Library/LaunchAgents/com.volatile.refresh-data.plist
```

## Uninstall

```bash
launchctl unload ~/Library/LaunchAgents/com.volatile.refresh-data.plist
rm ~/Library/LaunchAgents/com.volatile.refresh-data.plist
```

> Note: the job only runs while your Mac is powered on. If it was asleep at the
> scheduled time, `launchd` runs it at the next wake.
