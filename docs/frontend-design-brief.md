# Design Brief — Multi-Rate Pricing Calculator

> Paste this whole document to your designer (human, v0, Figma Make, Lovable, etc.).
> It is written to be self-contained: no need to read the original assignment PDF.

---

## 1. What you're designing

A web app where a user builds **pricing documents** — quotes/proposals with line items — applies a
discount and a tax rate to each line, and reads back totals that are guaranteed correct. Documents
start as **drafts** (fully editable), then get **finalized** (permanently read-only). A separate
report rolls up totals across a date range.

**The single job of this interface: make money numbers trustworthy, and make editing them fast.**

Everything below serves that. If a decision doesn't make a number more believable or an edit
quicker, cut it.

**Audience:** one person managing their own quotes — a freelancer, agency owner, or ops person.
Not an accounting department. They know their own pricing; they don't know tax law and shouldn't
need to. They will do the same three motions hundreds of times: add a line, change a number,
finalize.

**Not** a landing page, not a marketing site. There is no hero, no pricing table, no testimonials.
It is a tool, and it opens on the user's data.

### Stack you're designing for (non-negotiable)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Styling | Tailwind CSS v4 (CSS-variable theming via `@theme inline`) |
| Components | **shadcn/ui** — New York style, Radix primitives underneath |
| Icons | Lucide (shadcn default) — do not introduce a second icon set |
| Theming | `next-themes` — light / dark / system, persisted, no flash on load |
| Forms | react-hook-form + zod, inline field-level errors |
| Tables | TanStack Table |
| Toasts | Sonner |
| Motion | CSS transitions + Framer Motion, used sparingly |
| Backend | Express + Prisma + Postgres, JWT auth |

Design **to shadcn's component anatomy**, not around it. If a screen needs something shadcn
doesn't ship, compose it from primitives and say which ones. Every deliverable should be
buildable by mapping your layers onto shadcn parts.

---

## 2. Design direction

### The problem with the obvious answer

The default for this brief is a generic SaaS dashboard: Inter, a blue primary, rounded cards on
grey, a sidebar, four stat tiles with gradient accents. It would be fine and forgettable.

Three looks to explicitly avoid, because they show up in every AI-assisted design regardless of
subject:
1. Cream background (`#F4F1EA`) + high-contrast serif display + terracotta accent.
2. Near-black background + one acid-green or vermilion accent.
3. Broadsheet layout — hairline rules, zero radius, dense newspaper columns.

### The direction: **Ledger Instrument**

Ground the design in the subject's real world: ledger paper, adding-machine tape, ink, the green
eyeshade. Not as skeuomorphic decoration — as a reason for every choice. A pricing document is a
*record*, and the interface should feel like a precise instrument for producing one.

The feeling: quiet, dense, exact. Generous where it aids reading, tight where density helps
scanning. Nothing bounces.

### Color

Four to six values carry the whole system. The palette encodes meaning, not mood — the three
quantities that always appear together (discount, tax, total) each get a fixed hue, used
identically in the line table, the totals rail, the report KPIs, and any chart. A user should
learn "amber means something was subtracted" once and have it hold everywhere.

**Light**

| Role | Hex | Use |
|---|---|---|
| Paper | `#F7F7F5` | app background |
| Surface | `#FFFFFF` | cards, table body, popovers |
| Ink | `#16181D` | primary text |
| Ink muted | `#697086` | labels, secondary text, table headers |
| Ledger green (primary) | `#0C6B58` | primary actions, focus ring, active nav, grand total |
| Discount amber | `#B45309` | discount amounts and chips (subtractive) |
| Tax indigo | `#5B54C9` | tax amounts and chips (additive) |
| Graphite | `#3F4652` | finalized/locked state |
| Brick | `#C0362C` | destructive + validation errors |

**Dark** — not an inversion. Ground shifts to a green-tinted black so the ledger green still reads
as the family's parent; accents lift in lightness and drop in chroma so figures stay legible on
dark without vibrating.

| Role | Hex |
|---|---|
| Ground | `#0C0F0E` |
| Surface | `#14181A` |
| Surface raised | `#1B2023` |
| Ink | `#E8EBE9` |
| Ink muted | `#8D95A3` |
| Ledger green | `#37B79A` |
| Discount amber | `#E0A05A` |
| Tax indigo | `#8E86F0` |
| Graphite | `#98A0AD` |
| Brick | `#E56A5D` |

