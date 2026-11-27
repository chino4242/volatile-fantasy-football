# Deferred Work

## Deferred from: code review (2026-11-25)

**Story 3-1 (code review of 3-1-slot-gap-engine-and-team-gap-view)**
- Started-game locking can lock every player when the ESPN scoreboard has not rolled to the new week as the next week's rankings are uploaded (about Tuesday to Wednesday). Same behavior in the portfolio hub and Action Center. A fix would compare the scoreboard week to the ranking week. (`src/lib/nfl-live.ts`)
- An empty slot is never actionable on the ROS horizon (needs my player's position). Negligible; weekly covers empty slots. (`src/lib/slot-gaps.ts#rosHorizon`)
- No automated tests for database-bound helpers (`getTeamSlotGaps`, `weeklyRankedCandidates`, page wiring); the repo has no database test harness.

**Story 3-2 (code review of 3-2-kicker-and-defense-gap-clarity)**
- No automated tests for `getWeeklyKindStatus` queries or the page wiring. Fleaflicker name matching was verified live on 22 of 22 rostered defenses.

**Story 4-1 (code review of 4-1-rankings-replace-on-upload)**
- The rankings upload route is not atomic (history insert, rank updates, clear are separate statements); a mid-way failure leaves a partial result and a retry re-archives. Pre-existing design.
- Cleared `rank_ros_ppg`, `ros_sos`, `ros_next4_sos`, `bye_week` and `redraft_auction_value` are not archived because `rankings_history` stores only overall, position rank and tier. Needs a schema change.
