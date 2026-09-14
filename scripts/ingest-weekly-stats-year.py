#!/usr/bin/env python3
"""
Ingest per-week NFL player stats for a single season into weekly_player_stats,
using nflreadpy (maintained successor to nfl_data_py). Safe upsert via
ON CONFLICT (gsis_id, season, week) DO UPDATE — reruns just refresh the week.

Usage:
    python3 scripts/ingest-weekly-stats-year.py 2026
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values
import nflreadpy
import pandas as pd

load_dotenv(Path(__file__).parent.parent / ".env.local")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env.local")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/ingest-weekly-stats-year.py <season>")
        sys.exit(1)
    season = int(sys.argv[1])
    print(f"🏈 Fetching weekly stats for {season} via nflreadpy...")

    df = nflreadpy.load_player_stats([season], summary_level="week").to_pandas()
    if "season_type" in df.columns:
        df = df[df["season_type"] == "REG"]
    print(f"✓ {len(df)} player-week rows; weeks present: {sorted(df['week'].dropna().unique().tolist())}")

    if df.empty:
        print("No rows upstream — nothing to insert.")
        return

    def gi(row, col):
        v = row.get(col)
        return int(v) if pd.notna(v) else None

    def gf(row, col):
        v = row.get(col)
        return float(v) if pd.notna(v) else None

    records = []
    for _, row in df.iterrows():
        gsis = row.get("player_id")
        if not gsis or pd.isna(row.get("week")):
            continue
        records.append((
            gsis,
            int(row["season"]),
            int(row["week"]),
            gi(row, "targets"),
            gi(row, "receptions"),
            gi(row, "receiving_yards"),
            gi(row, "receiving_tds"),
            gi(row, "carries"),
            gi(row, "rushing_yards"),
            gi(row, "rushing_tds"),
            gi(row, "completions"),
            gi(row, "attempts"),
            gi(row, "passing_yards"),
            gi(row, "passing_tds"),
            gi(row, "passing_interceptions"),  # nflreadpy renamed from `interceptions`
            gf(row, "target_share"),
            gf(row, "air_yards_share"),
            gf(row, "wopr"),
            gf(row, "racr"),
            gf(row, "fantasy_points"),
            gf(row, "fantasy_points_ppr"),
        ))

    print(f"💾 Upserting {len(records)} records...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    execute_values(
        cur,
        """
        INSERT INTO weekly_player_stats (
            gsis_id, season, week,
            targets, receptions, receiving_yards, receiving_tds,
            carries, rushing_yards, rushing_tds,
            completions, attempts, passing_yards, passing_tds, interceptions,
            target_share, air_yards_share, wopr, racr,
            fantasy_points, fantasy_points_ppr
        ) VALUES %s
        ON CONFLICT (gsis_id, season, week)
        DO UPDATE SET
            targets = EXCLUDED.targets,
            receptions = EXCLUDED.receptions,
            receiving_yards = EXCLUDED.receiving_yards,
            receiving_tds = EXCLUDED.receiving_tds,
            carries = EXCLUDED.carries,
            rushing_yards = EXCLUDED.rushing_yards,
            rushing_tds = EXCLUDED.rushing_tds,
            completions = EXCLUDED.completions,
            attempts = EXCLUDED.attempts,
            passing_yards = EXCLUDED.passing_yards,
            passing_tds = EXCLUDED.passing_tds,
            interceptions = EXCLUDED.interceptions,
            target_share = EXCLUDED.target_share,
            air_yards_share = EXCLUDED.air_yards_share,
            wopr = EXCLUDED.wopr,
            racr = EXCLUDED.racr,
            fantasy_points = EXCLUDED.fantasy_points,
            fantasy_points_ppr = EXCLUDED.fantasy_points_ppr,
            updated_at = NOW()
        """,
        records,
    )
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Done — {len(records)} weekly records for {season}")


if __name__ == "__main__":
    main()