Deliver final values in **oklch** (Tailwind v4 / shadcn convention) as well as hex.

Both themes must hold **4.5:1** on all text and **3:1** on interactive borders and focus rings.
The discount/tax/total hues must stay distinguishable from each other in both themes and for
red-green color-vision deficiency — never let hue be the *only* carrier of meaning; always pair it
with a sign (`−`, `+`) or a label.

### Typography

Two families, three roles. Do not use Inter/Playfair — the pairing should be specific to a
numeric instrument.

- **Chrome & headings** — a compact grotesque with tight tracking at large sizes.
  Suggested: **Instrument Sans**, or **Archivo**. Used with restraint: headings and nav only.
- **Body & UI** — the same family at normal tracking. One family covers both; the difference is
  weight and tracking, not typeface.
- **Every number** — a monospace with true tabular figures. Suggested: **Geist Mono** or
  **IBM Plex Mono**. This is the point of the pairing: the mono *is* the instrument. Money,
  percentages, quantities, dates in tables, IDs — all mono. Prose is never mono.

Set a real scale (suggested, adjust with reason): 32 / 24 / 20 / 16 / 14 / 13 / 11px, with 11px
reserved for uppercase micro-labels at wide tracking (~0.08em). Body 14px. Table numbers 13–14px.

`font-variant-numeric: tabular-nums` is mandatory on every numeric cell so columns of figures
align on the decimal as the user types.

### Layout

- **App shell:** a fixed left sidebar (Documents, Report, plus user menu and theme toggle pinned
  to the bottom), collapsible to icons. Content is a single scrolling column with a max width of
  ~1400px. Not a card-grid dashboard.
- **Document editor:** two columns. Line items take ~68% on the left; a **sticky totals rail**
  holds the right. The rail never scrolls out of view — the whole point is watching the grand
  total respond as you edit.
- 8px spacing grid. Radius scale: 6px controls, 10px cards, full only on pills/avatars.
- Borders do structural work here — a 1px hairline in a low-contrast border token separates table
  rows and column groups. Shadows are near-absent; use them only for genuinely floating layers
  (popover, dialog, dropdown).

### Signature element: the derivation tape

**This is the one thing the app is remembered by. Spend the design budget here and keep
everything around it quiet.**

Any line item expands into an adding-machine tape that shows the arithmetic, step by step, in
mono, right-aligned on the decimal:

```
   2 × 100.00              200.00
 − 10%                    − 20.00
                        ─────────
   after discount          180.00
 + 5% tax                 +  9.00
                        ═════════
   line total              189.00
```

Discount rows in amber, tax rows in indigo, the resolved total in ink. Single rule above a
subtotal, double rule above a final. When rounding actually changes a value, the tape shows the
unrounded figure struck through beside the rounded one — a user who wonders "where did that cent
go?" gets an answer instead of a support ticket.

The same tape treatment renders the **document totals** in the sticky rail, at a larger size:
subtotal, total discount, total tax, double rule, grand total.

Design the tape in three densities: inline hover preview (compact, in a hover-card), expanded row
(full, inside the table), and the totals rail (largest).

### Motion

One orchestrated moment, not scattered effects.

- **The finalize transition** is the moment: the document visibly becomes a record. The status
  badge settles into a graphite stamp, editable fields resolve into static type, and the rail's
  grand total gets a single confident emphasis. ~400ms, one sequence, never repeats.
- Everything else is 120–160ms ease-out on hover/focus/expand.
- Numbers that change after a server recalculation should transition in a way that reads as
  *settling*, not spinning. No slot-machine odometers.
- `prefers-reduced-motion: reduce` removes all of it, including the finalize sequence.

---

## 3. Formatting rules for numbers (design these literally)

These are correctness rules, not preferences. The whole assignment is judged on them.

- **The user picks a currency per document**, so none of these rules may hardcode `$` or two
  decimal places. Design the money treatment against at least three: **USD** (2 decimals, `$`
  prefix, 3-3 grouping), **INR** (2 decimals, `₹` prefix, 2-2-3 lakh grouping — `₹5,90,000`), and
  **JPY** (**0** decimals, `¥` prefix — `¥12,400`, never `¥12,400.00`). A layout that only works
  at two decimal places is wrong.
