---
name: VFF Live Draft — On the Clock
status: final
updated: 2026-08-27
design: ./DESIGN.md
scope: Behavior, IA, states, interactions, accessibility, and the on-the-clock flow for the VFF live draft (DraftClient, mode="live"). Reuses the shared mock/live DraftClient; this spine specifies the behavioral delta for the redesigned on-the-clock composition. Visual tokens live in DESIGN.md and are referenced by name.
---

# VFF Live Draft — On the Clock · Experience

> How the redesigned on-the-clock view works. Owns information architecture, state, interaction, and the confidence-loop flow. Visual identity is in [DESIGN.md](./DESIGN.md); tokens referenced as `{token.name}`. Both spines win over any mock on conflict.

## Foundation

- **Surface:** Web app, responsive. Primary use on **both desktop and mobile** — desktop is a laptop at the draft; mobile is a phone in hand during an in-person or remote draft.
- **UI system:** Existing VFF stack — Next.js App Router, Tailwind CSS v4, Lucide icons, zinc neutral palette. This view is the shared `DraftClient` component running with `mode="live"`. The redesign is a **composition and hierarchy change**, not a new data layer — recommendation scoring, roster composition, position values, and the rec rationale all already exist.
- **Guiding principle:** The recommendation tells you *what to do*; the roster shows you *where you are*; you make the call. The tool never overrides the human judgment — it grounds it.

## Information Architecture

The on-the-clock view, top to bottom:

1. **Sticky clock bar** — always visible; states below.
2. **Hero (paired unit):**
   - **Recommendations** (lead / left on desktop) — #1 rec with full rationale + ranked #2–#5.
   - **My Team results** (right on desktop; a compact strip above the rec on mobile).
3. **Available Players table** — co-star; full pool, searchable/filterable, **default-sorted by Auction $ descending**.
4. **Collapsed drawer** — Board / Scarcity / Needs tabs + Trade tools, all minimized behind a low-emphasis strip.

Everything a manager needs to pick with confidence lives in the hero; everything for deeper validation is one glance down (available table) or one tap away (collapsed drawer).

## Voice and Tone

Microcopy is concise, plain-English, and coach-like — never hype. The rationale reads like a smart friend explaining the pick:

- Eyebrows: "🎯 Recommended", "My Team · results".
- **Fills:** "RB4 (depth) — you have 3 RBs" / "TE1 (starter) — you have 0 TEs".
- **Edge:** full sentences — "RB supply is thin — 3 quality options remain at this level." / "Only 2 comparable WRs left and 3 teams ahead need WR. High urgency."
- **Strategic callout:** "Tuten projects 84% available at your next pick (5.06). Consider grabbing Terry McLaurin now — only 28% likely to last (1,540 value at risk). You may land both."
- Empty-slot flag: the single word "empty" beside the ⚠, stated as fact.
- Clock hint: "Select a player below →".

## Component Patterns

- **Clock bar** — reflects whose pick it is and, when it's not yours, how many picks until it is. On your pick, it's the loudest element in the view (see State Patterns).
- **Recommendation hero** — the #1 rec always renders its reasoning inline (no click required): **Fills** line, **Edge** sentence, **tag chips**, and — conditionally — the **💡 strategic wait/grab callout**. `Draft` commits the pick; `Info` opens the full player detail modal. The ranked #2–#5 list sits directly below, each row draftable.
  - The **strategic callout appears only when** the #1 rec projects safe to wait (≥80% available at your next pick) AND a different candidate is at real risk (≥300 value at risk). Otherwise it's suppressed — no noise when there's no tension.
- **My Team results panel** — validation surface, not prescriptive. Shows a top-line **"starters filled"** summary, then per-position groups: count · Σ value · players (with tier) · `{flag.warn}` ⚠ on any empty *required starting* position. It never re-ranks or contradicts the recommendation; the ⚠ is the only evaluative mark and it states a fact.
- **Available Players table** — the override path. Default sort **Auction $ descending**; sortable columns; search + position filter. A manager who wants to reject the rec finds their own guy here.
- **Collapsed drawer** — Board / Scarcity / Needs / Trade, tucked behind a dashed strip. Expandable on demand; never competes with the hero.

## State Patterns

