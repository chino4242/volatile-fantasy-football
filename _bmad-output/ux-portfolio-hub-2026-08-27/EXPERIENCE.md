---
status: final
updated: 2026-08-27
---

# Portfolio Hub — EXPERIENCE

How the redesigned `/portfolio` page **works**. Visual identity lives in [`DESIGN.md`](DESIGN.md); this doc references its tokens by name (e.g. `{colors.amber}`). Where this spine conflicts with a mock, **this spine wins.**

Inherited source of truth (by reference, not duplicated): the existing implementation — `src/app/portfolio/page.tsx`, `src/lib/portfolio.ts` (`labelTeam`, `weakestStarter`, `undervaluedFreeAgents`, `optimizePortfolioTeam`), the shipped `useSeasonMode` hook, and the targeted-trade + suggested-transactions engines.

## Foundation

- **Form factor:** two intentional surfaces from one responsive page.
  - **Desktop** = primary / heavy-lifting: off-season analysis, strengths & weaknesses, trade planning, the full banded dashboard.
  - **Phone** = quick-hit: evaluate an incoming trade during the day; glance at what needs attention this week. Action Center groups render collapsed-to-counts; dashboard collapsed by default.
- **UI system:** existing app stack (Next.js App Router, Tailwind, lucide, zinc/indigo). This is a behavioral delta on top of that system, not a new one.
- **Product nature — the load-bearing principle:** **the app is a consultant, not a controller.** It cannot set lineups or execute moves. Every recommendation resolves to *review → deep-link out* to the real platform (Sleeper / Fleaflicker / Yahoo / MyFFPC). There are no "do it" buttons.
- **Season mode** (existing toggle) sets FOCUS: the Action Center's grouping and the dashboard emphasis flip between in-season and off-season.

## Information Architecture

Single scroll, strict vertical hierarchy:

1. **Header** — title, league count, season toggle.
2. **Action Center** (top) — *only* clear, deep-linkable recommended actions. Season-adaptive grouping:
   - **In-season → grouped by ACTION TYPE**, ordered: **Lineup fixes** (amber) → **Trades to review** (indigo) → **Waiver adds** (green). League is nested within each item.
   - **Off-season → grouped by TEAM**: each team sub-card shows its tier + weakness, then its strengthen-moves (add / trade / sell-window).
3. **Dashboard** (below) — passive team health, **banded into three tiers**: 🟢 Top · ⚪ Middle · 🟠 Lower. Bands expanded by default on desktop; within a band, sort **needs-action-first**.

Passive observations (tier label, core age, weakest starter, strengths/weaknesses) live **only** in the dashboard — never in the Action Center.

### Tier model (unified bands, format-honest labels)

All leagues sort into the same three visual bands so mixed dynasty/redraft portfolios read consistently. Label *text* is format-appropriate, driven by `labelTeam`:

| Band | Dynasty label | Redraft label |
|------|---------------|---------------|
| 🟢 Top | Contender | Contender |
| ⚪ Middle | Middle | In the mix |
| 🟠 Lower | Rebuild | Falling behind |

Every team card also carries a `DYNASTY` / `REDRAFT` format badge so the lens is never ambiguous.

## Voice and Tone

Trusted analyst, calm and specific. "Needs attention this week," "Sell window," "even market value," "+188 edge." Never alarmist; no exclamation-point urgency. Outbound actions phrased as the destination: "Open Sleeper ↗", "Evaluate ↗". Quiet state is warm, not empty: "You're all caught up — nothing needs attention."

## Component Patterns (behavioral)

- **Action-group card** — collapsible on mobile (tap count → expand). Header shows type + count ("4 across 3 leagues"). Trades group carries a `Fleaflicker` scope chip.
- **Action row** — one recommendation: the move + context + league chip + a deep-link button. Lineup rows additionally carry a **"✓ On purpose"** ghost button.
- **Manual "Evaluate a trade"** — a persistent row at the foot of the Trades group; opens the existing trade evaluator with a pasted/selected offer, for platforms without auto trade-pull (Sleeper/Yahoo/MyFFPC).
- **Team card** — passive; whole card deep-links to that league. Health lines reuse existing computations.

## State Patterns

