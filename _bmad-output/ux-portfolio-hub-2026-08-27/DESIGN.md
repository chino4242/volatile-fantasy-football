---
status: final
updated: 2026-08-27
colors:
  bg: "#fafafa"           # zinc-50 — page background (light is primary target)
  surface: "#ffffff"       # card / sub-card
  ink: "#18181b"           # zinc-900 — primary text
  ink2: "#3f3f46"          # zinc-700 — secondary text
  dim: "#71717a"           # zinc-500 — meta/labels
  dimmer: "#a1a1aa"        # zinc-400 — faint labels
  line: "rgba(24,24,27,.06)"
  ring: "rgba(24,24,27,.08)"   # ring-1 card border
  indigo: "#4f46e5"        # accent / primary action / trades
  indigoSoft: "#eef2ff"
  amber: "#b45309"         # attention / lineup fixes
  amberSoft: "#fffbeb"
  amberLine: "#fde68a"
  green: "#15803d"         # positive / buy / waiver adds / edge
  greenSoft: "#f0fdf4"
  greenLine: "#bbf7d0"
  red: "#b91c1c"           # sell / negative
  redSoft: "#fef2f2"
  zinc100: "#f4f4f5"
  zinc200: "#e4e4e7"
typography:
  family: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
  h1: "28px/800/-0.02em"
  groupHeader: "13px/600"
  body: "14px/1.55"
  meta: "12px/500"
  micro: "11px"
rounded:
  card: "14px"       # rounded-2xl-ish sub-cards & team cards
  pill: "999px"
  button: "8px"
  chip: "6px"
spacing:
  page: "28px 20px 64px"
  cardPad: "18px"
  itemPad: "12px 16px"
  groupGap: "14px"
  gridGap: "16px"
components:
  actionGroupCard: "sub-card with soft-tinted header (amber/indigo/green), body rows"
  teamCard: "white card, ring-1, tier pill + format badge, health lines"
  tierPill: "rounded-full, soft bg per band"
  deepLinkButton: "indigo solid primary"
  ghostButton: "white, zinc-200 border"
---

# Portfolio Hub — DESIGN

Visual identity for the redesigned `/portfolio` page. This **extends the existing app design system** (it does not invent a new one): zinc neutrals + indigo accent, `rounded-2xl` cards with `ring-1` hairline borders, lucide icons, Tailwind utility classes. Dark mode remains supported by the app, but **light mode is the primary design target** and all mocks lead with it.

Reference mocks: [`mockups/mock-hub-inseason.html`](mockups/mock-hub-inseason.html) · [`mockups/mock-hub-offseason.html`](mockups/mock-hub-offseason.html). Where a mock and these tokens disagree, **this spine wins.**

## Brand & Style

Calm, dense-but-legible power-user dashboard. It reads like a trusted analyst's briefing — confident, quiet, never alarmist. Urgency is conveyed through a small, consistent semantic-color vocabulary, not through loud chrome or animation. The tone is "here's what's worth your attention," not "ALERT."

## Colors

Neutral spine is zinc (`{colors.bg}` page, `{colors.surface}` cards, `{colors.ink}`/`{colors.ink2}`/`{colors.dim}` text). Indigo (`{colors.indigo}`) is the single accent — links, primary deep-link buttons, and the trades semantic.

Semantic urgency vocabulary (each has a soft-tint background for group headers/pills and a saturated foreground for text/icons):

- **Amber** (`{colors.amber}` on `{colors.amberSoft}`) — attention / **lineup fixes** / rebuild tier.
- **Indigo** (`{colors.indigo}` on `{colors.indigoSoft}`) — **trades** / primary actions.
- **Green** (`{colors.green}` on `{colors.greenSoft}`) — positive / **waiver adds** / buy / rank "edge" / top tier / all-caught-up.
- **Red** (`{colors.red}` on `{colors.redSoft}`) — **sell-window** / negative.

## Typography

System font stack. `h1` 28px/800. Action-group and band headers 13px/600. Body 14px. Meta/league chips 11–12px. Numbers (values, edges) may use a mono treatment where alignment helps, matching the existing tables.

## Layout & Spacing

Single centered column, `max-width ~1100px`, page padding `{spacing.page}`. Vertical hierarchy is the core layout idea: **Action Center on top, banded dashboard below.** Action-type / team groups separated by `{spacing.groupGap}`. Team cards in a 2-col grid on desktop (`{spacing.gridGap}`), single column on mobile.

## Elevation & Depth

Flat. Cards use `ring-1` (`{colors.ring}`) + a whisper shadow (`0 1px 2px rgba(0,0,0,.04)`). No heavy drop shadows. Group headers get a soft tint fill rather than elevation to signal type.

## Shapes

`{rounded.card}` for cards/sub-cards, `{rounded.pill}` for tier pills and the season toggle, `{rounded.button}` for buttons, `{rounded.chip}` for the "(Fleaflicker)" scope chip and format badges.

## Components

- **Action-group card** (`{components.actionGroupCard}`): a rounded sub-card whose header is soft-tinted per action type (amber lineups / indigo trades / green waivers) with a right-aligned count; body is a list of action rows, each with a deep-link button.
- **Team card** (`{components.teamCard}`): white, ring-1; header = team name + tier pill + optional `⚠ N lineup` flag pill; body = format/owner meta + rich health lines (strong/thin, core age, weakest starter, undervalued FAs).
- **Tier pill** (`{components.tierPill}`): green (top), zinc (middle), amber (lower). Label text is format-appropriate (see EXPERIENCE.md).
- **Deep-link button** (`{components.deepLinkButton}`): indigo solid, label ends with `↗` to signal it leaves the app.
- **Ghost button**: white + zinc-200 border — used for "✓ On purpose" and "Evaluate a trade".

## Do's and Don'ts

- **Do** lead in light mode; keep dark mode working but secondary.
- **Do** confine color to the semantic vocabulary above; the rest is zinc.
- **Do** end every outbound action label with `↗`.
- **Don't** use red for anything but sell/negative — never for generic "attention" (that's amber).
- **Don't** add countdown timers, pulsing, or alarm styling in v1.
- **Don't** invent new accent hues; extend these tokens.
