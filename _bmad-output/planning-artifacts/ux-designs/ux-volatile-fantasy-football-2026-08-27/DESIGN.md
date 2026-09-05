---
name: VFF Live Draft — On the Clock
status: final
updated: 2026-08-27
scope: The live draft "on the clock" view (DraftClient, mode="live"). Extends the existing VFF visual language (Tailwind v4 + zinc neutrals + Lucide icons); this spine specifies only the delta for the redesigned on-the-clock composition.
colors:
  # Neutrals inherit from the app's zinc scale (Tailwind).
  neutral.bg: "#fafafa"
  neutral.surface: "#ffffff"
  neutral.text: "#18181b"      # zinc-900
  neutral.textMuted: "#71717a" # zinc-500
  neutral.textFaint: "#a1a1aa" # zinc-400
  neutral.border: "#e4e4e7"    # zinc-200
  neutral.borderFaint: "#f4f4f5" # zinc-100
  # Recommendation identity (indigo) — the "what to do".
  rec.accent: "#4f46e5"        # indigo-600
  rec.bg: "#eef2ff"            # indigo-50
  rec.border: "#c7d2fe"        # indigo-200
  # My Team results identity (green) — the "where I'm at".
  team.accent: "#0ca678"       # green/emerald
  team.bg: "#e6fcf5"
  team.border: "#96f2d7"
  # Strategic wait/grab callout (amber) — advisory, not alarm.
  callout.bg: "#fffbeb"
  callout.border: "#fcd34d"
  callout.text: "#3f3f46"
  # Signals within the results panel.
  flag.warn: "#d97706"         # amber-600 — empty required starting slot
  value.risk: "#dc2626"        # red-600 — "value at risk"
  value.safe: "#0ca678"        # green — "available %"
  # Auction value emphasis (default sort column).
  auction.text: "#b45309"      # amber-700
  # Position color coding (paired ALWAYS with the position letter, never color-only).
  pos.QB: "#b91c1c"
  pos.RB: "#1d4ed8"
  pos.WR: "#15803d"
  pos.TE: "#7e22ce"
typography:
  family.sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  family.mono: "ui-monospace, monospace"  # numeric values, auction $, tiers
  size.heroName: 18px      # #1 recommended player name
  size.body: 13px
  size.small: 12px
  size.micro: 10px         # section eyebrows, tags
  weight.eyebrow: 700
  weight.heroName: 800
rounded:
  card: 12px
  chip: 8px
  tag: 4px
spacing:
  heroGap: 14px            # gap between rec card and team panel
  cardPad: 14px
  stackGap: 12px           # mobile vertical rhythm
components:
  clockBar: "Sticky top banner. YOUR PICK state = rec.accent bg, white text, pulsing white dot; other-team state = zinc-100 bg, zinc-700 text."
  recCard: "rec.bg surface, 2px rec.border. Contains primary rec (white inner card), Fills/Edge rationale lines, tag chips, strategic callout, and ranked 2–5 list."
  teamPanel: "team.bg surface, 2px team.border. Starters-filled summary line + per-position groups (count · Σ value · players w/ tier · ⚠ empty flag)."
  strategicCallout: "callout.bg surface, 1px callout.border, 💡 leading glyph. Advisory tone."
  availableTable: "Neutral white surface. Default sort = Auction $ descending; sorted column header uses rec.accent."
  teamStripMobile: "Compact one-line counts (QB1 · RB3 · WR2 · TE0⚠), team.bg, tap-to-expand."
---

# VFF Live Draft — On the Clock · Design

> Visual delta for the redesigned on-the-clock view. Inherits the VFF app's Tailwind v4 + zinc-neutral system and Lucide iconography; only the on-the-clock composition and its two-identity color language are specified here. EXPERIENCE.md owns behavior and references these tokens by name.

## Brand & Style

The on-the-clock view has one job: let a manager **pick with confidence under time pressure**. The visual language serves a two-beat read — *"what to do"* (the recommendation) and *"where I'm at"* (my roster) — held side by side as equal, color-distinct partners. Calm over dense. Nothing shouts except the one thing that's time-sensitive (your turn). The recommendation reasons out loud; the roster mirrors reality without arguing. Advisory cues (wait/grab) are warm and quiet, never alarms.

## Colors

Two identity colors carry the mental model:

- **Indigo `{rec.accent}`** = the recommendation domain — "what to do." The clock bar (your turn), the rec card surface, the sorted-column header, and primary action buttons all speak indigo.
- **Green `{team.accent}`** = the My Team results domain — "where I'm at." The roster panel and the mobile team strip speak green. Green signals "your ground truth," and doubles as the "safe / available %" signal in the strategic callout.

