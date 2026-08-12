# Multi-Rate Pricing Calculator

Build pricing documents with line items, apply a discount and a tax rate to each line, and read
back totals that are guaranteed correct. Documents start as drafts, then get finalized into
permanently read-only records. A summary report rolls up totals across an issue-date range.

**Live URL:** _pending deployment_
**Demo account:** `demo@multicalc.app` / `demo1234` — seeded with the specification's reference
document plus 11 siblings across six currencies.

---

## Contents

- [Prerequisites and setup](#prerequisites-and-setup)
- [Calculation and rounding policy](#calculation-and-rounding-policy)
- [Worked example](#worked-example)
- [Finalize and immutability rules](#finalize-and-immutability-rules)
- [Multi-currency handling](#multi-currency-handling)
- [Architecture](#architecture)
- [API](#api)
- [Testing](#testing)
- [Assumptions and tradeoffs](#assumptions-and-tradeoffs)
- [What I would improve before production](#what-i-would-improve-before-production)

---

## Prerequisites and setup

- Node.js 20 or newer
- A PostgreSQL 14+ database (a [Neon](https://neon.tech) free-tier project works)

```bash
git clone <repository> && cd multi-calc
npm install                       # also builds packages/calc via its prepare script

cp apps/api/.env.example apps/api/.env
#   set DATABASE_URL to your Postgres connection string
#   set JWT_SECRET to at least 32 random characters (the app refuses to boot otherwise)

cp apps/web/.env.local.example apps/web/.env.local
#   NEXT_PUBLIC_API_URL=http://localhost:4000

npm run test                      # 216 unit tests on the calculation engine — no DB needed
npm run db:migrate                # create the schema
npm run db:seed                   # demo user + reference document + 11 siblings

npm run dev:api                   # http://localhost:4000
npm run dev:web                   # http://localhost:3000
```

Sign in with the demo account and open **Q3 Platform Retainer** to see the reference document
totalling `$421.50`.

### Verification

```bash
npm run verify        # everything below, in one gate
npm run test          # 216 unit tests   — the calculation engine
npm run typecheck     # calc + api + web, including prisma/ and scripts/
npm run lint          # eslint across the web app
npm run db:verify     #  24 probes       — raw SQL proving the DB refuses invalid data
npm run api:verify    # 110 checks       — the HTTP surface, end to end against a real database
```

---

## Calculation and rounding policy

### Money representation

Every monetary value is a **signed integer count of the currency's minor units** — cents for USD,
whole yen for JPY, fils for KWD. No floating-point number ever holds an amount, in the database,
on the wire, or in the engine. Percentages are stored as **basis points** (825 means 8.25%), which
keeps a two-decimal tax rate from reintroducing the drift integer money exists to avoid.

The minor unit is not universally two decimal places, so the exponent travels with the document:

| Exponent | Currencies | Example | Stored as |
|---|---|---|---|
| 0 | JPY, KRW | ¥12,400 | `12400` |
| 2 | USD, EUR, GBP, INR, AED, AUD, CAD, SGD | $421.50 | `42150` |
| 3 | KWD, BHD | KD 1.250 | `1250` |

### The policy

> **Round half away from zero, to the currency's minor unit, at exactly two points per line:
> after computing the discount amount, and after computing the tax amount. Document totals are
> the sum of the already-rounded line figures — never a recomputation from unrounded
> intermediates.**

Because amounts are already integer minor units, "round to the currency's minor unit" is the same
operation as "round to an integer". That is what makes the arithmetic currency-agnostic: the
exponent matters when parsing and formatting a value, not when computing with one.

Two consequences follow, both deliberate:

1. **A document's grand total always equals the visible sum of its line totals.** There is no cent
   that appears only at the bottom of the page.
2. **`subtotal − totalDiscount + totalTax = grandTotal`** also holds, because each component sums
   the same rounded per-line values. The invariant is asserted in the engine, in the service that
   writes it, and as a database CHECK constraint.

Half away from zero is chosen over banker's rounding because it matches the arithmetic a reader
performs by hand when checking a quote. Predictability to a human outweighs the marginal
statistical bias banker's rounding avoids, in a document somebody signs.

### Per-line algorithm

```
1.  lineSubtotal   = quantity × unitPrice                exact — both operands are integers
2.  discountAmount = round(lineSubtotal × discountBp / 10000)   ← rounding point 1
                     or the fixed amount
                     or zero
3.  afterDiscount  = lineSubtotal − discountAmount
4.  taxAmount      = round(afterDiscount × taxBp / 10000)       ← rounding point 2
5.  lineTotal      = afterDiscount + taxAmount
```

Tax is applied to `afterDiscount`, never to `lineSubtotal`. Steps 1, 3, and 5 need no rounding —
multiplying and adding integers is exact.

---

## Worked example

The specification's reference document, in USD. All intermediate values in minor units (cents).

| Line | Qty | Unit price | Discount | Tax |
|---|---|---|---|---|
| Widget A | 2 | 100.00 | 10% | 5% |
| Widget B | 1 | 50.00 | — | 5% |
| Service fee | 1 | 200.00 | $20.00 fixed | — |

```
Widget A     subtotal   = 2 × 10000                 = 20000
             discount   = round(20000 × 1000/10000) =  2000
             after      = 20000 − 2000              = 18000
             tax        = round(18000 ×  500/10000) =   900
             lineTotal  = 18000 + 900               = 18900   → $189.00

Widget B     subtotal   = 1 × 5000                  =  5000
             discount   = none                      =     0
             tax        = round(5000 × 500/10000)   =   250
             lineTotal  =  5000 + 250               =  5250   →  $52.50

Service fee  subtotal   = 1 × 20000                 = 20000
             discount   = 2000 (fixed, ≤ subtotal)  =  2000
             after      = 20000 − 2000              = 18000
             tax        = none                      =     0
             lineTotal  =                           = 18000   → $180.00

Document     subtotal      = 20000 + 5000 + 20000   = 45000   → $450.00
             totalDiscount =  2000 +    0 +  2000   =  4000   →  $40.00
             totalTax      =   900 +  250 +     0   =  1150   →  $11.50
             grandTotal    = 18900 + 5250 + 18000   = 42150   → $421.50

             check: 45000 − 4000 + 1150 = 42150                ✓
```

### Rounding under pressure

A case where both rounding points engage:

```
qty 3 · unit price $9.99 · discount 7.5% · tax 8.25%

  subtotal   = 3 × 999                    = 2997
  discount   = 2997 × 750/10000 = 224.775 →  225   (half away from zero)
  after      = 2997 − 225                 = 2772
  tax        = 2772 × 825/10000 = 228.69  →  229
  lineTotal  = 2772 + 229                 = 3001   → $30.01
```

### A zero-decimal currency

```
qty 3 · unit price ¥1,200 · discount 10% · tax 10%   (JPY, exponent 0)

  subtotal 3600 → discount 360 → after 3240 → tax 324 → lineTotal 3564 → ¥3,564
```

Rendered as `¥3,564`, never `¥3,564.00`. A JPY document is included in the seed data specifically
so any layout or formatter that assumes two decimal places shows its seam.

### Seeing the arithmetic in the app

Every line in the editor expands into a derivation tape showing these steps, and the same
treatment renders the document totals in the sticky rail:

```
   2 × 100.00              200.00
 − 10%                    − 20.00
                        ─────────
   after discount          180.00
 + 5% tax                 +  9.00
                        ═════════
   line total              189.00
```

The rounding policy is also stated in plain words behind the `?` beside the totals, so it is
legible in the product rather than only here.

---

## Finalize and immutability rules

| Status | Behaviour |
|---|---|
| `DRAFT` | Fully editable — add, edit, remove, and reorder lines; change metadata |
| `FINALIZED` | Read-only. No edits to lines, amounts, or metadata. Terminal state. |

### The operation matrix

| Operation | Draft | Finalized | Rejection |
|---|---|---|---|
| Read, print | allowed | allowed | — |
| Update title, customer, issue date | allowed | rejected | 409 |
| Change currency | only with no lines | rejected | 409 |
| Add / edit / delete / reorder lines | allowed | rejected | 409 |
| Finalize | allowed | rejected | 409 |
| Delete document | allowed | rejected | 409 |
| Duplicate into a new draft | allowed | allowed | — |

### How it is enforced

Immutability is a **single guard** ([`requireDraft`](apps/api/src/guards/requireDraft.ts)) applied
as middleware to every mutating route — not a conditional repeated inside each handler, because a
rule expressed in a dozen places will eventually be omitted from the thirteenth. The API returns
`409 CONFLICT` with a clear message, and the interface surfaces it with a **Refresh** action, since
the realistic cause is a stale browser tab.

`apps/api/scripts/verify-api.ts` attempts **eight different mutations** against a finalized
document and asserts every one is refused and the document is byte-for-byte unchanged afterward.

### Finalize preconditions

Finalization is refused, leaving the document untouched, if:

- the document has no line items, or
- any line has quantity ≤ 0, or a negative unit price

The `422` response enumerates every offending line by position, so the interface lists them all
rather than making the user fix them one at a time. (These conditions are also unreachable through
the API, because both the schema and a database CHECK constraint refuse them at write time — the
finalize check is defence in depth.)

### Duplicate — yes, and it is the only way back

Duplicating a finalized document is supported, and it is the only route from a closed record to an
editable one. It is how a user revises a quote without falsifying the original.

- The copy is a `DRAFT` with `finalizedAt` null
- Title gains a `(copy)` suffix; customer and currency carry over
- **Issue date is set to today, not copied** — a copy is a new document, issued now
- All lines are copied, and **totals are recomputed from the copied inputs rather than copied**, so
  a duplicate is always internally consistent with the engine as it stands

---

## Multi-currency handling

Currency is chosen by the user, **per document** — a quoting tool has to bill an Indian customer in
INR and an American one in USD from the same account. The user's most recent choice becomes the
default for their next document.

Three consequences, each of which would otherwise be a silent bug:

**Currency is locked once a line exists.** A draft holding `10000` minor units as USD is $100.00;
reading that same integer as JPY makes it ¥10,000 — a hundredfold re-denomination from one dropdown
change, with nothing visible to indicate it. So the field is editable only while the document has
no lines to reinterpret. Removing every line unlocks it.

**The report groups by currency and never sums across them.** Adding an INR grand total to a USD
one produces a meaningless figure. A range containing both produces two independent sets of totals,
and the report says so in words.

**There is no FX conversion anywhere.** No rate source, no cached rate, no cross-currency
arithmetic. A stale exchange rate produces confidently wrong figures, which is worse in a financial
document than declining to convert.

Display formatting goes through `Intl.NumberFormat` with each currency's locale, so grouping is
correct: Indian numbering groups 2-2-3, rendering five hundred ninety thousand rupees as
`₹5,90,000` rather than `₹590,000`.

---

## Architecture

```
multi-calc/
├── packages/calc/        the shared calculation engine — pure TS, no I/O, no framework
│   ├── src/currency.ts   ISO codes, symbols, minor-unit exponents
│   ├── src/money.ts      integer minor-unit primitives, parse and format
│   ├── src/rounding.ts   the policy, in one place
│   ├── src/line.ts       computeLine()
│   ├── src/document.ts   computeDocument()
│   ├── src/schemas.ts    Zod schemas + every validation message
│   └── test/             209 tests
├── apps/api/             Express + Prisma + PostgreSQL
│   ├── src/guards/       loadDocument (ownership), requireDraft (immutability)
│   ├── src/services/     totals.ts — the ONLY writer of a computed column
│   └── src/modules/      auth, documents, lines, reports
└── apps/web/             Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
    ├── src/components/tape/       the derivation tape
    ├── src/components/money/      currency-aware inputs and numeric cells
    └── src/components/document/   discount control, currency select, totals rail
```

### Decisions worth naming

**One shared calculation module.** `packages/calc` is a real workspace package. The API imports it
to compute; the web app imports it for **types, schemas, and formatters only** — never to compute a
total.

**Totals are computed server-side, always.** Every mutation returns the *entire* document with
freshly computed figures, not a patch. The client therefore never merges partial state or derives a
total locally — the requirement is enforced structurally rather than by discipline. The interface
shows a visible pending state on every derived figure while the server recomputes.

**One write path for computed columns.** Nine denormalised columns exist (five per line, four per
document). [`services/totals.ts`](apps/api/src/services/totals.ts) is the only code permitted to
write any of them, inside a transaction.

**Computed amounts are persisted, not derived on read.** A finalized document must be a frozen
record: if the rounding policy were ever revised, documents finalized under the old rules must not
silently change value. It also makes the summary report a cheap aggregate query.

**Validation messages are authored once.** The Zod schemas live in `packages/calc` and are used by
both the API and the web forms, so the text a user sees while typing is identical to what the server
would return.

**Rules are enforced in depth.** "A line may have a percent discount or a fixed discount, not
both" is enforced three times: the interface makes the state unreachable, the schema rejects it, and
a database CHECK constraint refuses to store it.

**Auth is a JWT in an httpOnly cookie**, not localStorage. A token readable by JavaScript is
exfiltrable by any successful XSS. Every query is scoped by `userId` at the data-access layer, and
requesting another user's document returns **404, not 403** — a 403 would confirm the identifier
exists.

**CSRF is handled by an Origin check** — not by SameSite, and not by CORS. In production the cookie
is `SameSite=None`, because the web app and API sit on different domains; that is the setting which
*permits* cross-site sending. And CORS governs whether a response may be **read**, not whether a
request is **sent**: a form on any website could POST here with the victim's cookie attached, which
was enough to finalize someone's draft — irreversible. `middleware/csrf.ts` verifies `Origin` against
the allowlist on every state-changing method. A request carrying neither `Origin` nor `Referer` is
allowed, because CSRF requires a browser to attach the cookie and browsers always send `Origin` on
cross-origin mutations; a caller sending neither is not a browser and has no victim session.

**Signup still confirms whether an address is registered** — an accepted gap, not an oversight.
Login was hardened on both message and timing, but signup answers the same question one endpoint
over. Closing it needs email: respond generically and tell the user out of band. Without mail
infrastructure a generic response leaves a real user stuck with no route forward, for a privacy gain
against an attacker who can usually learn the same fact from a password-reset flow. The login fix
still matters, because login is the endpoint that can be hammered without side effects.

**The login timing oracle.** When no user matched, the password was compared against a hand-written
placeholder hash. bcrypt validates a hash's structure before doing any key derivation, so a string of
the wrong length is rejected instantly — **222ms for a registered address versus 0ms for an
unregistered one**, which is full user enumeration from a single request each. The comparison now runs
against a real hash computed once at module load, and both paths measure within 2% of each other.

**Line-level writes are serialised.** Every mutation takes `SELECT … FOR UPDATE` on the document and
recomputes from the locked row set, so concurrent edits cannot persist totals describing a set of
lines that no longer exists. Verified against eight simultaneous writes: contiguous positions and
totals matching the rows exactly.

---

## API

Base path `/api`. Amounts cross the wire as integers in minor units; percentages as basis points;
dates as `YYYY-MM-DD`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/signup` · `/auth/login` · `/auth/logout` | Session |
| GET | `/auth/me` | Current user |
| GET | `/documents` | List — `status`, `currency`, `from`, `to`, `q`, `sort`, `page`, `pageSize` |
| POST | `/documents` | Create a draft |
| GET | `/documents/:id` | Fetch with lines and totals |
| PATCH | `/documents/:id` | Update metadata or currency |
| DELETE | `/documents/:id` | Delete a draft |
| POST | `/documents/:id/finalize` | Close the document |
| POST | `/documents/:id/duplicate` | Copy into a new draft |
| POST | `/documents/:id/archive` | File a finalized document away |
| POST | `/documents/:id/unarchive` | Restore it, still finalized |
| POST | `/documents/:id/lines` | Append a line |
| PATCH | `/documents/:id/lines/:lineId` | Update a line |
| DELETE | `/documents/:id/lines/:lineId` | Remove a line |
| PATCH | `/documents/:id/lines/reorder` | Reorder by id array |
| GET | `/reports/summary` | `from`, `to`, `includeDrafts`, `includeDocuments` — grouped by currency |

### One error shape

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Quantity must be at least 1.",
    "fields": [{ "path": "quantity", "message": "Quantity must be at least 1." }]
  }
}
```

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Input failed a rule; `fields` names each path |
| 401 | `UNAUTHENTICATED` | Missing, expired, or invalid session |
| 404 | `NOT_FOUND` | No such record, **or** it belongs to another user |
| 409 | `CONFLICT` | Rejected by the lifecycle or currency-lock rule |
| 422 | `PRECONDITION_FAILED` | Finalize refused; `fields` lists the offending lines |

### Validation messages

Every rejection names the field and states the fix. A representative set:

| Condition | Message |
|---|---|
| Quantity < 1 | Quantity must be at least 1. |
| Quantity not a whole number | Quantity must be a whole number. |
| Unit price negative | Unit price can't be negative. |
| Discount percent outside 0–100 | Discount percent must be between 0 and 100. |
| Fixed discount exceeds line subtotal | Discount can't be more than this line's subtotal of $200.00. |
| Both discount kinds supplied | A line can have a percent discount or a fixed discount, not both. |
| Tax percent outside 0–100 | Tax percent must be between 0 and 100. |
| Currency changed with lines present | Currency can't change once a document has line items. Remove all lines to change it. |
| Decimals in a zero-decimal currency | Amounts in Japanese Yen don't use decimals. |
| Issue date does not exist | That date doesn't exist. |
| Report range inverted | The end date must fall on or after the start date. |

**A fixed discount larger than the line subtotal is rejected, not clamped.** Silently changing a
figure the author typed is the worse failure in a document a customer will read; the message names
the actual subtotal so the correction is obvious.

---

## Testing

```
216 unit tests         packages/calc — the highest-value surface
 24 constraint probes   raw SQL, bypassing every application guard
110 end-to-end checks   the HTTP surface against a real database
   + typecheck across calc, api and web, and eslint, in the same gate
```

The unit suite covers the reference document, both rounding points, tax-on-discounted-amount,
float-drift cases (`0.1 + 0.2`, `1.005`), the same line computed in a 0-, 2-, and 3-decimal
currency, format/parse round trips across every currency, storage bounds, and every validation
message. A 200-document property test with a seeded PRNG asserts the totals invariant holds.

`npm run db:verify` attacks the database directly with SQL, confirming it refuses both-discount-
kinds, an over-large fixed discount, a zero quantity, non-reconciling totals, and a `FINALIZED`
document with no `finalizedAt`. It includes a control case, so a green run means something.

`npm run api:verify` drives the real app over HTTP: the reference document reaching `$421.50`
through the API, nine validation messages, eight mutations refused on a finalized document,
ownership isolation returning 404 on four routes, and per-currency report reconciliation.

---

## Assumptions and tradeoffs

Points the specification left open, with the choice made.

| Question | Decision | Reasoning |
|---|---|---|
| Rounding | Half away from zero, to the currency's minor unit, after discount and after tax | Matches hand-checked arithmetic; keeps line and document figures reconciled |
| Document totals | Sum of rounded line figures | Guarantees the grand total equals the visible sum of the lines |
| Fixed discount above line subtotal | **Reject** | Never silently alter a figure the author typed |
| Percent bounds | 0–100 inclusive, two decimals, stored as basis points | Keeps the calculation in integer space |
| Quantity | Whole number, 1 to 1,000,000 | The spec requires ≥ 1; the ceiling keeps `qty × price` storable |
| Amount ceiling | 2,000,000,000 minor units | A PostgreSQL `INTEGER` tops out at 2,147,483,647; validation is bounded *below* storage so an over-large amount is a specific 400, never a driver error surfacing as a 500 |
| Currency scope | Per document, from a curated list of 12 | One account must quote different customers in different currencies |
| Currency mutability | Locked once lines exist | Prevents silent re-denomination of stored minor units |
| Cross-currency reporting | Grouped, never summed | A combined figure across currencies is meaningless |
| Foreign exchange | Not supported | A stale rate produces confidently wrong figures |
| Deleting a finalized document | Not permitted — archive it instead | A closed record is not disposable; archiving files it away without destroying it |
| Archiving | Finalized documents only, permanent until restored, restores **finalized** | Drafts are deleted, not archived. Restore preserving status keeps archive from becoming a route to un-finalize |
| Archived documents in the report | Excluded | Chosen knowingly: it means archiving changes historical totals, so the report states its inclusion mode in words. See docs/archive-feature.md §4 |
| Report scope | Drafts and finalized included by default, with a visible toggle | The spec is silent; the interface states the active mode in words |
| Duplicate issue date | Set to today, not copied | A copy is a new document, issued now |
| Unauthorised access | 404, never 403 | A 403 confirms the identifier exists |
| Lines per document | 200 |
| Search terms | LIKE metacharacters escaped, so a query of `50%` matches the literal text |
| Report breakdown | capped at 500 rows, with a flag saying so. The grouped totals stay exact at any scale — the list exists only to check the arithmetic |
| Password length | bounded by **bytes**, not characters, because bcrypt truncates at 72 bytes without warning |
| Destructive scripts | seed and both verify scripts refuse to run with `NODE_ENV=production` unless explicitly overridden | Keeps document totals inside the storage ceiling |

### Accepted tradeoffs

| Tradeoff | Cost | Why |
|---|---|---|
| Persisting computed amounts | Denormalised data that could drift | Finalized documents must be frozen records; contained by a single write path |
| httpOnly cookie over a bearer token | More configuration once deployed cross-origin | Removes an entire class of token theft via XSS |
| Client-side data fetching | Forgoes server-component rendering | The editor's edit-and-settle loop is inherently client state |
| Curated currency list | Not every ISO 4217 code | Keeps the picker usable and the minor-unit table verified |
| `INTEGER` money columns | ~$20M ceiling per amount | Ample for quoting, and keeps JSON free of BigInt serialisation |
| No end-to-end browser tests | Interface regressions escape automation | Effort concentrated where defect cost is highest |

---

## What I would improve before production

1. **Optimistic concurrency for metadata.** Two tabs editing one draft's title is last-write-wins. A
   version column with conditional updates would surface the conflict rather than silently
   discarding an edit. Line items and totals are already safe: every mutation takes
   `SELECT … FOR UPDATE` on the document and recomputes from the locked row set, verified against
   eight concurrent writes.
2. **Audit trail.** Who finalized a document and when is recorded; what changed before that is not.
3. **Rate limiting** on the authentication endpoints — there is no throttle against credential
   stuffing today.
4. **Email verification and password reset.** Neither exists, and both are table stakes for real
   accounts.
5. **Structured logging and error tracking.** Console output is not an operations story.
6. **Server-rendered PDF.** Printing relies on the browser dialogue; customers expect a file.
7. **Cursor pagination.** Offset pagination degrades and can skip rows under concurrent insertion.
8. **End-to-end browser tests** for the finalize flow and the editing loop.
9. **Drag-to-reorder.** Reordering is currently up/down buttons, which is accessible but slower than
   dragging for a long document.
10. **A maintained currency source.** The minor-unit table is hand-curated and will drift from ISO
    4217 over time.
11. **Soft deletion for drafts.** Deleting a draft is permanent. Finalized documents can be archived and restored; drafts cannot.
12. **An audit trail for archiving.** Who archived a document and why is not recorded — part of the wider absence of change history.
13. **Close signup enumeration.** Needs a transactional email provider so signup can respond
    generically and explain out of band. See the security section.