- Money always shows the currency's full minor-unit precision. For USD, `180` is wrong and
  `180.00` is right — never truncate a trailing zero. For JPY, `1200.00` is wrong and `1200` is
  right.
- Thousands separators follow the currency's locale on display; none inside an input while
  focused.
- All numeric columns **right-aligned**, tabular figures, mono.
- Subtractive amounts show a leading `−` and use the discount hue: `− 20.00`.
- Additive tax amounts show a leading `+` and use the tax hue: `+ 9.00`.
- A computed zero is `0.00`. An *absent* input is `—`. These are different states and must look
  different: a line with no discount shows `—` in the discount input and `0.00` in the discount
  amount column.
- The currency symbol is a static affix inside the input's leading slot, not typed text, and it
  reflects the document's chosen currency. Percent `%` is a trailing affix. Symbols vary in width
  (`$` vs `₹` vs `KD`), so the affix slot must not shift the column's decimal alignment.
- Percent inputs accept up to 2 decimals (`8.25%`).
- Dates are `MMM D, YYYY` in prose and `YYYY-MM-DD` in table columns.

**Totals are computed on the server. The client is never the source of truth.** So design a
**recalculating state** for every derived number: after an edit, figures shift to a muted weight
with a subtle shimmer until the server responds, then settle. This must be visible but not
alarming — it happens on every keystroke-debounce. Design it for the totals rail, the line total
column, and the report KPIs.

Add a small `?` affordance next to the totals rail heading opening a popover with the rounding
policy in plain words:

> Each line is rounded to 2 decimal places after the discount and again after tax. Document
> totals are the sum of those rounded line amounts, so they always match what you see per line.

---

## 4. Screen inventory

Every screen below needs **light and dark**, and every listed state is a required frame.

### 4.1 Auth — sign up, log in

Split layout: form on one side, a quiet expression of the direction on the other (consider a
faint ledger-rule field or a static tape fragment — nothing animated, nothing stock-photo).

States: empty · focused · submitting · field errors (invalid email, password too short) ·
form error banner (email already registered / email or password is incorrect) · success →
redirect.

Copy: errors state what happened and how to fix it. "Email or password is incorrect" — never
reveal which. No apologies.

### 4.2 Documents list

The app's home. Table columns: Title · Customer · Issue date · Status · Lines · Grand total ·
row actions.

Required frames:
- **Loading** — skeleton rows, correct column widths, no spinner.
- **Empty, never created** — an invitation to act, one primary button: "Create your first
  document."
- **Empty after filtering** — different copy, plus "Clear filters."
- **Populated** — at least 8 rows of realistic data (see §6).
- **Filter bar** — status segmented control (All / Draft / Finalized), issue-date range picker,
  search by title or customer.
- **Sorted** — sort affordance on Issue date and Grand total.
- **Row menu** — Open · Finalize (drafts only) · Duplicate to new draft (finalized only) ·
  Print · Delete (drafts only; on a finalized row the item is absent, not disabled).
- **Delete confirmation** — names the document, states it can't be undone.
- **Load failure** — inline retry, not a full-page error.

Status badges: **Draft** in ledger green outline; **Finalized** in graphite with a solid, stamped
feel. These two must be distinguishable at a glance from 2ft away — status is the single most
important attribute in this table.

### 4.3 Document editor (draft) — the primary screen

**Header:** inline-editable title, customer field, issue date picker, **currency picker**, Draft
badge, and a save indicator. Actions: Finalize (primary) · Print · Delete · back.

**The currency picker has two states worth designing.** It's freely editable while the document
has no line items. Once the first line exists it locks, because reinterpreting stored amounts under
a different currency would silently re-denominate them. Design the locked state so it reads as
*settled*, not broken, with a tooltip explaining why: "Currency is set once a document has line
items. Remove all lines to change it."

**Line items table.** Columns:

`#` · Description · Qty · Unit price · Discount · Tax % · Line total · expand · row menu

The four intermediate figures (line subtotal, discount amount, after discount, tax amount) live in
the **derivation tape**, not as always-visible columns — that's what keeps the table readable at
10 lines while remaining fully auditable. Provide an optional "Show all columns" toggle that
reveals them inline for users who want the full grid.

