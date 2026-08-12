# Build Plan — Multi-Rate Pricing Calculator

Working document. Companion to [`frontend-design-brief.md`](./frontend-design-brief.md), which
covers the visual system and screen states. This one covers architecture, module inventory, and
build order.

**★ marks modules that map directly to a row in the assignment's evaluation table.**

---

## 1. Starting state

| | |
|---|---|
| Repo | npm workspaces monorepo, `apps/web` + `apps/api` |
| Web | Next.js 16, React 19, Tailwind v4 — default scaffold, nothing built |
| API | Express 4, one `/health` route |
| DB | Prisma 6 + Postgres configured; **schema has no models, no migrations** |
| Installed and unused | `bcryptjs`, `jsonwebtoken`, `zod`, `cors`, `@prisma/client` |
| Blocker | No Postgres reachable on `localhost:5432`; Docker daemon down |

Design direction is settled: **Modernist** (Swiss-school grid, Archivo, square corners, strong
rules) with the three amendments in the design brief — ledger-green accent instead of red, mono
for all figures, dark theme specified as its own system.

---

## 2. Architectural decisions

Recorded here because they're expensive to reverse.

### 2.1 Money is integer minor units, everywhere ★

Prisma `Int` columns. All arithmetic in minor units. Formatting happens only at the display edge.
The wire format carries minor units (`42150`); the UI renders `421.50`. No floats, no `Decimal`
round-tripped through a JS number.

This is the single largest correctness lever in the assignment.

**Not always cents.** Because the user picks a currency (§2.8), the minor-unit exponent travels
with the document rather than being hardcoded to 2:

| Currency | Exponent |
|---|---|
| JPY, KRW, VND | 0 — `100` is one hundred yen |
| USD, INR, EUR, GBP, AUD, CAD, SGD, AED | 2 |
| KWD, BHD, OMR, JOD, TND | 3 |

Every function in `packages/calc` takes the exponent as an argument. Nothing assumes 2.

### 2.2 One shared calculation package ★

A new `packages/calc` workspace, not a file inside the API. The rubric grades "single shared
module" explicitly.

- **The API** imports it to compute and persist.
- **The web app** imports it for *types, zod schemas, and formatting only* — never to compute
  totals. The server stays the sole source of truth, per the assignment's hard requirement.

Sharing the zod schemas means the 13 validation messages are authored once and rendered identically
by the API and the forms.

### 2.3 Computed amounts are persisted, not derived on read ★

Every write recomputes line amounts and document totals and stores them, inside a transaction.

Two reasons:
1. **A finalized document must be a frozen record.** If the rounding policy ever changed, documents
   finalized under the old policy must not silently change value.
2. The summary report becomes a cheap aggregate query instead of recomputing every document in the
   range on each request.

### 2.4 Auth: JWT in an httpOnly cookie

Not localStorage. Costs extra config once deployed cross-origin (`SameSite=None; Secure`, exact
CORS origin, `credentials: true`), but "each user must only see their own data" is a graded line
and an XSS-readable token is the first thing a reviewer probes.

### 2.5 Frontend data layer: client-side TanStack Query

Not server components. The editor debounces edits, refetches server-computed totals, and shows a
pending state on every derived number — that is client state, and routing it through server
components would fight the framework for no gain.

### 2.6 Ownership failures return 404, not 403

Requesting another user's document must not confirm that it exists.

### 2.7 Currency is per-document, chosen by the user ★

Not per-user — a quoting tool has to bill an Indian customer in INR and an American one in USD from
the same account. The user's most recent choice becomes the default for the next new document.

Three consequences, each of which would otherwise be a silent bug:

**Minor units vary.** Covered in §2.1. The exponent is a property of the currency and is passed
into every calculation.

**The report cannot sum across currencies.** Adding an INR grand total to a USD one produces a
meaningless figure, and "summary totals match individual documents in range" is a graded line. The
report therefore **groups by currency**: one set of four KPIs per currency present in the range,
with the breakdown table sectioned to match.

**No FX conversion.** We do not convert between currencies anywhere. A stale exchange rate is worse
than no exchange rate, and rate sourcing is well outside this assignment's scope. Stated in the
README.

