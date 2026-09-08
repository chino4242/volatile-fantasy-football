# Story 1.1: Game-Day Rooting Guide

Status: ready-for-dev

## Story

As Chino, a multi-league fantasy manager,
I want a portfolio-wide page that lists every real NFL game for the current week and, within each game, shows which **starting** players I'm rooting FOR (on my teams) and which are AGAINST me (in my head-to-head opponent's starting lineup) across all my leagues,
so that on game day I have a single companion screen telling me exactly who to root for and against in each live game — with overlaps made explicit (the same NFL player can be for me in one league and against me in another).

## Context & Intent

- New page. Game-watching companion (open it during the 1pm slate and know your rooting interests per game).
- **Starters only** on both sides — a benched player has no rooting interest.
- **"Against me" = my head-to-head opponent that week**, not every rival roster. One opponent per league per week; use their **starting lineup**.
- **Current NFL week** only.
- **All four platforms** day one. Priority/confidence order: Fleaflicker → Sleeper → Yahoo → MyFFPC.
- Overlap is expected and must be shown: a player can appear as FOR (my team in league A) and AGAINST (opponent in league B) simultaneously. Aggregate the counts.

## Acceptance Criteria

1. A new route renders a list of NFL games for the current week, each game showing the two NFL teams (e.g. "DET @ GB").
2. Only games in which I have at least one rooting interest (a started player on either side, in any of my leagues) appear. Games with no interest are omitted (or clearly separated).
3. Within each game, every relevant **started** player is listed with: player name, NFL team, position, and a FOR / AGAINST indicator.
4. FOR = the player is in a starting lineup on one of MY teams that week. AGAINST = the player is in my weekly head-to-head OPPONENT's starting lineup, in one of my leagues.
5. Overlap is represented: a player who is both FOR and AGAINST shows both, with the count of leagues on each side (e.g. "FOR ×2 · AGAINST ×1") and which leagues.
6. Players are grouped by their NFL game and, within a game, by their NFL team (so both sides of the real matchup are visible).
7. Works across all four platforms; a platform whose weekly H2H/starter data is unavailable is skipped gracefully (its leagues simply contribute nothing) without breaking the page.
8. The page states which NFL week it is showing.

## The Core Data Problem (read first)

The rooting guide is a **join of three things per league**:
1. **My starting lineup** this week.
2. **My H2H opponent's starting lineup** this week.
3. **Which real NFL game** each started player is in (NFL team + opponent).

(1) and (2) require **weekly head-to-head matchup data + locked weekly starters**, which each platform exposes differently. (3) requires grouping players into NFL games. This is the make-or-break; per-platform availability below.

### NFL game grouping (3) — SOLVED via weekly_rankings
`weekly_rankings` (populated by the admin weekly upload) has `team`, `opponent`, and `sleeper_id` per player for a week. Two players are in the same NFL game if `{team, opponent}` matches (unordered pair). Use this to (a) build the game list and (b) label each started player's NFL game. Get the current week via `getLatestWeek()` in `src/lib/weekly-rankings.ts`. A started player with no `weekly_rankings` row (e.g. K/DEF not uploaded) still needs a game — see Dev Notes for the DEF/team fallback.

### Per-platform matchup + starter sourcing (1) & (2)

| Platform | Weekly H2H opponent | Weekly starters | Status |
|---|---|---|---|
| **Fleaflicker** | boxscore game (home vs away) | boxscore START group | **READY (API-verified)** — `FetchLeagueScoreboard?scoring_period={week}` returns `games[]` each with `home.id`/`away.id` (the H2H pairing); `FetchLeagueBoxscore` START group gives per-side starters. Reuse/extend `getFleaflickerWeekLineups(leagueId, week)` in `src/lib/fleaflicker.ts`. |
| **Sleeper** | `/league/{id}/matchups/{week}` — the 2 entries sharing a `matchup_id` are the H2H pair | same endpoint: each entry's `starters[]` (sleeper_ids; DEF as team abbr e.g. "DEN") | **READY (API-verified)** — one new getter `getSleeperMatchups(leagueId, week)`. Verified: 12 entries → 6 matchups; each entry `{ roster_id, matchup_id, starters[] }`. Pair the two roster_ids with the same matchup_id; mine = the roster matching my saved team, opponent = the other. |
| **Yahoo** | scrape matchup — SetLineup page shows "Current Matchup: vs {TeamName}" (seen in `.team-name-opponents`) | roster page `is_starter` (already scraped) BUT it's the season lineup, acceptable for v1 | **NEW SCRAPE** — extend `src/lib/yahoo.ts` to capture the current-week opponent team from the matchup/scoreboard page. Starters already available via existing `is_starter`. |
| **MyFFPC** | scrape — SetLineup HTML has "Current Matchup: vs {TeamName}" (confirmed in earlier scrape) | roster page starters (already scraped, `is_starter`) | **NEW SCRAPE** — parse the "Current Matchup" opponent from the SetLineup page; map to the opponent's viewingTeam and read that team's starters. |