- **Loading** — page enumerates leagues then fetches each; show per-card skeletons; the Action Center assembles as leagues resolve (don't block the whole page on the slowest fetch).
- **Quiet / all-caught-up** — no urgent items → Action Center collapses to a single green "✓ You're all caught up — nothing needs attention" bar; dashboard shows immediately below. Proactive value moves are NOT forced into the urgent slot.
- **Acknowledged lineup flag** — tapping "✓ On purpose" removes that flag from the urgent list **for the current week** (resets next week when matchups change). No persisted audit line.
- **My-team unknown** — a league where the user hasn't picked their team shows the existing team-picker before insights; auto-select when the platform owner name matches a known identity, else prompt.
- **Empty portfolio** — no leagues connected → guidance to connect on the home page.
- **Per-league error** — that card shows a compact "Failed to load"; the rest of the hub still works.

## Interaction Primitives

- **Deep-link out** — the universal action. Opens the correct platform URL for that league/team in a new tab; label ends `↗`.
- **Acknowledge** — single tap, optimistic, local (persisted per week, mirrors `useMyTeams`/`useSeasonMode` localStorage pattern).
- **Season toggle** — flips Action Center grouping + dashboard emphasis instantly (existing cross-component sync).
- **Expand/collapse** — mobile group counts and (nice-to-have) desktop bands.

## Accessibility Floor

- All actionable rows reachable by keyboard; deep-link buttons are real links with discernible names ("Open Sleeper — Fun with Friends").
- Urgency is never color-only: each group carries an icon + text label (⚠ Lineup fixes, 🔀 Trades, ➕ Waiver adds), and the `↗` marks outbound links.
- Contrast per DESIGN.md light tokens meets AA for text; tier pills pair color with a shape/label.
- The "+188 edge" / "mkt 1,948" shorthand gets an accessible label / tooltip that is also tap-reachable on touch (not hover-only).

## Key Flows

### Flow 1 — Sunday triage (Chino, in-season, phone, 11:40am kitchen)
1. Chino opens the hub before the 1pm locks. Season mode is In-season.
2. The Action Center shows three collapsed group counts: **⚠ 4 lineup fixes · 🔀 1 trade · ➕ 3 waiver adds.**
3. He taps **Lineup fixes** → four rows expand, each naming the swap + league.
4. Row 1 (start Waddle over Doubs) — he agrees; taps **Open Sleeper ↗**, fixes it on the real app, comes back.
5. Row 2 he benched on purpose (injury hedge) → taps **✓ On purpose**; it drops from the urgent list. **← climax beat: the tool respects his judgment instead of nagging, so the remaining flags are all real.**
6. He clears the rest, glances that the dashboard shows no other flags, and closes the app before kickoff — confident nothing was left on the bench by accident.

### Flow 2 — Weekday trade evaluation (Chino, in-season, phone)
1. A Fleaflicker offer lands midday. Chino opens the hub.
2. **🔀 Trades to review (Fleaflicker · 1 incoming)** is waiting: "You get Garrett Wilson ↔ give Breece Hall · even market value."
3. He taps **Evaluate ↗**, reviews the fairness + positional-room impact, and decides. **← climax: a confident yes/no in under a minute, on his phone.**
4. Later a leaguemate texts a Sleeper offer → he uses **Evaluate a trade** to paste it in, since Sleeper isn't auto-pulled.

### Flow 3 — Off-season strengthening (Chino, off-season, desktop)
1. Chino sits down at his computer; season mode is Off-season.
2. The Action Center is **grouped by team**. "Forte-Year Old Virgins — Contender · weakness: RB depth" lists an add (Cedric Tillman, +188 edge) and a trade-for-RB.
3. He works team by team down the list, opening trades and waiver targets, deep-linking out to act.
4. Below, the **banded dashboard** confirms the shape of his whole portfolio at a glance — three Top-tier teams, six Middle, three Lower — mixing dynasty and redraft with honest labels. **← climax: he sees his entire fantasy operation, and its priorities, in one screen.**

## Responsive & Platform

- **Desktop (primary):** full Action Center expanded, 2-col dashboard grid, bands expanded.
- **Mobile (quick-hit):** Action Center groups render as tappable count rows that expand on demand; dashboard collapsed under a "Your teams" toggle; single-column cards. Optimized for "answer one question, act, leave."