**Switching currency is restricted.** A draft holding `10000` minor units as USD is $100.00; reading
that same integer as JPY makes it ¥10,000 — a 100× re-denomination from one dropdown change.
So: **currency is editable while the document has no line items, and locked once the first line
exists.** Finalized documents are locked along with everything else.

**Scope:** a curated list of 8–12 currencies, not all of ISO 4217. Display formatting goes through
`Intl.NumberFormat` so locale-specific grouping is correct — INR uses 2-2-3 lakh grouping
(`₹5,90,000`), not the 3-3 grouping (`590,000`) that hand-rolled formatting produces.

### 2.8 Documented policy choices

Decisions the assignment left to us. All must appear in the README.

| Question | Decision |
|---|---|
| Rounding | Round to the document currency's minor unit after discount, and again after tax, per line. Document totals sum the *rounded* line amounts, so totals always reconcile with what's displayed per line. For a 2-decimal currency this is the assignment's "round to 2 decimal places per line." |
| Fixed discount exceeding line subtotal | **Reject** with a specific error. Never silently clamp a number the user typed. |
| Percent bounds | 0–100 inclusive, up to 2 decimal places |
| Quantity | Whole number ≥ 1 |
| Deleting a finalized document | Not permitted — the action is absent from the UI, and the API rejects it |
| Report scope | Includes drafts and finalized by default, with a visible toggle and the current mode stated in words |
| Currency | User-selected per document from a curated list. Editable while the document has no lines, locked once a line exists. |
| Mixed currencies in a report | Grouped by currency — one set of KPIs per currency. Never summed together. |
| FX conversion | Not supported anywhere. No rate source, no cross-currency arithmetic. |

---

## 3. Build order

Backend first — but note that a real slice of frontend work is blocked by nothing and wastes
nothing, so phases 1 and 2 can run together.

| Phase | What | Blocked by |
|---|---|---|
| **1** | `packages/calc` — pure functions, integer minor units, multi-currency, full Vitest suite | nothing |
| **2** | Frontend foundation + presentational components — tokens, shell, tape, inputs | nothing |
| **3** | Prisma models, migration, seed | **needs a database URL** |
| **4** | API — auth, CRUD, finalize, duplicate, report, validation | phase 3 |
| **5** | Frontend data layer — hooks, mutations, error mapping, screens wired | phase 4 |
| **6** | Deploy + README | all |

**Why phase 1 first:** it is unblocked, it carries four of the seven graded criteria, it is fully
testable with no DB and no UI, and writing it forces the API contract onto paper — which is exactly
what phase 2's component props need.

**Why phase 2 is safe to parallelize:** tokens, the app shell, and the presentational components
take props rather than fetches. They can be built and verified against the sample document's
hardcoded numbers and take identical props once real data arrives. Nothing is thrown away.

**What is deliberately *not* parallelized:** the data layer. Mocking a server-computed-totals app
means rebuilding most of the API's shape in fixtures and then deleting it.

---

## 4. Module inventory

### 4.1 `packages/calc` — new shared workspace ★

Pure TypeScript. No I/O, no framework, no dependencies beyond zod.

- [ ] `currency.ts` ★ — the curated currency list with ISO code, symbol, locale, and minor-unit
      exponent. The single source of truth for "how many decimal places does this currency have."
- [ ] `money.ts` ★ — integer minor-unit primitives: `toMinor`, `fromMinor`, `formatMoney`,
      `parseMoney`, `roundHalfUp`, all taking a currency. Nothing else in the codebase performs
      money arithmetic. Display formatting goes through `Intl.NumberFormat` so locale grouping is
      correct (INR renders `₹5,90,000`, not `₹590,000`).
- [ ] `rounding.ts` ★ — the policy in one place, expressed against the currency's minor unit, so the
      README, the UI tooltip, and the code cannot drift apart
- [ ] `types.ts` — `DiscountType`, `CurrencyCode`, `LineInput`, `LineResult`, `DocumentTotals`
- [ ] `line.ts` ★ — `computeLine()`: subtotal → discount → tax → line total. Returns every
      intermediate figure, because the derivation tape displays them.