**API verification (2026-08-27):** probed live. Sleeper `/league/1200992049558454272/matchups/1` → 200, 12 entries, 6 matchup_id pairs, each with `starters[]`. Fleaflicker `FetchLeagueScoreboard` (197269) → 5 games with home/away ids + boxscore START slots. **Both priority platforms are pure API — no scraping.** Only Yahoo/MyFFPC require scraping.

**Build order within this story:** Fleaflicker + Sleeper first (API-based, low risk, cover the two priority platforms), then Yahoo + MyFFPC (scrape-based). Each platform contributes independently; a platform that can't resolve a matchup is skipped (AC #7).

**"My team" per league**: reuse the existing `useMyTeams` hook (`src/hooks/useMyTeams.tsx`, key `platform:leagueId → rosterId`). The rooting guide needs to know which side of each matchup is mine → the one whose rosterId matches my saved team. If "my team" isn't set for a league, that league can't contribute (surface a hint to set it, mirroring the portfolio page).

## Tasks / Subtasks

- [ ] **Task 1 — Shared rooting-guide engine + contract** (AC: 1,3,4,5,6)
  - [ ] Create `src/lib/rooting-guide.ts` with types: `RootingPlayer { sleeper_id, full_name, position, nflTeam, side: 'for'|'against'|'both', forLeagues: string[], againstLeagues: string[] }`, `RootingGame { gameKey, teamA, teamB, players: RootingPlayer[] }`, `RootingGuide { week, games: RootingGame[] }`.
  - [ ] Pure aggregation fn: given a list of per-league `{ myStarterIds: string[], oppStarterIds: string[], leagueName }` + the weekly game/team lookup (from `weekly_rankings`), produce the deduped, overlap-aware `RootingGuide`. A player's `side` is 'both' if in both a my-list and an opp-list across leagues; counts come from `forLeagues`/`againstLeagues`.
  - [ ] Group players into NFL games via `weekly_rankings.team`/`opponent` (unordered pair = gameKey). Unit-test this pure fn (mirror `src/__tests__/lib/lineup-optimizer.test.ts` style) — cover overlap (for+against), multi-league counts, and game grouping.

- [ ] **Task 2 — Weekly matchup resolvers per platform** (AC: 4,7)
  - [ ] Sleeper: add `getSleeperMatchups(leagueId, week)` → returns pairs `{ rosterId, starters[] }` grouped by `matchup_id`. Cache like other sleeper getters (`cache` + `TTL.LEAGUE_DATA`).
  - [ ] Fleaflicker: add a helper (or extend `getFleaflickerWeekLineups`) that returns the H2H pairing per game (home teamId ↔ away teamId) alongside the START starter pro-ids. Note FF starters are **pro-player ids** → map to sleeper_id via `cleanseName` name-bridge (see `buildFleaflicker` in `src/app/api/portfolio/league/route.ts` for the exact bridge pattern).
  - [ ] Yahoo: extend `src/lib/yahoo.ts` to scrape the current-week opponent team for a given team (matchup/scoreboard page or the "Current Matchup" text on SetLineup). Starters come from existing `is_starter`.
  - [ ] MyFFPC: parse "Current Matchup: vs {TeamName}" from the SetLineup HTML (already fetched in the myffpc sync/reader path), resolve the opponent's viewingTeam, read that team's starters.
  - [ ] Each resolver returns the normalized `{ myStarterIds, oppStarterIds, leagueName }` for a league given "my" rosterId + week; returns null if it can't resolve (→ league skipped).

- [ ] **Task 3 — API route** (AC: 1,2,7,8)
  - [ ] `GET /api/portfolio/rooting-guide` (or accept the league refs like `/api/portfolio/league` does). It must enumerate the user's leagues across all 4 platforms. Reuse the enumeration pattern from `src/app/portfolio/page.tsx` (Sleeper live via `sleeperUserId`, FF from auth ids, Yahoo/MyFFPC from list APIs) — but membership is client-side. Decide: either (a) client passes the league refs + my-team ids to the route (like the portfolio page passes refs), or (b) a POST body of refs. Follow the existing portfolio Option-A pattern (client enumerates, route resolves per league).
  - [ ] For each league: resolve my-team + opponent starters (Task 2), collect. Then run the Task 1 engine with the current-week `weekly_rankings` game/team lookup. Return `RootingGuide`.
  - [ ] Current week = `getLatestWeek()`. If no weekly rankings exist, the game grouping can't be built → return an empty guide with a clear reason (AC #8).

