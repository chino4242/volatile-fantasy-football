#!/usr/bin/env python3
"""
Repair players.gsis_id using the authoritative nflreadpy roster, keyed on the
STABLE sleeper_id (not fuzzy names, which caused collisions like Bijan/Brian
Robinson and Justin/Jermar Jefferson).

Source of truth: union of nflreadpy rosters (recent seasons); most-recent season
wins per sleeper_id. Each players row whose sleeper_id has a known real gsis is
set to that gsis. Rows whose sleeper_id isn't in the roster union are left
untouched (keeps existing fallback/real value).

`gsis_id` is UNIQUE, so we apply in ONE transaction:
  1. snapshot current (sleeper_id, gsis_id) to players_gsis_backup
  2. NULL out gsis_id on every row we're about to reassign (clears collisions)
  3. set the correct gsis_id per sleeper_id

Dry-run by DEFAULT — prints the diff and changes NOTHING. Pass --apply to write.

Usage:
    python3 scripts/repair-gsis-mapping.py            # dry run (preview)
    python3 scripts/repair-gsis-mapping.py --apply     # write changes
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg2
import nflreadpy

load_dotenv(Path(__file__).parent.parent / ".env.local")
DATABASE_URL = os.getenv("DATABASE_URL")
APPLY = "--apply" in sys.argv
SEASONS = [2022, 2023, 2024, 2025, 2026]


def build_truth():
    """sleeper_id(str) -> (gsis_id, full_name), most-recent season wins."""
    ros = nflreadpy.load_rosters(SEASONS).to_pandas()
    ros = ros[ros["sleeper_id"].notna() & ros["gsis_id"].notna()]
    ros = ros[ros["gsis_id"].astype(str).str.startswith("00-")]
    ros = ros.sort_values("season")  # ascending → last write wins = newest
    ros["sleeper_id"] = ros["sleeper_id"].astype(str).str.replace(r"\.0$", "", regex=True)
    truth = {}
    for _, r in ros.iterrows():
        truth[r["sleeper_id"]] = (r["gsis_id"], r["full_name"])
    return truth


def main():
    print(f"{'APPLY' if APPLY else 'DRY-RUN'} — repairing players.gsis_id from nflreadpy rosters {SEASONS}\n")
    truth = build_truth()
    print(f"Authoritative sleeper->gsis mappings: {len(truth)}\n")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("SELECT sleeper_id, gsis_id, full_name FROM players")
    rows = cur.fetchall()

    # Decide the target gsis for each player from truth (keyed by sleeper_id).
    changes = []          # (sleeper_id, name, old_gsis, new_gsis)
    collisions_fixed = [] # subset where old gsis belonged to a different player
    for sleeper_id, old_gsis, name in rows:
        t = truth.get(str(sleeper_id))
        if not t:
            continue
        new_gsis, _ = t
        if new_gsis != old_gsis:
            changes.append((sleeper_id, name, old_gsis, new_gsis))

    # Identify true collisions: old_gsis currently maps (upstream) to a DIFFERENT
    # real player — the dangerous ones.
    gsis_to_truthname = {g: n for g, (n) in [(v[0], v[1]) for v in truth.values()]}
    for sleeper_id, name, old_gsis, new_gsis in changes:
        if old_gsis and old_gsis.startswith("00-"):
            upstream = gsis_to_truthname.get(old_gsis)
            if upstream and upstream != name:
                collisions_fixed.append((name, old_gsis, upstream, new_gsis))

    print(f"=== {len(changes)} players rows will get a new/corrected gsis_id ===")
    for sleeper_id, name, old_gsis, new_gsis in sorted(changes, key=lambda x: x[1])[:200]:
        print(f"  {name:<24} sleeper {sleeper_id:<7} {str(old_gsis):<16} -> {new_gsis}")

    print(f"\n=== of those, {len(collisions_fixed)} were DANGEROUS collisions (old gsis = another player) ===")
    for name, old_gsis, upstream, new_gsis in sorted(collisions_fixed):
        print(f"  '{name}' had {old_gsis} (really '{upstream}') -> now {new_gsis}")

    if not APPLY:
        print(f"\nDRY-RUN complete. {len(changes)} rows would change. Re-run with --apply to write.")
        cur.close(); conn.close()
        return

    # ---- APPLY (single transaction) ----
    try:
        # 1. snapshot
        cur.execute("""
            CREATE TABLE IF NOT EXISTS players_gsis_backup (
                sleeper_id text, gsis_id text, full_name text, backed_up_at timestamptz DEFAULT now()
            )""")
        cur.execute("INSERT INTO players_gsis_backup (sleeper_id, gsis_id, full_name) SELECT sleeper_id, gsis_id, full_name FROM players")

        # 2. Clear the way for reassignment. gsis_id is UNIQUE, so before we set
        #    the corrected values we must NULL that gsis wherever it currently
        #    lives — including players NOT in our change set who wrongly hold a
        #    target gsis (e.g. "Mike Washington" holding Malik Washington's id).
        #    We NULL:
        #      (a) every row we're reassigning (by sleeper_id), and
        #      (b) every row currently holding any NEW target gsis (by gsis_id).
        #    First release the FK from player_advanced_stats for all affected gsis.
        new_gsis_targets = [c[3] for c in changes if c[3]]
        old_gsis_vals = [c[2] for c in changes if c[2]]
        affected_gsis = list({*new_gsis_targets, *old_gsis_vals})
        cur.execute("UPDATE player_advanced_stats SET gsis_id = NULL WHERE gsis_id = ANY(%s)", (affected_gsis,))

        sids = [c[0] for c in changes]
        cur.execute("UPDATE players SET gsis_id = NULL WHERE sleeper_id = ANY(%s)", (sids,))
        # (b) anyone else still holding a target gsis (wrong owner, not in changes)
        cur.execute("UPDATE players SET gsis_id = NULL WHERE gsis_id = ANY(%s)", (new_gsis_targets,))

        # 3. set correct gsis per sleeper_id
        for sleeper_id, name, old_gsis, new_gsis in changes:
            cur.execute("UPDATE players SET gsis_id = %s WHERE sleeper_id = %s", (new_gsis, sleeper_id))

        conn.commit()
        print(f"\n✅ Applied {len(changes)} gsis corrections. Snapshot saved to players_gsis_backup.")
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Rolled back — no changes written. Error: {e}")
        raise
    finally:
        cur.close(); conn.close()


if __name__ == "__main__":
    main()
