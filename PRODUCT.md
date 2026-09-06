# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two distinct audiences on two different surfaces:

- **Committee members** (`/admin/*`, authenticated): students volunteering to organize their own graduation, doing this alongside coursework, with three roles — `ADMIN` (full control: raffles, finances, users, settings), `VENDEDOR` (assisted in-person sales, no financial access), `VISUALIZADOR` (read-only financial oversight, e.g. an advisor or auditor role). They check in on this daily/weekly, not as their job — it has to be fast to scan, not a chore to operate.
- **Public raffle buyers** (`/rifas/*`, anonymous, no login): friends, family, and community reached via a shared link (WhatsApp, Instagram). Wide age range, including parents/grandparents — do not assume tech-savvy visitors. One-time visit to pick numbers and pay; never coming back to "manage" anything.

## Product Purpose

Replaces the WhatsApp group + spreadsheet + physical raffle notebook a graduation committee normally runs on. Tracks two things end to end: raffle number sales (reservation → payment → confirmation, self-service or admin-assisted) and the financial ledger (income, expenses, categories, suppliers) — with a full audit trail on every edit. Success means the committee always knows, with certainty, exactly how much money exists and which numbers are sold, and never has to say "let me check the notebook."

## Positioning

What a spreadsheet or notebook cannot truthfully offer:

- **Concurrency-safe number selling** — two people genuinely cannot buy the same raffle number; reservation and sale are atomic at the database level, not "hope nobody clicks at the same time."
- **Real audit trail, not tribal memory** — every financial edit or deletion requires a stated reason and is permanently logged with before/after values. A spreadsheet cell just silently changes.
- **Real-time public availability** — a buyer sees which numbers are actually free right now, not a notebook someone forgot to update.

## Operating Context

- Runs on Supabase (Postgres + Auth + Storage) as the sole backend; real money is tracked in BRL, always as integer cents.
- Committee workflow: create a raffle, watch numbers sell (self-service public checkout or vendor-assisted), log income/expenses as money actually moves, review the dashboard/reports before meetings.
- Public buyer workflow: land on a shared raffle link, pick numbers, pay via PIX (upload proof, validated server-side) or cash (confirmed in person), get a receipt.
- Hosted on free-tier infrastructure (Vercel + Supabase) — no operating budget. Real network latency exists (page loads currently ~750ms–1.4s in production); design should not add perceived weight on top of that.
- No dedicated designer or budget — this skill session is the one shot at raising the visual bar.

## Capabilities and Constraints

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui on **Base UI** (not Radix) — component primitives are fixed; `render={<X/>}` composition, not `asChild`.
- Every business-critical mutation (reserve/confirm/cancel a raffle sale, edit/delete a financial entry) is enforced server-side via Postgres RPCs under RLS — the UI reflects server-validated state, never assumes an optimistic action succeeded before confirmation.
- Small, single-class user base — not built or designed for scale; clarity beats configurability.
- Google Drive integration exists as a stub, deliberately unconfigured — not a design concern right now.

## Brand Commitments

No existing logo, palette, or visual identity — explicitly open to creating one from scratch. Event identity (name/course/class) is admin-configurable data, not hardcoded copy; currently seeded as "Comissão de Formatura — Técnico em ADS 2026" (Análise e Desenvolvimento de Sistemas, 3º ADS) but that's operator-entered content, not a fixed brand fact.

## Evidence on Hand

Only fictitious demo data exists today (one seeded raffle, sample sales, sample financial entries) — no real committee data, testimonials, or press yet. Nothing here should be treated as a claim to reuse or a pattern to imitate as "real usage."

## Product Principles

1. **Every number tells the truth at a glance** — no "let me check," state is always current and legible without explanation.
2. **Money is sacred** — every edit and deletion is audited; precision (cents, not floats) and traceability are non-negotiable, and the UI should make that rigor feel reassuring, not bureaucratic.
3. **Two jobs, two tempos** — the admin panel is a daily-use tool (dense, fast, scannable); the public raffle page is a one-time conversion moment (has to build confidence and be worth acting on immediately).
4. **Built by a volunteer student committee, must not look amateur** — no budget and no designer is exactly why the tool itself is the professionalism proof point for the class's fundraiser.
5. **Never fake state** — real-time availability and a real audit trail, no manufactured urgency or dark patterns on the public side despite it being a persuasive/conversion surface.

## Accessibility & Inclusion

Public raffle buyers span a wide age range, including visitors unfamiliar with typical app conventions (parents, grandparents). No formal accessibility standard has been mandated, but the public purchase flow in particular should not assume tech fluency.