**The discount control is the most delicate part of the screen.** A line may have a percent
discount **or** a fixed-amount discount — **never both**. Design this as a segmented control
(shadcn `ToggleGroup`): `—` / `%` / `$`. Selecting one clears the other's value. The input's affix
changes with the selection. The UI must make the illegal state unreachable, and the design should
still show what the API's rejection of that state looks like (see §5) for the case of a stale tab.

Required frames:
- Empty document — a single prompt row, "Add your first line."
- Populated — the sample document from §6, exact numbers.
- A row expanded showing the derivation tape.
- Row hover showing the compact tape hover-card.
- Adding a row (focus lands in Description; `Enter` on the last field adds another row).
- Reordering rows (drag handle, drop indicator).
- Removing a row.
- Recalculating state (see §3).
- Save indicator in all four states: `Saved` · `Saving…` · `Saved 2 minutes ago` · `Couldn't save
  — retry`.
- Unsaved-changes dialog on navigate away.
- Mobile: the table becomes stacked cards, one per line, with the tape inline; the totals rail
  becomes a sticky bottom bar that expands on tap.

**Sticky totals rail:** Subtotal · Total discount (amber, `−`) · Total tax (indigo, `+`) · double
rule · Grand total (largest figure on the page, ledger green). Below it: rounding-policy `?`,
and a line count. The Finalize button lives at the bottom of the rail — the natural end of the
downward reading motion.

### 4.4 Validation — design each of these as a real frame

Every one of these is a graded test case. Inline, field-level, specific. Never "Invalid input."

| # | Condition | Message |
|---|---|---|
| 1 | Description empty | Add a description. |
| 2 | Quantity < 1 | Quantity must be at least 1. |
| 3 | Quantity not a whole number | Quantity must be a whole number. |
| 4 | Unit price negative | Unit price can't be negative. |
| 5 | Discount percent outside 0–100 | Discount percent must be between 0 and 100. |
| 6 | Fixed discount exceeds that line's subtotal | Discount can't be more than this line's subtotal of $200.00. |
| 7 | Tax percent outside 0–100 | Tax percent must be between 0 and 100. |
| 8 | Both discount types set (stale client) | A line can have a percent discount or a fixed discount, not both. |
| 9 | Title empty | Add a title. |
| 10 | Customer empty | Add a customer name. |
| 11 | Issue date empty or unparseable | Choose an issue date. |
| 12 | Currency changed on a document that has lines | Currency can't change once a document has line items. Remove all lines to change it. |
| 13 | Decimals typed into a 0-decimal currency (JPY) | Amounts in Japanese yen don't use decimals. |

Also design:
- **A single field in error** — brick border, brick helper text below, error icon in the affix
  slot, the row marked in the gutter so it's findable when scrolled.
- **Multiple errors at once** — a summary alert above the table: "3 lines need attention" with
  jump links to each. Errors must be findable in a 20-line document without scroll-hunting.
- **Error state inside a dense table cell** — the message can't fit under a narrow cell, so show
  the border + icon in-cell and the text in a popover on focus/hover. Design both.
- **A server rejection the client didn't catch** — a form-level alert that maps the API's field
  path back to the offending row and scrolls to it.

Note for the build: rule 6 **rejects** rather than clamps, and rules 5/7 bound percent to 0–100.
These are documented decisions — the interface should never silently alter a number the user
typed.

### 4.5 Finalize

- **Confirmation dialog.** Shows a totals snapshot (the tape, compact) and states the consequence
  plainly: "Once finalized, this document can't be edited. You can duplicate it into a new draft
  at any time." Buttons: `Finalize document` / `Cancel`. The action keeps its name through the
  whole flow — the resulting toast says "Document finalized."
- **Finalize blocked.** If any line has quantity ≤ 0 or a negative price, the dialog turns into a
  blocking state listing the offending lines with jump links. Primary button becomes `Fix lines`.
- **The transition** — the motion moment described above.

### 4.6 Document view (finalized) — read-only

Not "the editor with `disabled` on everything." Disabled inputs read as broken. Design a genuinely
different treatment: fields resolve into static typeset values, the table loses its input chrome
and becomes a printed record, and the totals rail keeps the tape but drops the recalculating
state.

Required frames:
- The locked banner: what's locked, and what the user can still do (duplicate, print). Graphite,
  informational — not a warning.
