"""
Ingest advanced NFL stats from nflreadpy into player_advanced_stats table.

Usage:
    python3 scripts/ingest-advanced-stats.py [season]
    python3 scripts/ingest-advanced-stats.py 2024
    python3 scripts/ingest-advanced-stats.py          # defaults to current year

Requires: pip install nflreadpy pandas psycopg2-binary python-dotenv
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env.local")

import nflreadpy
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env.local")
    sys.exit(1)


def get_season():
    if len(sys.argv) > 1:
        return int(sys.argv[1])
    from datetime import datetime
    # Default to previous season if before September, else current
    now = datetime.now()
    return now.year if now.month >= 9 else now.year - 1


def load_player_stats(season: int) -> pd.DataFrame:
    """Load season-level player stats."""
    print(f"  Loading player stats for {season}...")
    try:
        df = nflreadpy.load_player_stats([season], summary_level="reg").to_pandas()
        df = df[df["season_type"] == "REG"] if "season_type" in df.columns else df
        print(f"    {len(df)} player-season rows")
        return df
    except Exception as e:
        print(f"    WARNING: Failed to load player stats: {e}")
        return pd.DataFrame()


def load_ngs(season: int) -> dict:
    """Load Next Gen Stats for all stat types."""
    ngs = {}
    for stat_type in ["passing", "receiving", "rushing"]:
        try:
            print(f"  Loading NGS {stat_type} for {season}...")
            df = nflreadpy.load_nextgen_stats(stat_type=stat_type, seasons=[season]).to_pandas()
            # Filter to regular season and aggregate to season level
            if "season_type" in df.columns:
                df = df[df["season_type"] == "REG"]
            if "week" in df.columns and "player_display_name" in df.columns:
                # Average rate stats across weeks
                group_cols = ["player_display_name", "player_gsis_id"] if "player_gsis_id" in df.columns else ["player_display_name"]
                numeric_cols = df.select_dtypes(include="number").columns.tolist()
                numeric_cols = [c for c in numeric_cols if c not in ["week", "season"]]
                df = df.groupby(group_cols)[numeric_cols].mean().reset_index()
            ngs[stat_type] = df
            print(f"    {len(df)} rows")
        except Exception as e:
            print(f"    WARNING: Failed to load NGS {stat_type}: {e}")
            ngs[stat_type] = pd.DataFrame()
    return ngs


def load_snap_counts(season: int) -> pd.DataFrame:
    """Load snap count data, averaged across weeks."""
    try:
        print(f"  Loading snap counts for {season}...")
        df = nflreadpy.load_snap_counts(season).to_pandas()
        # Average snap pct across weeks per player
        if "offense_pct" in df.columns and "player" in df.columns:
            df = df.groupby(["player", "team", "position"]).agg(
                offense_pct=("offense_pct", "mean"),
                games=("offense_pct", "count")
            ).reset_index()
        print(f"    {len(df)} players")
        return df
    except Exception as e:
        print(f"    WARNING: Failed to load snap counts: {e}")
        return pd.DataFrame()


def load_pfr_stats(season: int) -> dict:
    """Load PFR advanced stats."""
    pfr = {}
    for stat_type in ["pass", "rec", "rush"]:
        try:
            print(f"  Loading PFR {stat_type} for {season}...")
            df = nflreadpy.load_pfr_advstats([season], stat_type=stat_type).to_pandas()
            pfr[stat_type] = df
            print(f"    {len(df)} rows")
        except Exception as e:
            print(f"    WARNING: Failed to load PFR {stat_type}: {e}")
            pfr[stat_type] = pd.DataFrame()
    return pfr


def build_player_records(season, stats_df, ngs, snaps_df, pfr):
    """Merge all data sources into unified player records."""
    records = []

    if stats_df.empty:
        print("  No player stats available — skipping")
        return records

    # Build NGS lookup by display name
    ngs_pass = {r.get("player_display_name", ""): r for _, r in ngs.get("passing", pd.DataFrame()).iterrows()} if not ngs.get("passing", pd.DataFrame()).empty else {}
    ngs_rec = {r.get("player_display_name", ""): r for _, r in ngs.get("receiving", pd.DataFrame()).iterrows()} if not ngs.get("receiving", pd.DataFrame()).empty else {}
    ngs_rush = {r.get("player_display_name", ""): r for _, r in ngs.get("rushing", pd.DataFrame()).iterrows()} if not ngs.get("rushing", pd.DataFrame()).empty else {}

    # Snap count lookup by player name
    snap_lookup = {}
    if not snaps_df.empty:
        for _, r in snaps_df.iterrows():
            snap_lookup[r.get("player", "")] = r

    for _, row in stats_df.iterrows():
        pos = row.get("position")
        # Include standard fantasy positions + any player with receiving/rushing stats
        # (handles two-way players like Travis Hunter listed as CB/DB)
        if pos not in ("QB", "RB", "WR", "TE"):
            # Check if they have fantasy-relevant stats (targets or carries)
            targets = row.get("targets") or 0
            carries = row.get("carries") or 0
            if targets < 10 and carries < 10:
                continue
            # Override position to WR/RB based on usage
            pos = "WR" if targets > carries else "RB"

        name = row.get("player_display_name", "")
        gsis_id = row.get("player_id") or row.get("gsis_id")

        # Basic stats
        rec = {
            "gsis_id": gsis_id,
            "full_name": name,
            "position": pos,
            "team": row.get("recent_team") or row.get("team"),
            "season": season,
            "games_played": safe_int(row.get("games")),
            "fantasy_points_ppr": safe_float(row.get("fantasy_points_ppr")),
            "targets": safe_int(row.get("targets")),
            "receptions": safe_int(row.get("receptions")),
            "receiving_yards": safe_int(row.get("receiving_yards")),
            "receiving_tds": safe_int(row.get("receiving_tds")),
            "carries": safe_int(row.get("carries")),
            "rushing_yards": safe_int(row.get("rushing_yards")),
            "rushing_tds": safe_int(row.get("rushing_tds")),
            "completions": safe_int(row.get("completions")),
            "passing_attempts": safe_int(row.get("attempts")),
            "passing_yards": safe_int(row.get("passing_yards")),
            "passing_tds": safe_int(row.get("passing_tds")),
            "interceptions": safe_int(row.get("interceptions")),
            "target_share": safe_float(row.get("target_share")),
            "wopr": safe_float(row.get("wopr")),
        }

        # NGS — Passing
        if pos == "QB" and name in ngs_pass:
            n = ngs_pass[name]
            rec["avg_time_to_throw"] = safe_float(n.get("avg_time_to_throw"))
            rec["avg_intended_air_yards"] = safe_float(n.get("avg_intended_air_yards"))
            rec["aggressiveness"] = safe_float(n.get("aggressiveness"))
            rec["completion_pct_above_expected"] = safe_float(n.get("completion_percentage_above_expectation"))
            rec["avg_air_yards_differential"] = safe_float(n.get("avg_air_yards_differential"))

        # NGS — Receiving
        if pos in ("WR", "TE", "RB") and name in ngs_rec:
            n = ngs_rec[name]
            rec["avg_cushion"] = safe_float(n.get("avg_cushion"))
            rec["avg_separation"] = safe_float(n.get("avg_separation"))
            rec["avg_intended_air_yards_rec"] = safe_float(n.get("avg_intended_air_yards"))
            rec["pct_share_intended_air_yards"] = safe_float(n.get("percent_share_of_intended_air_yards"))
            rec["avg_yac"] = safe_float(n.get("avg_yac"))
            rec["avg_yac_above_expectation"] = safe_float(n.get("avg_yac_above_expectation"))

        # NGS — Rushing
        if pos in ("RB", "QB") and name in ngs_rush:
            n = ngs_rush[name]
            rec["rush_efficiency"] = safe_float(n.get("efficiency"))
            rec["avg_time_to_los"] = safe_float(n.get("avg_time_to_los"))
            rec["rush_yards_over_expected"] = safe_float(n.get("rush_yards_over_expected"))
            rec["rush_yards_over_expected_per_att"] = safe_float(n.get("rush_yards_over_expected_per_att"))

        # Snap counts
        snap = snap_lookup.get(name)
        if snap is not None:
            rec["offense_snap_pct"] = safe_float(snap.get("offense_pct"))

        records.append(rec)

    print(f"  Built {len(records)} player records")
    return records


def safe_float(val):
    """Convert to float, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return round(f, 4)
    except (ValueError, TypeError):
        return None