- [ ] **Task 4 — The page** (AC: 1,2,3,5,6,8)
  - [ ] New route `src/app/portfolio/game-day/page.tsx` (client component). Enumerate leagues (reuse portfolio page pattern) + read `useMyTeams`. Call the route. Render games as cards; within each, the two NFL teams as columns/sections, players listed with FOR (green) / AGAINST (red) / BOTH (both badges) + league counts (e.g. "FOR ×2 · AGAINST ×1"), tooltip/subtext listing the leagues.
  - [ ] Add a nav link from the portfolio page and/or home header (a "Game Day" CTA).
  - [ ] Empty/loading states: no weekly rankings → "upload this week's rankings"; my-team unset for a league → hint to set it.

- [ ] **Task 5 — Verify** (AC: all)
  - [ ] Unit tests for the Task 1 engine (overlap, counts, grouping) pass.
  - [ ] `npx next build` clean.
  - [ ] Spot-check with a script against real data (Fleaflicker 197269 + a Sleeper league + Yahoo 853810): confirm a known player shows on the correct side(s). Remove the script after.

## Dev Notes

### Reuse — do NOT reinvent
- **Weekly week + game data**: `src/lib/weekly-rankings.ts` — `getLatestWeek()`, and `weekly_rankings` rows carry `team`/`opponent`/`sleeper_id`. This IS the NFL-game grouping source. (Table: `src/db/schema.ts` `weeklyRankings`.)
- **Fleaflicker lineups**: `getFleaflickerWeekLineups(leagueId, week)` already exists (`src/lib/fleaflicker.ts`) — returns START starters (pro ids) + slot config per teamId, and internally reads `FetchLeagueScoreboard` (home/away pairing) + `FetchLeagueBoxscore`. Extend it to also expose the H2H pairing, or add a sibling that returns games.
- **FF pro-id → sleeper_id bridge**: name-bridge via `cleanseName` (`src/lib/nameUtils.ts`). Exact pattern in `buildFleaflicker` (`src/app/api/portfolio/league/route.ts`) and the FF team page.
- **My-team memory**: `useMyTeams` (`src/hooks/useMyTeams.tsx`).
- **League enumeration across platforms**: copy the effect in `src/app/portfolio/page.tsx` (Sleeper `/user/{id}/leagues/nfl/{year}`, FF `fleaflickerLeagueIds` from `useAuth`, Yahoo/MyFFPC `/api/yahoo?list=true` + `/api/myffpc?list=true`).
- **DB-backed starters (Yahoo/MyFFPC)**: `roster_players.is_starter` via `getDbLeagueData` (`src/lib/db-league-data.ts`). NOTE this is the season lineup, not a per-week lock — acceptable for v1 (the matchup/opponent is the new part).

### Current state of files this story touches (read before editing)
- `src/lib/fleaflicker.ts` — `getFleaflickerWeekLineups` / `getFleaflickerLineup` exist and read the boxscore. Preserve their current signatures (used by the optimizer + portfolio route). Add new exports; don't break existing.
- `src/lib/sleeper.ts` — has `getLeagueData`, `getLeagueRosters`, `getSleeperRosterPositions`, `getUserLeagues`. Add `getSleeperMatchups`; keep the `cache`/`TTL` pattern.
- `src/lib/yahoo.ts` — server-rendered scrape via `YAHOO_COOKIE`; `parsePlayers` already captures `is_starter` + `slot`. Adding opponent scraping means a new fetch of the matchup/scoreboard page; respect the existing `fetchHtml` retry/bounce handling.
- `src/app/portfolio/page.tsx` — league enumeration + `useMyTeams` usage to copy.

### NFL game grouping details / edge cases
- gameKey = the unordered team pair, e.g. sort([team, opponent]).join('@') so DET@GB == GB@DET.
- **Sleeper DEF normalization**: Sleeper `starters[]` returns team defenses as the bare NFL abbr (e.g. `"DEN"`), NOT `DEF_DEN`. Normalize Sleeper DEF starter ids to `DEF_{ABBR}` to match the `players` table + `weekly_rankings`. (Skill players are plain sleeper_ids and match directly.)
- K/DEF started players may have no `weekly_rankings` row. For DEF, sleeper_id is `DEF_{ABBR}` → the ABBR is the NFL team; look up that team's game from any other `weekly_rankings` row with that `team`. For K, if not uploaded, either omit or place via the player's NFL team from `players.team`. Prefer `players.team` join to resolve NFL team for any started player lacking a weekly row.
- A started player whose NFL game can't be determined (bye/no data) → group under an "Unknown / no game data" bucket rather than dropping silently.

