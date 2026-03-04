#!/usr/bin/env python3
"""
Ingest NFL weekly player stats from nfl_data_py into PostgreSQL.
Run: python scripts/ingest-nfl-stats-py.py
"""

import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values
import nfl_data_py as nfl
import pandas as pd

# Load environment variables
load_dotenv('.env.local')

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env.local")
    sys.exit(1)

def main():
    print("🏈 Fetching NFL weekly data from nfl_data_py...")
    
    # Fetch 2020-2024 weekly data (2025 not yet available)
    df = nfl.import_weekly_data([2020, 2021, 2022, 2023, 2024], columns=[
        'player_id',           # GSIS ID
        'player_name',
        'position',
        'season',
        'week',
        'targets',
        'receptions',
        'receiving_yards',
        'receiving_tds',
        'carries',
        'rushing_yards',
        'rushing_tds',
        'completions',
        'attempts',
        'passing_yards',
        'passing_tds',
        'interceptions',
        'target_share',
        'air_yards_share',
        'wopr',              # Weighted Opportunity Rating
        'racr',              # Receiver Air Conversion Ratio
        'fantasy_points',
        'fantasy_points_ppr',
    ])
    
    print(f"✓ Fetched {len(df)} player-week records")
    
    # Connect to database
    print("📊 Connecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Prepare data for insertion
    records = []
    for _, row in df.iterrows():
        records.append((
            row['player_id'],
            int(row['season']),
            int(row['week']) if pd.notna(row['week']) else None,
            int(row['targets']) if pd.notna(row['targets']) else None,
            int(row['receptions']) if pd.notna(row['receptions']) else None,
            int(row['receiving_yards']) if pd.notna(row['receiving_yards']) else None,
            int(row['receiving_tds']) if pd.notna(row['receiving_tds']) else None,
            int(row['carries']) if pd.notna(row['carries']) else None,
            int(row['rushing_yards']) if pd.notna(row['rushing_yards']) else None,
            int(row['rushing_tds']) if pd.notna(row['rushing_tds']) else None,
            int(row['completions']) if pd.notna(row['completions']) else None,
            int(row['attempts']) if pd.notna(row['attempts']) else None,
            int(row['passing_yards']) if pd.notna(row['passing_yards']) else None,
            int(row['passing_tds']) if pd.notna(row['passing_tds']) else None,
            int(row['interceptions']) if pd.notna(row['interceptions']) else None,
            float(row['target_share']) if pd.notna(row['target_share']) else None,
            float(row['air_yards_share']) if pd.notna(row['air_yards_share']) else None,
            float(row['wopr']) if pd.notna(row['wopr']) else None,
            float(row['racr']) if pd.notna(row['racr']) else None,
            float(row['fantasy_points']) if pd.notna(row['fantasy_points']) else None,
            float(row['fantasy_points_ppr']) if pd.notna(row['fantasy_points_ppr']) else None,
        ))
    
    print(f"💾 Inserting {len(records)} records into database...")
    
    # Batch insert with ON CONFLICT DO UPDATE
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
        records
    )
    
    conn.commit()
    cur.close()
    conn.close()
    
    print("✅ NFL stats ingestion complete!")
    print(f"   Total records: {len(records)}")

if __name__ == '__main__':
    main()