Supporting signals stay meaningful and sparse: **amber `{flag.warn}`** flags an empty required starting slot; **red `{value.risk}`** marks value at risk in the wait/grab callout; **amber-700 `{auction.text}`** emphasizes the auction-dollar column that drives the default sort. Everything else rests on the zinc neutral scale.

**Position colors** (`{pos.QB}` `{pos.RB}` `{pos.WR}` `{pos.TE}`) are decorative reinforcement only — they always accompany the position letter (QB/RB/WR/TE), never stand alone as the sole cue.

## Typography

Inter throughout, matching the app. The **#1 recommended player name** is the largest type in the view (`{size.heroName}`, `{weight.heroName}`) — it's the single loudest content element. Section eyebrows ("🎯 Recommended", "My Team · results") are `{size.micro}` uppercase at `{weight.eyebrow}`. All numeric values — auction dollars, dynasty values, tiers, percentages — use `{family.mono}` for scan-alignment in the results panel and available table.

## Layout & Spacing

Desktop hero is a two-column grid, **recommendation left (~60%) / My Team right (~40%)**, separated by `{spacing.heroGap}`. The recommendation leads the reading order (left); the roster grounds it (right). Cards use `{spacing.cardPad}` internal padding and `{rounded.card}` corners. Below the hero, the Available Players table spans full width; Board / Scarcity / Needs / Trade collapse into a single low-emphasis dashed strip at the bottom.

Mobile collapses to a single column with `{spacing.stackGap}` rhythm: clock bar → compact team strip → recommendation → available players. True side-by-side is impossible on a phone, so the roster becomes a glanceable one-line strip directly above the recommendation.

## Elevation & Depth

Flat surfaces with hairline borders, consistent with the app. The only elevated element is the **sticky clock bar in YOUR PICK state**, which carries a soft indigo shadow to assert "it's your turn." The two hero cards sit at the same elevation — neither dominates the other by depth, only by position and color.

## Shapes

Cards `{rounded.card}`, action chips and callout `{rounded.chip}`, position/tag pills `{rounded.tag}`. The collapsed bottom drawer uses a **dashed** border to read as "tucked away, expandable" rather than a solid active surface.

## Components

- **Clock bar `{components.clockBar}`** — sticky, top of view. YOUR PICK: indigo fill, pulsing dot, round/pick label, "Select a player below" hint. Other team: neutral fill, their name, and "You pick: R.PP (N away)."
- **Recommendation card `{components.recCard}`** — indigo identity. Primary rec = white inner card with the hero player name, **Fills** line (slot + starter/depth + current count), **Edge** sentence (scarcity/competition/need rationale), tag chips, and the **💡 strategic callout** when applicable. Below it, the ranked #2–#5 list.
- **My Team panel `{components.teamPanel}`** — green identity. Top line: "starters filled" summary (e.g. "8/10 starters set"). Then per-position groups, each showing count · Σ value (mono) · players with tier · `{flag.warn}` ⚠ on empty required slots.
- **Strategic callout `{components.strategicCallout}`** — amber, advisory. Uses `{value.safe}` for the #1's availability % and `{value.risk}` for the at-risk player's survival % and value.
- **Available Players table `{components.availableTable}`** — default sort **Auction $ descending**; the sorted column header is indigo `{rec.accent}` with a ↓ affordance. Search + position filter in the header bar.
- **Mobile team strip `{components.teamStripMobile}`** — one line of position counts with the ⚠ flag inline, tap-to-expand into the full per-position breakdown.

## Do's and Don'ts

> Reference mock: [`mockups/on-the-clock-mockup.html`](./mockups/on-the-clock-mockup.html) (desktop/mobile toggle). Spines win over the mock on any conflict.

- **Do** keep the recommendation and My Team as visually co-equal partners — different colors, same weight. The roster validates; it never overrides the rec's ranking.
- **Do** keep the #1's reasoning (Fills / Edge / tags / callout) visible without a click — it's core to the confidence read.
- **Do** default the Available Players table to Auction $ descending, every time the view loads.
- **Don't** let the roster panel prescribe or re-rank — the ⚠ empty flag is the only evaluative cue, and it's a neutral fact, not advice.
- **Don't** reintroduce trade tools, board, scarcity, or needs as peers of the hero — they stay collapsed below.
- **Don't** rely on position color alone; always pair with the QB/RB/WR/TE letter.
- **Don't** make advisory callouts feel like errors — amber and warm, never red-alert.
