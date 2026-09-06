---
name: Comissão de Formatura — Tesouraria & Rifas
description: Every sale is a receipt, not a spreadsheet cell — a paper-and-ink system for a graduation committee's money and raffles.
colors:
  paper: "oklch(0.965 0.010 85)"
  paper-lifted: "oklch(0.995 0.006 88)"
  ink: "oklch(0.24 0.015 85)"
  ink-muted: "oklch(0.48 0.018 85)"
  paper-shadow: "oklch(0.93 0.012 85)"
  hairline: "oklch(0.86 0.014 85)"
  emerald: "oklch(0.42 0.11 160)"
  emerald-ink: "oklch(0.99 0.01 160)"
  amber: "oklch(0.5 0.13 75)"
  amber-bg: "oklch(0.93 0.06 80)"
  brick: "oklch(0.48 0.16 30)"
  brick-bg: "oklch(0.92 0.04 35)"
typography:
  body:
    fontFamily: "Geist, \"Geist Fallback\", ui-sans-serif, system-ui"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, \"Geist Fallback\", ui-sans-serif, system-ui"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.06em"
  figures:
    fontFamily: "Geist Mono, \"Geist Mono Fallback\", ui-monospace"
    letterSpacing: "-0.01em"
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  2xl: "0.9rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.emerald}"
    textColor: "{colors.emerald-ink}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 1rem"
  badge-confirmed:
    backgroundColor: "transparent"
    textColor: "{colors.emerald}"
    rounded: "{rounded.sm}"
    padding: "0.1em 0.55em"
  badge-pending:
    backgroundColor: "transparent"
    textColor: "{colors.amber}"
    rounded: "{rounded.sm}"
    padding: "0.1em 0.55em"
  badge-void:
    backgroundColor: "transparent"
    textColor: "{colors.brick}"
    rounded: "{rounded.sm}"
    padding: "0.1em 0.55em"
---

# Design System: Comissão de Formatura — Tesouraria & Rifas

## Overview

**Creative North Star: "The Comprovante"**

This is a paper-and-ink system built from the physical vocabulary of a printed receipt sitting on a desk. Every confirmed action — a raffle number sold, a lançamento posted, a user activated — earns the same visual event a real receipt gets: a stamp, a dashed tear-line, a row of tabular figures that never wobble. The system was built to replace a generic "admin panel" look (equal cards, hero-metric tiles, ungrounded blue) with something that reads as *evidence*: a comprovante the committee and the buyer can both trust at a glance, because the buyer-facing raffle store (Persuade) and the committee's internal ledger (Operate) are the same physical object seen from two sides of the counter.

