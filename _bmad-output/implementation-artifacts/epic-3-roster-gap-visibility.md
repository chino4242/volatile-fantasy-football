# Epic 3: Roster Gap Visibility

Status: ready-for-dev (Stories 3.1 to 3.3). Story 3.4 is parked in backlog.

## Epic Goal

For any one league, let Chino see in a single glance **how each of his starters ranks against everyone in the NFL and against the best free agent at the same position**, this week and rest-of-season (ROS). The view shows where a gap exists. When a gap is worth acting on, it says how to close it. When no action is needed, it says so plainly ("your K is #5, best available is #12, no action").

## Problem

The engines that compare free agents to a roster already exist (`waiver-upgrades`, `waiver-value`, `stream`/`stream-k`, `transaction-suggestions`). The results are hard to use:

- Results are capped and filtered, so "nothing shown" looks the same as "nothing exists".
- There is no context. A suggestion appears without showing where the current player ranks, so Chino cannot tell a big gap from a small one.
- This week and ROS come from different engines and are never shown side by side.
- Kicker and defense results depend on weekly CSV uploads. When the upload is missing or stale, the app is silent instead of saying so.

## Design principles (apply to every story)

- **Gap, not list.** The primary object is a slot-by-slot comparison (my player's rank vs best available's rank), not a flat list of pickups.
- **Silence is a result.** "No action needed" is shown as one quiet line with the numbers behind it. Nothing in this epic may add alerts, badges, or banners for non-actionable states.
- **Noise budget.** Default view shows only slots where an action is warranted, and every other slot is a collapsed one-line row. A gap is "actionable" only past a threshold that lives in one named constant per position group (see Story 3.1). No new badges on the Action Center and no new notification styles.
- **One league at a time.** The primary surface is the existing per-league team page, next to the lineup optimizer. Cross-league views come last and are optional.
- **Consultant, not controller.** The app advises and deep-links to the platform. It never executes an add or drop (same rule as Epic 2).
- **Reuse, don't reinvent.** Recommendations reuse `findWaiverUpgrades` (its safe/caution/block drop tiers via `blendedKeepValue`) and `optimizeAndDiff`. The new work is the comparison layer and its presentation.

## Stories

1. **3.1 — Slot gap engine + per-team Gap view** (QB/RB/WR/TE/K slots; pure lib + tests, then the team-page card on Sleeper, Fleaflicker and Yahoo/MyFFPC). Core of the epic.
2. **3.2 — Kicker and defense gap clarity.** Adds DEF, pool size ("#5 of 32"), unranked wording, an upload-freshness warning, and fixes defense identity on the Sleeper and Fleaflicker team pages.
3. **3.3 — "Roster move" in the lineup optimizer.** Combines start/bench swaps with the pickup that makes them possible. Also makes the team-page optimizer aware of games already started.
4. **3.4 — Cross-league gap summary (optional, lowest priority).** One quiet line per league on the portfolio hub. Parked.

Suggested build order: 3.1 → 3.2 → 3.3 → 3.4. Story 3.4 should be re-evaluated after 3.1–3.3 ship, because Chino works one league at a time and is actively trying to reduce app noise.

## Open questions (assumed answers in the stories, confirm during review)

- **Gap thresholds.** Starting values are in Story 3.1 and are tunable constants. Chino to confirm after seeing real data.
- **"Better" for ROS.** Assumed ROS rank (`rosPosRank`, with `rosRank` as tiebreak), consistent with the All Players page. ROS PPG is shown as a supporting number only.
- **Dynasty and keeper leagues.** Gap view is shown for all league types, but the "how to address" suggestions keep the existing drop guardrails, so a valuable dynasty asset is never suggested as a drop.

## Out of scope

- FAAB/waiver-priority bid suggestions.
- Executing adds or drops in-app.
- Changes to the Action Center's visual noise (separate effort; this epic must not add to it).
- Roster-wide (bench) gap analysis beyond what the optimizer already reports. v1 covers starting slots plus the best bench option per position.
- New data sources. Everything uses ranks the app already stores.
