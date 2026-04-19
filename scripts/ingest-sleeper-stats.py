#!/usr/bin/env python3
"""
Ingest NFL weekly stats from Sleeper API into PostgreSQL.
Usage: python3 scripts/ingest-sleeper-stats.py [season]
Default season: 2025
"""

import os, sys, json, urllib.request
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values

load_dotenv('.env.local')
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("Error: DATABASE_URL not found"); sys.exit(1)

SEASON = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

def fetch_week(season, week):
    url = f'https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week}'
    try:
        data = json.loads(urllib.request.urlopen(url).read())
        return data if isinstance(data, dict) else {}
    except:
        return {}

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # Build sleeper_id -> gsis_id map from players table
    cur.execute("SELECT sleeper_id, gsis_id FROM players WHERE gsis_id IS NOT NULL")
    sleeper_to_gsis = dict(cur.fetchall())

    # Also build a reverse map for players without gsis_id — we'll use sleeper_id as fallback
    cur.execute("SELECT sleeper_id FROM players WHERE gsis_id IS NULL")
    no_gsis = set(row[0] for row in cur.fetchall())

    print(f"🏈 Ingesting {SEASON} stats from Sleeper API...")
    total_inserted = 0

    for week in range(1, 19):
        data = fetch_week(SEASON, week)
        if not data:
            print(f"  Week {week}: no data, stopping")
            break

        rows = []
        for sleeper_id, stats in data.items():
            gsis_id = sleeper_to_gsis.get(sleeper_id)
            if not gsis_id:
                # Use sleeper_id as gsis_id fallback for players without one
                if sleeper_id in no_gsis:
                    gsis_id = f"sleeper_{sleeper_id}"
                else:
                    continue

            if not stats.get('gp'):
                continue  # didn't play

            rows.append((
                gsis_id, SEASON, week,
                stats.get('rec_tgt'), stats.get('rec'), stats.get('rec_yd'), stats.get('rec_td'),
                stats.get('rush_att'), stats.get('rush_yd'), stats.get('rush_td'),
                stats.get('pass_cmp', stats.get('completions')), stats.get('pass_att', stats.get('attempts')),
                stats.get('pass_yd'), stats.get('pass_td'), stats.get('pass_int'),
                stats.get('pts_ppr'), stats.get('pts_half_ppr'),
            ))

        if rows:
            execute_values(cur, """
                INSERT INTO weekly_player_stats (gsis_id, season, week, targets, receptions, receiving_yards, receiving_tds, carries, rushing_yards, rushing_tds, completions, attempts, passing_yards, passing_tds, interceptions, fantasy_points_ppr, fantasy_points)
                VALUES %s
                ON CONFLICT (gsis_id, season, week) DO UPDATE SET
                    targets = EXCLUDED.targets, receptions = EXCLUDED.receptions,
                    receiving_yards = EXCLUDED.receiving_yards, receiving_tds = EXCLUDED.receiving_tds,
                    carries = EXCLUDED.carries, rushing_yards = EXCLUDED.rushing_yards, rushing_tds = EXCLUDED.rushing_tds,
                    completions = EXCLUDED.completions, attempts = EXCLUDED.attempts,
                    passing_yards = EXCLUDED.passing_yards, passing_tds = EXCLUDED.passing_tds, interceptions = EXCLUDED.interceptions,
                    fantasy_points_ppr = EXCLUDED.fantasy_points_ppr, fantasy_points = EXCLUDED.fantasy_points
            """, rows)
            conn.commit()
            total_inserted += len(rows)
            print(f"  Week {week}: {len(rows)} players")
        else:
            print(f"  Week {week}: no matching players, stopping")
            break

    # Update gsis_id for players that used the fallback
    cur.execute("""
        UPDATE players SET gsis_id = 'sleeper_' || sleeper_id
        WHERE gsis_id IS NULL AND sleeper_id IN (
            SELECT REPLACE(gsis_id, 'sleeper_', '') FROM weekly_player_stats WHERE gsis_id LIKE 'sleeper_%%' AND season = %s
        )
    """, (SEASON,))
    updated = cur.rowcount
    conn.commit()

    print(f"\n✅ Done: {total_inserted} stat rows inserted for {SEASON}")
    if updated: print(f"   {updated} players got gsis_id linked")
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