- The finalized stamp treatment on the status badge.
- Available actions: `Duplicate to new draft` · `Print` · back.
- **The rejection toast** — if an edit reaches the API from a stale tab, the API returns a
  conflict and the UI shows: "This document is finalized and can't be edited." plus a `Refresh`
  action. Design this toast.
- **Duplicate success** — toast: "Draft created." with an `Open draft` action.

### 4.7 Summary report

Filtered by issue-date range. Reconciliation is the graded criterion here: the KPI numbers must
visibly equal the sum of the table below them.

- **Date range control** with presets: This month · Last month · Last 90 days · Year to date ·
  Custom.
- **Four KPI cards, repeated per currency:** Documents · Sum of grand totals (ledger green) · Sum
  of total tax (indigo) · Sum of total discount (amber). Large mono figures. No gradients, no
  sparkline-for-decoration — a sparkline only if it carries real information.
- **Currency grouping is the hard layout problem here.** Amounts in different currencies are never
  summed — there is no FX conversion anywhere in this product — so a range containing USD and INR
  documents produces two full KPI sets, and the breakdown table sections to match. Design this for
  one currency (the common case, and it should feel like a normal report, not a special case), for
  two, and for four. The single-currency case must not look like a group of one.
- **A toggle for whether drafts are included** in the rollup, defaulting to including both, with
  the current mode stated in words near the KPIs ("Drafts and finalized documents"). This
  ambiguity is real and the interface should resolve it visibly rather than hide it.
- **Breakdown table** of every document in range with its own subtotal / discount / tax / grand
  total, and a **totals row that matches the KPI cards exactly**. Same column formatting as
  everywhere else.
- Optional: one chart of grand total over time. Only if it earns its place — bars, one hue, no
  legend needed for a single series.

