#!/usr/bin/env python3
"""
Audit the players.gsis_id mapping against the authoritative nflreadpy roster
(gsis_id -> real name). Reports every players row whose assigned real GSIS id
(00-xxxxxxx) maps to a DIFFERENT player name upstream — i.e. a mislabeled/
mis-linked id like the Bijan/Brian Robinson case.

Read-only. Prints a report; does not modify the DB.

Usage: python3 scripts/audit-gsis-mapping.py [season]
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import nflreadpy

load_dotenv(Path(__file__).parent.parent / ".env.local")
DATABASE_URL = os.getenv("DATABASE_URL")

def norm(s: str) -> str:
    return (s or "").lower().replace("'", "").replace("-", "").replace(".", "") \
        .replace(" jr", "").replace(" sr", "").replace(" ii", "").replace(" iii", "").strip()

def main():
    season = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    print(f"Loading authoritative roster (gsis -> name) from nflreadpy, season {season}...")
    # Rosters carry gsis_id + full_name and are the source of truth.
    ros = nflreadpy.load_rosters([season]).to_pandas()
    gsis_col = "gsis_id" if "gsis_id" in ros.columns else ("player_id" if "player_id" in ros.columns else None)
    name_col = "full_name" if "full_name" in ros.columns else ("player_name" if "player_name" in ros.columns else None)
    gsis_to_name = {}
    for _, r in ros.iterrows():
        g = r.get(gsis_col); n = r.get(name_col)
        if isinstance(g, str) and g.startswith("00-") and isinstance(n, str):
            gsis_to_name[g] = n
    print(f"  {len(gsis_to_name)} gsis->name mappings")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT sleeper_id, gsis_id, full_name, position, team FROM players WHERE gsis_id LIKE '00-%'")
    rows = cur.fetchall()
    print(f"  {len(rows)} players rows with a real gsis_id\n")

    mismatches = []
    unknown = 0
    for sleeper_id, gsis, name, pos, team in rows:
        real = gsis_to_name.get(gsis)
        if real is None:
            unknown += 1
            continue
        if norm(real) != norm(name):
            mismatches.append((gsis, name, real, pos, team, sleeper_id))

    print(f"=== {len(mismatches)} MISMATCHED gsis assignments (db name != upstream name) ===")
    for gsis, dbname, real, pos, team, sid in sorted(mismatches, key=lambda x: x[1]):
        print(f"  {gsis}  db='{dbname}' ({pos} {team})  -> upstream='{real}'  [sleeper {sid}]")
    print(f"\n({unknown} gsis ids not found in {season} roster — retired/practice squad, not necessarily wrong)")
    cur.close(); conn.close()

if __name__ == "__main__":
    main()