- [ ] `document.ts` ★ — `computeDocument()`: sums rounded line amounts into the four document totals
- [ ] `schemas.ts` ★ — zod schemas carrying the 13 validation messages verbatim
- [ ] `index.ts` — barrel export

**Tests ★** — the highest-value test surface in the assignment

- [ ] `sample-document.test.ts` — the canonical case: 189.00 / 52.50 / 180.00 per line, and
      450.00 / 40.00 / 11.50 / **421.50** for the document
- [ ] `line.test.ts` — percent discount, fixed discount, no discount, zero tax, tax applied to the
      *discounted* amount, and rounding boundaries that produce a half-cent
- [ ] `money.test.ts` — parse/format round-trips and the cases that break floats (`0.1 + 0.2`,
      `1.005`)
- [ ] `currency.test.ts` ★ — the same line computed in a 0-decimal currency (JPY), a 2-decimal
      currency (USD), and a 3-decimal currency (KWD), proving nothing hardcodes 2
- [ ] `schemas.test.ts` — every rejection produces its exact message

### 4.2 `apps/api`

**Foundation**

- [ ] `config/env.ts` — zod-validated env, failing at boot rather than on first request
- [ ] `db/prisma.ts` — client singleton
- [ ] `errors.ts` ★ — `ValidationError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, each
      carrying an HTTP status and a field path
- [ ] `middleware/error.ts` ★ — central handler emitting one error shape, so the frontend maps
      errors to rows generically
- [ ] `middleware/auth.ts` ★ — JWT verification from the httpOnly cookie, attaches `userId`
- [ ] `middleware/validate.ts` — runs the shared zod schemas against body, params, and query

**Data**

- [ ] `prisma/schema.prisma` — `User`, `Document`, `LineItem`, plus `DocumentStatus` and
      `DiscountType` enums. `Document.currency` holds the ISO 4217 code. Money columns are `Int`
      (minor units, interpreted against that currency). Computed amounts persisted.
- [ ] `prisma/seed.ts` — a demo user and the sample document, so a reviewer can log in and
      immediately see 421.50

**Domain modules** — routes + controller + service each

- [ ] `modules/auth` ★ — `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`,
      `GET /auth/me`
- [ ] `modules/documents` ★ — `GET /documents` (filter, sort, paginate), `POST /documents`,
      `GET /documents/:id`, `PATCH /documents/:id`, `DELETE /documents/:id`,
      `POST /documents/:id/finalize`, `POST /documents/:id/duplicate`
- [ ] `modules/lines` ★ — `POST /documents/:id/lines`, `PATCH /lines/:lineId`,
      `DELETE /lines/:lineId`, `PATCH /documents/:id/lines/reorder`
- [ ] `modules/reports` ★ — `GET /reports/summary?from=&to=&includeDrafts=`, returning results
      **grouped by currency**, never summed across them
- [ ] `guards/assertCurrencyMutable.ts` ★ — rejects a currency change once the document has line
      items, preventing silent re-denomination

**Cross-cutting services** — where the graded rules actually live

- [ ] `services/totals.ts` ★ — the only writer of computed amounts. Calls `packages/calc` and
      persists line and document totals in one transaction. Every mutation routes through it.
- [ ] `guards/assertDraft.ts` ★ — throws `ConflictError` if the document is finalized. Applied to
      every mutating route, so immutability is one enforcement point rather than scattered checks.
- [ ] `guards/assertOwner.ts` ★ — scopes every query by `userId`, throws `NotFoundError` on another
      user's row
- [ ] `services/finalize.ts` ★ — validates finalize preconditions (no quantity ≤ 0, no negative
      prices), flips status, returns the offending lines when it refuses
- [ ] `services/duplicate.ts` — deep-copies a finalized document into a new draft

**Integration tests ★** — small but high-signal

- [ ] A finalized document rejects every mutation
- [ ] User B receives 404 on user A's document
- [ ] The report's sums equal the documents in range

### 4.3 `apps/web`

**Foundation** — unblocked, no API needed

- [ ] `app/globals.css` ★ — the Modernist token layer: both themes in oklch, mapped to shadcn's
      variable names, plus `--amount-discount`, `--amount-tax`, `--amount-total`, `--tape-rule`
- [ ] `app/layout.tsx` — fonts (Archivo + mono), providers, no-flash theme script
- [ ] `providers/theme.tsx` — `next-themes`, light / dark / system
- [ ] `providers/query.tsx` — TanStack Query client
- [ ] `components/ui/*` — roughly 25 shadcn primitives per §5 of the design brief

**Presentational components** — also unblocked; these take props, not fetches

- [ ] `components/money/MoneyInput` — affix slot carrying the **document's** currency symbol,
      right-aligned, tabular, error variant. Step and decimal precision follow the currency's minor
      unit, so a JPY field accepts no decimals at all.
- [ ] `components/money/PercentInput` — trailing `%`, bounded 0–100
- [ ] `components/document/CurrencySelect` ★ — the curated list, disabled with an explanatory
      tooltip once the document has lines
- [ ] `components/money/NumericCell` — sign, hue, alignment, muted-while-recalculating
- [ ] `components/tape/DerivationTape` ★ — the signature element, three densities
- [ ] `components/document/DiscountControl` ★ — the toggle-group and input pair that makes the
      illegal both-discounts state unreachable
- [ ] `components/document/TotalsRail` ★ — sticky, the tape at document scale, rounding-policy
      popover
- [ ] `components/document/StatusBadge` — draft vs finalized
- [ ] `components/document/SaveIndicator` — saved / saving / stale / failed
- [ ] `components/common/EmptyState`, `ErrorState`, `PageHeader`, `ThemeToggle`, `AppSidebar`

**Data layer** — the only genuinely API-blocked part

- [ ] `lib/api/client.ts` — fetch wrapper, `credentials: 'include'`, error normalization
- [ ] `lib/api/documents.ts`, `lines.ts`, `reports.ts`, `auth.ts` — typed endpoint functions
- [ ] `lib/hooks/useDocument`, `useUpdateLine` (debounced), `useFinalize`, `useDuplicate`,
      `useReport`
- [ ] `lib/errors.ts` ★ — maps an API field path back to the offending row and scrolls to it

**Routes**

- [ ] `(auth)/login`, `(auth)/signup`
- [ ] `(app)/documents` — list with filters, sort, row actions, empty states
- [ ] `(app)/documents/[id]` ★ — the editor; branches on status into editable or read-only record
- [ ] `(app)/documents/[id]/print` — print layout
- [ ] `(app)/report` ★ — date range, four KPIs **per currency**, reconciling breakdown table
      sectioned by currency
- [ ] `not-found.tsx`, `error.tsx`

### 4.4 Infrastructure and docs

- [ ] `docker-compose.yml` — local Postgres, if not going hosted
- [ ] Deploy configuration — Vercel (web), Render or Railway (api), Neon (db)
- [ ] `README.md` ★ — setup steps, **rounding policy with the worked example**,
      finalize/immutability rules, assumptions and tradeoffs, what to improve before production.
      Graded explicitly under "Communication."

---

## 5. Where the weight sits

Roughly 60 modules, distributed very unevenly against the rubric:

| Graded criterion | Carried by |
|---|---|
| Correctness | `packages/calc` — `line.ts`, `document.ts`, `money.ts` |
| Calculation design | `packages/calc` as a shared package + `services/totals.ts` as the sole writer |
| Lifecycle | `guards/assertDraft.ts`, `services/finalize.ts` |
| Validation | `packages/calc/schemas.ts` + `middleware/error.ts` |
| Reporting | `modules/reports` |
| Tests | `packages/calc` test suite |
| Communication | `README.md` |

Seven small files in `packages/calc` carry four of the seven criteria. That is where the care
belongs.

---

## 6. Open items

1. **A database.** Nothing on `localhost:5432` and the Docker daemon is down. Recommended: Neon free
   tier — it unblocks phase 3 and doubles as the production database for the required live URL.
2. **What the design tool emits.** React + shadcn code means phase 5 becomes integration rather than
   construction. Figma frames means building from the brief. Phases 1–4 are identical either way.
3. **Deployment targets** — confirm Vercel + Render/Railway before phase 6, since the auth cookie
   configuration depends on the final origins.