States: loading (skeleton KPIs) · populated · empty range ("No documents issued between Mar 1 and
Mar 31.") · invalid range (end before start → inline error on the control, no request fired).

### 4.8 Printable view

A dedicated print layout: no app chrome, no sidebar. Document header, customer, issue date, status,
the line table with all intermediate columns visible, the totals block. Must be legible in
monochrome — so the amber/indigo semantics fall back to `−`/`+` signs and column labels. Define
page-break behavior for a document that runs past one page, and repeat the table header on
continuation pages.

### 4.9 Global states

- Theme toggle: light / dark / system, in the sidebar footer.
- Toasts: success, error, and one with an action button. Bottom-right.
- 404 and a generic error boundary. Requesting another user's document returns 404, not 403 — so
  design only the 404.
- Session expired mid-action: toast plus redirect to log in, returning to the intended page after.
- Focus-visible treatment on every interactive element — a 2px ledger-green ring with offset.
  Design it once, apply it everywhere, and show it on at least a button, an input, a table row,
  and a segmented control.

---

## 5. Component checklist (shadcn mapping)

Deliver each with **default / hover / focus-visible / active / disabled / error / read-only** where
applicable, in both themes.

`button` (default, secondary, ghost, destructive, sizes sm/default) · `input` (with leading and
trailing affix slots) · `label` · `form` message · `table` (dense, with a right-aligned numeric
cell variant) · `badge` (draft, finalized) · `card` · `dialog` · `alert-dialog` · `alert` (error,
info) · `dropdown-menu` · `popover` · `hover-card` (the compact tape) · `collapsible` (the expanded
tape) · `calendar` + date-range picker · `select` · `toggle-group` (the discount type control and
the status filter) · `switch` · `tooltip` · `skeleton` · `separator` · `sonner` toast · `sheet`
(mobile line editor) · `sidebar` · `breadcrumb` · `pagination` · `scroll-area` · `avatar`.

**Custom compositions to spec explicitly** (shadcn has no primitive for these):
1. **Derivation tape** — three densities.
2. **Money input** — affix slot, tabular alignment, right-aligned text, error variant.
3. **Discount type control** — the toggle-group + input pair as one unit.
4. **Totals rail** — sticky, with the recalculating state.
5. **Numeric table cell** — alignment, sign, hue, muted-while-recalculating.
6. **Empty state block** — icon, one line of direction, one primary action. Used in five places.

### Token deliverable

Hand back both themes as shadcn CSS variables so they drop straight into `globals.css`:

`--background` `--foreground` `--card` `--card-foreground` `--popover` `--popover-foreground`
`--primary` `--primary-foreground` `--secondary` `--secondary-foreground` `--muted`
`--muted-foreground` `--accent` `--accent-foreground` `--destructive` `--border` `--input`
`--ring` `--chart-1`…`--chart-5` `--sidebar` and its variants.

Plus these project-specific extras:

`--amount-discount` `--amount-tax` `--amount-total` `--state-draft` `--state-finalized`
`--tape-rule`

---

## 6. Use this exact data in every mock

Do not use lorem ipsum or placeholder numbers. This is the assignment's reference document and
these figures are the correctness check — a mock with different numbers can't be verified.

**Document:** "Q3 Platform Retainer" · Northwind Trading Co. · Issued 2026-08-08 · **USD** · Draft

| # | Description | Qty | Unit price | Discount | Tax |
|---|---|---|---|---|---|
| 1 | Widget A | 2 | 100.00 | 10% | 5% |
| 2 | Widget B | 1 | 50.00 | — | 5% |
| 3 | Service fee | 1 | 200.00 | $20.00 fixed | — |

**Per line (what the tape must show):**

| Line | Subtotal | Discount | After discount | Tax | Line total |
|---|---|---|---|---|---|
| Widget A | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

**Document totals (the sticky rail):**

| | |
|---|---|
| Subtotal | 450.00 |
| Total discount | − 40.00 |
| Total tax | + 11.50 |
| **Grand total** | **421.50** |

For the list and report screens, invent 8–10 sibling documents in the same register — real
customer names, a mix of draft and finalized, grand totals from roughly 300 to 12,000, issue dates
spread over three months. Titles should sound like work someone actually sells ("Brand refresh —
phase 2", "Annual support retainer"), never "Document 1".

**Mix the currencies in that set.** Mostly USD, two or three in INR, and at least one in JPY. The
JPY document is the important one — it has **no decimal places at all**, and it will expose any
layout that assumed two. Include it in the date range the report screens use, so the
currency-grouped report has something real to group.

---

## 7. Responsive & accessibility floor

- Breakpoints: ≥1280 full two-column editor · 768–1279 rail collapses under the table · <768 the
  line table becomes stacked cards and the rail becomes a sticky bottom summary bar that expands
  on tap.
- The sidebar collapses to icons at ≤1024 and becomes a sheet at <768.
- Touch targets ≥44px on mobile; the dense desktop table may go tighter.
- Full keyboard operation of the line table: Tab moves across fields, Enter on the last field of
  the last row adds a row, Escape cancels an inline edit. Show the tab order in your handoff.
- Every state that uses hue also uses a sign, an icon, or a word.
- Contrast: 4.5:1 text, 3:1 interactive borders and focus rings, in both themes.
- `prefers-reduced-motion` honored, including the finalize sequence.

---

## 8. What to hand back

A Figma file organized as:

- **00 Foundations** — color tokens (light + dark, hex and oklch, named to the shadcn variables),
  type scale with the chosen families, spacing and radius scales, elevation, focus treatment, icon
  usage.
- **01 Components** — the checklist in §5, every state, both themes.
- **02 Screens — light** — every screen and state in §4.
- **03 Screens — dark** — the same set. Not an auto-inverted duplicate; verify each.
- **04 Responsive** — the editor, list, and report at all three breakpoints.
- **05 Prototype** — two flows clickable: (a) create a document → add three lines → hit a
  validation error → fix it → finalize; (b) open the report → change the range → read the
  reconciled totals.
- **06 Print** — the printable view.

Plus: tokens exported as JSON or a CSS-variable block, and a one-page note on any decision you
made that the brief left open.

---

## 9. Where to spend the effort

In order:

1. **The document editor** — line table, discount control, derivation tape, totals rail, and every
   validation state. This is where the user spends 90% of their time and where the work is judged.
2. **Draft vs finalized** — the two states must be unmistakable at a glance, and the finalized
   treatment must read as *complete*, not as *broken*.
3. **The report** — the reconciliation between KPI cards and the breakdown table.
4. Everything else.

Auth, the sidebar, and the 404 should be clean and quiet. Do not spend your one aesthetic risk
there — spend it on the tape.