### Overlap semantics (AC #5) — the whole point
- Aggregate per sleeper_id across ALL leagues. `forLeagues` = leagues where the player is in MY starters; `againstLeagues` = leagues where in my OPPONENT's starters. `side` = 'both' if both non-empty, else 'for'/'against'. The same NFL player commonly lands on both lists — this must render clearly, not collapse to one side.

### Testing standards
- Vitest, tests in `src/__tests__/lib/`. The Task 1 aggregation engine is pure → unit-test it directly (see `lineup-optimizer.test.ts` for the established style). Do not require live API calls in unit tests.

### Project Structure Notes
- Libs in `src/lib`, API routes under `src/app/api`, pages under `src/app`. New page under `src/app/portfolio/game-day/` to sit with the portfolio family. Matches existing conventions.
- No DB schema change required — all inputs already exist (`weekly_rankings`, `roster_players.is_starter`, live APIs). If Yahoo/MyFFPC weekly opponent later needs persistence, that's a follow-up, not this story.

### References
- Weekly data + week: [Source: src/lib/weekly-rankings.ts]
- Fleaflicker lineups/boxscore: [Source: src/lib/fleaflicker.ts#getFleaflickerWeekLineups]
- FF name-bridge + league enumeration: [Source: src/app/api/portfolio/league/route.ts, src/app/portfolio/page.tsx]
- My-team memory: [Source: src/hooks/useMyTeams.tsx]
- DB starters: [Source: src/lib/db-league-data.ts, src/db/schema.ts#rosterPlayers]
- Sleeper API: matchups endpoint `/league/{league_id}/matchups/{week}` (starters[] + matchup_id) [Source: Sleeper public API]

## Dev Agent Record

### Agent Model Used
Kiro (fast-path implementation: Fleaflicker + Sleeper only; Yahoo/MyFFPC deferred).

### Completion Notes List
- Shipped Fleaflicker + Sleeper (both pure API, verified live). Yahoo/MyFFPC (scrape-based) deferred to a follow-up.
- **Follow-up done (2026-08-27): Yahoo + MyFFPC added → all 4 platforms.** `src/lib/db-matchups.ts`: `resolveYahooMatchup` (scrapes `/f1/{league}/{team}/matchup` for the opponent team number via the two `a.F-link.Fz-xxl` links; starters from DB `roster_players.is_starter`, roster_id = Yahoo team number) and `resolveMyffpcMatchup` (drives the persistent Playwright profile to read `#..._TeamBanner_hlCurrentOpponent` opponent name → match opponent roster by owner_name; starters from DB). Route + game-day page now enumerate all 4 platforms. MyFFPC verified end-to-end (Baluga Knights vs Leeroy Jenkins, correct starters). Yahoo code in place; needs a fresh cookie to confirm live (stored cookie was expired at build time — resolver returns null gracefully).
  - Caveat: MyFFPC resolver uses Playwright inside the API route (server-only, not Vercel-cron-able — fine for the local personal tool).
- Pure engine `src/lib/rooting-guide.ts` (buildRootingGuide + gameKeyFor) — overlap-aware FOR/AGAINST/BOTH with per-league lists; NFL-game grouping via weekly_rankings team/opponent + players.team fallback; UNKNOWN bucket for players with no game data. 5 unit tests.
- Sleeper: `getSleeperMatchups` (pairs by matchup_id) + `normalizeSleeperStarterId` (bare abbr → DEF_{ABBR}).
- Fleaflicker: `getFleaflickerWeekMatchups` (per-game home/away + starter names → name-bridged to sleeper_id).
- `POST /api/portfolio/rooting-guide` + `src/app/portfolio/game-day/page.tsx` + portfolio CTA.
- Verified: next build clean, 78/78 unit tests, real-data spot check on FF 197269 + Sleeper 1200992049558454272 (correct FOR/AGAINST resolution, DEF normalization, cross-platform overlap on Justin Herbert).

### File List
- src/lib/rooting-guide.ts (new)
- src/lib/db-matchups.ts (new — Yahoo + MyFFPC weekly matchup resolvers)
- src/__tests__/lib/rooting-guide.test.ts (new)
- src/app/api/portfolio/rooting-guide/route.ts (new; all 4 platforms)
- src/app/portfolio/game-day/page.tsx (new; enumerates all 4 platforms)
- src/lib/sleeper.ts (getSleeperMatchups, normalizeSleeperStarterId)
- src/lib/fleaflicker.ts (getFleaflickerWeekMatchups)
- src/app/portfolio/page.tsx (Game Day CTA)
