#!/bin/zsh
#
# refresh-data.sh — one local command to refresh EVERYTHING that can run
# unattended: current-season NFL stats (weekly + advanced) and the DB-backed
# leagues (Yahoo + MyFFPC). Safe to run on a schedule (launchd) — nothing here
# prompts for input.
#
#   ./scripts/refresh-data.sh              # current season (auto-detected)
#   ./scripts/refresh-data.sh 2026         # force a season
#
# Notes:
#  - Stats use nflreadpy (Python) and upsert per (player, season, week).
#  - Yahoo sync needs a fresh YAHOO_COOKIE; MyFFPC needs the logged-in
#    Playwright profile. When those go stale the sync fails GRACEFULLY (logged,
#    non-fatal) — re-auth interactively with `npm run leagues:refresh`.
#  - Each step is independent: one failing does not stop the others. The script
#    exits non-zero if ANY step failed, so a scheduler can surface problems.
#
set -u
cd "$(dirname "$0")/.."   # repo root

# Season: arg 1, else current year if we're in-season (Sep+), else last year.
if [[ $# -ge 1 ]]; then
    SEASON="$1"
else
    MONTH=$(date +%m)
    YEAR=$(date +%Y)
    if [[ "$MONTH" -ge 9 ]]; then SEASON="$YEAR"; else SEASON=$((YEAR - 1)); fi
fi

LOG_TS=$(date "+%Y-%m-%d %H:%M:%S")
echo "════════════════════════════════════════════════════════"
echo "  Volatile data refresh — season $SEASON — $LOG_TS"
echo "════════════════════════════════════════════════════════"

# Prefer a project venv python if present, else system python3.
if [[ -x ".venv/bin/python3" ]]; then PY=".venv/bin/python3"; else PY="python3"; fi

fail=0
run_step() {
    local label="$1"; shift
    echo "\n──── $label ────"
    if "$@"; then
        echo "✅ $label"
    else
        echo "❌ $label (continuing)"
        fail=1
    fi
}

run_step "Weekly stats ($SEASON)"    "$PY" scripts/ingest-weekly-stats-year.py "$SEASON"
run_step "Advanced stats ($SEASON)"  "$PY" scripts/ingest-advanced-stats.py "$SEASON"
run_step "Yahoo leagues"             npm run --silent yahoo:sync
run_step "MyFFPC leagues"            npm run --silent myffpc:sync

echo "\n════════════════════════════════════════════════════════"
echo "  Refresh done ($([ $fail -eq 0 ] && echo 'all steps OK' || echo 'some steps failed'))"
echo "════════════════════════════════════════════════════════"
exit $fail