The ground is warm, slightly cream paper — never clinical white, never gray — because paper has a hue. Cards render a shade lighter than the page, paper catching light, lifted off the desk. Confirmed state reuses the brand emerald directly (a confirmed sale *is* the brand's core promise); pending and void are their own hues, not desaturated variants of it.

**Key Characteristics:**
- Warm paper ground, graphite ink, one brand emerald that never dilutes into a generic accent blue
- Dashed rules stand in for a receipt's perforated tear-line everywhere a divider is needed
- Tabular Geist Mono for every number, date, and ID — money never wobbles in weight
- A rotated, bordered "stamp" mark is the one signature confirmed-state device, reused identically on the buyer's receipt and the committee's status badges
- Depth from a hairline ring, not drop shadows; shadows are reserved for things that are physically lifted (sticky bars, the receipt card itself)

## Colors

Warm and low-saturation across the board; the only saturated color in the system is the single brand emerald, and it is spent deliberately.

### Primary
- **Emerald** (`oklch(0.42 0.11 160)`): the brand accent and the "confirmed" state color at once — primary buttons, active nav, the sold/confirmed badge stamp, the progress-bar fill. Used sparingly outside of confirmed-state contexts; it is not a decorative accent.

### Secondary
- **Amber** (`oklch(0.5 0.13 75)`) with **Amber Paper** background (`oklch(0.93 0.06 80)`): the "pending/reserved" state — an in-flight reservation, an uploaded-but-unreviewed document, a reserved raffle number.
- **Brick** (`oklch(0.48 0.16 30)`) with **Brick Paper** background (`oklch(0.92 0.04 35)`): the "void/cancelled" state — a cancelled sale, a deactivated user, an expired reservation. Never the generic destructive-red; it is warm and paper-toned like everything else.

### Neutral
- **Warm Paper** (`oklch(0.965 0.010 85)`): page background.
- **Paper, Lifted** (`oklch(0.995 0.006 88)`): card and popover surfaces — one shade lighter than the page, never the same flat plane.
- **Graphite Ink** (`oklch(0.24 0.015 85)`): primary text.
- **Ink, Muted** (`oklch(0.48 0.018 85)`): secondary text, label-tag copy. Never plain gray — it carries the same warm hue as the page.
- **Hairline** (`oklch(0.86 0.014 85)`): borders, dividers, the dashed receipt-divider color.

### Named Rules
**The One Ledger Rule.** Confirmed, pending, and void are the only three status colors in the system. A new status reuses one of the three semantically rather than introducing a fourth hue.

## Typography

**Body & Display Font:** Geist (with "Geist Fallback", ui-sans-serif, system-ui)
**Figures Font:** Geist Mono (with "Geist Mono Fallback", ui-monospace) — `font-variant-numeric: tabular-nums`

**Character:** One typeface family for everything; the pairing comes from Geist Sans vs. Geist Mono, not from a separate display face. Geist Mono is reserved for anything that is literally a figure — money, dates, IDs, raffle numbers — so it reads as data, not as a "technical" costume.

### Hierarchy
- **Headline** (semibold, 1.5rem–2rem, tight tracking): page titles ("Painel", "Rifas", raffle titles on the public store).
- **Title** (medium, 1rem–1.125rem): section headings ("Vendas recentes", "Escolha seus números").
- **Body** (regular, 0.875rem–1rem, 1.5 line-height): paragraph copy, descriptions, form labels.
- **Label** (semibold, 0.6875rem, 0.06em tracking, uppercase, `--muted-foreground`): the `.label-tag` utility — every stat-tile caption, table header, and receipt row label.
- **Figures** (`.font-figures`, Geist Mono, tabular-nums, -0.01em tracking): every money amount, raffle number, date/timestamp, and ID fragment, with no exceptions.

### Named Rules
**The Tabular Money Rule.** Any number a person might scan down a column — money, quantities, dates — renders in `.font-figures`. A proportional-figure amount next to a tabular one is always a defect.

## Layout

Content-first, narrow measures: public raffle pages cap at `max-w-4xl`, admin detail pages at `max-w-3xl`, receipts and forms at `max-w-sm`/`max-w-md`. The admin shell is a fixed 240px sidebar (`sticky top-0 h-screen overflow-y-auto`, so navigation and sign-out stay reachable no matter how long the page content runs) plus a fluid content column. Below the `md` breakpoint the sidebar collapses into a slide-in Sheet triggered from a compact mobile header.

Public listing grids use `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` so a single item stretches to fill the row instead of being stranded at half-width (`auto-fit`, never `auto-fill`, for card grids that may hold one item). Admin KPI rows use one bordered card split with `divide-x divide-y divide-dashed` instead of N separate bordered tiles.

### Named Rules
**The Min-Width-Zero Rule.** The admin shell's content column (`admin-shell.tsx`) carries `min-w-0`. Without it, a single wide table (`min-w-[900px]` inside its own `overflow-x-auto` wrapper) silently blows out the entire flex row on narrow viewports instead of scrolling inside its own wrapper — a real, shipped bug this system already hit once. Every table lives in its own `overflow-x-auto` div; the shell must let that div be the thing that scrolls.

**The Grid-Cols-1 Rule.** Any container using a responsive column count (`sm:grid-cols-2`, `lg:grid-cols-2`) declares its base column count explicitly (`grid grid-cols-1 sm:grid-cols-2`), never a bare `grid`. An implicit single-column grid track sizes to `auto` (max-content), so a `truncate` list item inside it silently forces the whole page wider than the viewport instead of eliding its text — a second real, shipped bug this system hit.

## Elevation & Depth

Mostly flat. The primary depth device is a hairline ring (`ring-1 ring-foreground/8`) on cards, not a shadow — paper sitting on paper needs an edge, not a glow. True box-shadows are reserved for things genuinely lifted off the page: the sticky reservation bar, the printed-receipt card, and a raffle number stub in its selected state.

### Shadow Vocabulary
- **Sticky lift** (`0 4px 16px -4px oklch(0.3 0.02 85 / 0.25)`): the reservation summary bar pinned to the bottom of the purchase flow.
- **Receipt lift** (`0 1px 2px oklch(0.3 0.02 85 / 0.08), 0 16px 32px -16px oklch(0.3 0.02 85 / 0.28)`): the confirmation receipt card — a soft, two-layer shadow, never a hard offset.
- **Selected-stub lift** (`0 3px 8px -2px var(--primary)`): a selected raffle number, combined with a 2px upward translate — a soft colored lift, not a flat block shadow.

### Named Rules
**No Flat Shadows.** This world is not neobrutalist. A `box-shadow` always carries blur; a zero-blur offset block shadow is a costume this system does not wear.

## Shapes

Base radius 0.5rem, scaled by a fixed multiplier ladder (`--radius-sm` at ×0.6 through `--radius-4xl` at ×2.6) so every rounded surface in the app derives from one number. The recurring silhouette is the dashed rule: 1.5px dashed hairline borders stand in for a receipt's perforated tear-line between table rows, list items, and page sections (`.receipt-divider`). The signature shape is the **stamp**: a 1.5px solid `currentColor` border, 0.3rem radius, rotated -2deg — never a soft pill, always slightly crooked like ink actually struck by hand.

## Components

### Buttons
- **Shape:** 0.5rem radius, built on Base UI (`components/ui/button.tsx`, `link-button.tsx` for anchor-rendered actions).
- **Primary:** solid emerald fill, emerald-ink text.
- **Outline / Ghost:** the default for secondary and repeated row-level actions (Baixar, Vincular, Filtrar) — outline is the workhorse variant across the admin surface, not an afterthought.

### Badges
- **Style:** `components/ui/badge.tsx` — `confirmed` / `pending` / `void` semantic variants map directly to the three status colors.
- **Stamp mode:** a `stamp` boolean prop overrides the pill styling with the rotated bordered stamp mark. Used everywhere a record's confirmed/void state is the point of the row (sale status, user active/inactive, document status).

### Cards / Containers
- **Corner style:** 0.5rem radius.
- **Background:** `--card` (one shade lighter than page).
- **Shadow strategy:** hairline ring at rest (see Elevation & Depth); shadow only on genuinely lifted elements.
- **Border:** dashed where the card is a data summary (stat tiles, the raffle price/availability header); solid hairline elsewhere.

### Tables / Lists
- **Style:** `.label-tag` uppercase headers, `.receipt-divider` dashed row separators (never solid `border-b`), `.font-figures` for every numeric cell. Wrapped in `overflow-x-auto` on data-dense tables so the shell's `min-w-0` content column can let the table — not the page — scroll horizontally.

### Inputs / Fields
- **Style:** hairline border, transparent background, 0.5rem radius.
- **Focus:** `focus-visible:ring-3` with the emerald-derived `--ring` token plus a border color shift — never an outline-only default.

### The Number Grid (signature component)
`app/rifas/[slug]/number-grid.tsx` — the buyer-facing raffle grid. Each number is a ticket-stub button: tabular number over an uppercase status caption, colored by the confirmed/pending/void vocabulary. A number that changes status while a buyer is looking at the page (someone else just bought it) gets a one-shot ripple (`stub-pulse`, a `box-shadow` ring expanding from `currentColor`) — the one live-reinforcement motion in the system, never applied speculatively to unrelated elements.

### The Receipt (signature component)
`app/rifas/[slug]/confirmacao/[saleId]/page.tsx` — the purchase confirmation. Content feeds in top-to-bottom on load (`receipt-feed`, a clip-path reveal, like a thermal printer), then the stamp lands with a slight overshoot (`stamp-in`) 0.35s later, never a plain fade. This is the one authored entrance moment in the system; it does not repeat as a generic per-section scroll animation elsewhere.

## Do's and Don'ts

### Do:
- **Do** render every money amount, date, ID fragment, and raffle number in `.font-figures`.
- **Do** use `.receipt-divider` (dashed) for row and section separators instead of solid `border-b`.
- **Do** collapse a KPI row into one `divide-dashed` card instead of N separately bordered stat tiles.
- **Do** give the admin shell's content column `min-w-0`, and give every responsive grid (`sm:grid-cols-N`, `lg:grid-cols-N`) an explicit `grid-cols-1` base — both are shipped-bug lessons, not style preferences.
- **Do** use `grid-cols-[repeat(auto-fit,minmax(Npx,1fr))]` for card grids that might render a single item.
- **Do** use the `stamp` badge mode for any confirmed/void state that is the point of the row.

### Don't:
- **Don't** use a flat, zero-blur `box-shadow` (the neobrutalist costume) — this world's depth is a hairline ring plus soft blur, never a hard offset.
- **Don't** put a kicker or eyebrow label directly above a heading as a category tag. The `stamp` mark is an authenticity/institutional signature, not an eyebrow, and is never paired with a heading as if it were one.
- **Don't** use a colored `border-left`/`border-right` on cards, list items, or alerts.
- **Don't** repeat the icon-plus-heading-plus-text card as page scaffolding — the label/value row (`.label-tag` + `.font-figures` or bold value) is this system's replacement for that template.
- **Don't** introduce a fourth status color. Confirmed, pending, and void cover every state this system needs.