- **Your pick (on the clock):** clock bar in `{rec.accent}` with pulsing dot, round/pick, "Select a player below." Hero is fully active; `Draft` buttons live.
- **Another team's pick:** clock bar neutral, showing the active team and "You pick: R.PP (N away)." The hero still renders (you can pre-plan), but the emphasis recedes.
- **Empty required starting slot:** that position group shows the ⚠ `{flag.warn}` "empty" fact; the "starters filled" summary reflects the gap (e.g. "9/10 starters set").
- **No strategic tension:** the 💡 callout is absent — its presence is itself a signal.
- **Roster full / draft complete:** hero collapses to a summary; available table and Draft actions disable.
- **Loading / pre-draft:** team selector and (if applicable) draft-plan loader precede the on-the-clock view; keepers auto-confirm from a loaded plan.
- **Mobile — collapsed team strip (default):** one-line counts + ⚠. **Expanded (on tap):** full per-position breakdown with players and tiers, then collapses again.

## Interaction Primitives

- **Draft a player:** tap `Draft` on the #1 rec, any ranked row, or any available-table row → commits the pick, removes the player from the pool, advances the clock.
- **Inspect:** tap `Info` / a player name → player detail modal (scouting, AI analysis, comparisons). Non-committal.
- **Override the rec:** search / filter / re-sort the available table, then draft from it.
- **Expand roster (mobile):** tap the team strip → full breakdown; tap again to collapse.
- **Reveal deep tools:** tap the collapsed drawer → Board / Scarcity / Needs / Trade.
- **Re-sort available table:** tap a column header; **Auction $ ↓ is the load-time default** and is restored as the primary scan order.

## Accessibility Floor

- **No color-only meaning:** position color always pairs with the QB/RB/WR/TE letter; the ⚠ flag pairs with the word "empty"; the sorted column shows a ↓ glyph, not just an indigo tint.
- **Contrast:** hero text on `{rec.bg}` / `{team.bg}` and the auction/risk/safe signal colors must meet WCAG AA for their text sizes.
- **Tap targets:** on mobile, `Draft`, `Info`, the team strip expander, and table rows meet the ≥44px minimum used elsewhere in the app.
- **Motion:** the pulsing dot on the clock bar is decorative; it must not be the sole indicator that it's your turn (the "YOUR PICK" label and color carry it), and it should respect reduced-motion preferences.
- **Focus & order:** reading/focus order follows IA — clock → recommendation → my team → available table → drawer.
- **Timed pressure:** because the moment is time-boxed, the single most important state (your turn) is conveyed redundantly: color + label + position + shadow.

## Key Flows

### Chino's on-the-clock confidence loop

Chino is drafting on his laptop, mid-draft in "Fantasy Fun with Friends." Three teams pick in a flurry, then the clock bar flips indigo and pulses: **YOUR PICK · Round 4, 4.06.**

1. His eye lands **left** on the recommendation: **Bhayshul Tuten (RB)**, big and bold. Below it — *Fills: RB4 (depth), you have 3 RBs* · *Edge: RB supply is thin, 3 quality options remain.*
2. He glances **right** to **My Team**: *8/10 starters set* · QB 1 · RB 3 · WR 2 · **TE 0 ⚠ empty**. The results panel confirms what the rec implies — he's deep at RB and has no TE yet.
3. **The climax:** the 💡 callout speaks up — *"Tuten projects 84% available at your next pick (5.06). Consider grabbing Terry McLaurin now — only 28% likely to last, 1,540 value at risk."* Chino weighs it against his own read: his RB depth is fine, TE is a hole, but McLaurin is a genuine value cliff. He trusts his judgment — the tool gave him the grounds, not the order.
4. He drops his eyes to the **Available Players** table (Auction $ ↓) to confirm no TE is worth reaching for at 4.06. None jumps out.
5. He taps **Draft** on McLaurin — grabbing the value the callout flagged — confident he can still land a TE and RB depth later. The clock advances. No second-guessing.

### Chino on his phone (remote draft)

Same league, but Chino is on his phone at a friend's place. The clock bar flips to YOUR PICK 4.06. He sees the compact strip — **QB1 · RB3 · WR2 · TE0 ⚠** — directly above the recommendation. That one line is enough to ground him; he doesn't even need to expand it. He reads the rec, taps the strip once to double-check his RB tiers, then drafts. The whole loop fits on one thumb-scroll.

## Responsive & Platform

- **Desktop (≥ md):** two-column hero, recommendation left (~60%) / My Team right (~40%), per `{spacing.heroGap}`. Available table full-width below. Collapsed drawer at the bottom.
- **Mobile (< md):** single column — clock bar → compact team strip (tap-to-expand) → recommendation → available table. Trade tools and Board/Scarcity/Needs remain collapsed. The team panel degrades gracefully from full breakdown to one-line strip, preserving the confidence read on a small screen.
- The recommendation content (Fills / Edge / tags / callout) is identical across surfaces; only the roster panel's density adapts.