def safe_int(val):
    """Convert to int, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        if pd.isna(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def resolve_sleeper_ids(conn, records):
    """Match gsis_id to sleeper_id from the players table. Falls back to name matching."""
    cur = conn.cursor()

    # Primary: match by gsis_id
    cur.execute("SELECT gsis_id, sleeper_id FROM players WHERE gsis_id IS NOT NULL")
    gsis_to_sleeper = {r[0]: r[1] for r in cur.fetchall()}

    # Fallback: match by name (normalized)
    cur.execute("SELECT full_name, sleeper_id FROM players WHERE position IN ('QB', 'RB', 'WR', 'TE')")
    name_to_sleeper = {}
    for r in cur.fetchall():
        normalized = r[0].lower().replace("'", "").replace("-", "").replace(".", "").replace(" jr", "").replace(" sr", "").replace(" ii", "").replace(" iii", "").strip()
        name_to_sleeper[normalized] = r[1]
    cur.close()

    matched_gsis = 0
    matched_name = 0
    for rec in records:
        gsis = rec.get("gsis_id")
        if gsis and gsis in gsis_to_sleeper:
            rec["sleeper_id"] = gsis_to_sleeper[gsis]
            matched_gsis += 1
        else:
            # Try name fallback
            name = rec.get("full_name", "")
            normalized = name.lower().replace("'", "").replace("-", "").replace(".", "").replace(" jr", "").replace(" sr", "").replace(" ii", "").replace(" iii", "").strip()
            if normalized in name_to_sleeper:
                rec["sleeper_id"] = name_to_sleeper[normalized]
                matched_name += 1
            else:
                rec["sleeper_id"] = None
            rec["gsis_id"] = None  # Clear gsis_id if not in our players table (FK constraint)

    print(f"  Matched {matched_gsis}/{len(records)} via gsis_id, {matched_name} via name fallback ({matched_gsis + matched_name} total)")
    return records


def upsert_records(conn, records, season):
    """Upsert records into player_advanced_stats."""
    if not records:
        return

    cur = conn.cursor()

    # Delete existing records for this season
    cur.execute("DELETE FROM player_advanced_stats WHERE season = %s", (season,))
    print(f"  Cleared existing {season} records")

    # Insert columns
    columns = [
        "gsis_id", "sleeper_id", "full_name", "position", "team", "season",
        "games_played", "fantasy_points_ppr", "targets", "receptions",
        "receiving_yards", "receiving_tds", "carries", "rushing_yards", "rushing_tds",
        "completions", "passing_attempts", "passing_yards", "passing_tds", "interceptions",
        "target_share", "wopr",
        "avg_time_to_throw", "avg_intended_air_yards", "aggressiveness",
        "completion_pct_above_expected", "avg_air_yards_differential",
        "avg_cushion", "avg_separation", "avg_intended_air_yards_rec",
        "pct_share_intended_air_yards", "avg_yac", "avg_yac_above_expectation",
        "rush_efficiency", "avg_time_to_los", "rush_yards_over_expected",
        "rush_yards_over_expected_per_att", "offense_snap_pct",
        "receiving_broken_tackles", "receiving_drop_pct",
        "rushing_broken_tackles", "passing_bad_throw_pct",
        "times_pressured", "times_blitzed",
    ]

    values = []
    for rec in records:
        values.append(tuple(rec.get(col) for col in columns))

    insert_sql = f"""
        INSERT INTO player_advanced_stats ({', '.join(columns)})
        VALUES %s
    """
    execute_values(cur, insert_sql, values)
    conn.commit()
    cur.close()
    print(f"  ✅ Inserted {len(values)} records for {season}")


def main():
    season = get_season()
    print(f"🏈 Ingesting advanced stats for {season} season")
    print()

    # Load all data sources
    stats_df = load_player_stats(season)
    ngs = load_ngs(season)
    snaps_df = load_snap_counts(season)
    pfr = load_pfr_stats(season)

    # Build unified records
    print("\nBuilding player records...")
    records = build_player_records(season, stats_df, ngs, snaps_df, pfr)

    if not records:
        print("No records to insert")
        sys.exit(0)

    # Connect to DB and resolve sleeper_ids
    print("\nConnecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    records = resolve_sleeper_ids(conn, records)

    # Upsert
    print(f"\nUpserting {len(records)} records...")
    upsert_records(conn, records, season)
    conn.close()

    print(f"\n✅ Done! {len(records)} players with advanced stats for {season}")


if __name__ == "__main__":
    main()
