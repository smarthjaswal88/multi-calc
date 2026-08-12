# Archive — design record

**Status:** **implemented and verified.** 209 unit tests, 24 constraint probes, 110 end-to-end checks — all passing.
**Date:** 10 August 2026
**Companion documents:** [build-plan.md](./build-plan.md), [frontend-design-brief.md](./frontend-design-brief.md), [../README.md](../README.md)

---

## 1. Why this exists

A user tried to delete a finalized document and could not. The API refuses it with 409, which was
a deliberate decision — but the interface simply *omitted* the delete control, with no explanation
anywhere on the screen. The locked banner mentioned printing and duplicating and said nothing
about deletion.

So the original complaint was really two problems wearing one coat:

1. **A missing capability.** There was no way to get a finished quote out of the working list.
2. **A silent constraint.** The rule existed but was invisible, which is why the first reaction was
   "why hasn't this been built" rather than "why isn't this allowed".

Archive addresses the first. Stating the rule addresses the second, and is worth doing regardless
of which way the first goes.

**This was not in the assignment.** The specification names three stretch goals — duplicate,
finalize validation, printable view — and all three are already delivered. Archive is a fourth,
self-invented feature. The grading rubric's seven rows do not reward it. That is recorded here so
the decision to build it is a choice rather than a drift.

---

## 2. How the design arrived here

Worth keeping, because two of the turns changed the shape of the feature.

**First proposal — block deletion, explain it.** Keep the rule, add a sentence to the locked
banner. Cheapest option, strengthens the immutability story the rubric grades, but gives the user
nothing they actually asked for.

**Second proposal — a Trash model.** Deleted finalized documents kept forever, deleted drafts
purged after 30 days, everything restorable. Good instinct, but it carried three costs: an
auto-purge needs a scheduler this stack does not have, a countdown needs UI, and — worst — removing
a finalized document from the report silently rewrites historical totals, which is the same
objection that ruled out hard deletion in the first place.

**Renaming it Archive changed the design, not just the label.** An archive is permanent by
definition; you do not silently destroy what you filed. That removed the scheduler, the purge, and
the countdown in one move. It also opened the possibility of archived documents *continuing* to
count in the report — filing something is not un-issuing it — which would have left history stable
and immutability fully intact.

**Final call: archived documents are excluded from the report.** The tradeoff was put plainly and
the exclusion was chosen deliberately (§4).

---

## 3. The model

| | Delete (permanent) | Archive | Restore |
|---|---|---|---|
| **Draft** | yes — lines cascade | — | — |
| **Finalized** | **never** | yes | yes, returns **finalized** |

- Archived documents drop out of the default document list.
- Archived documents drop out of the summary report.
- Archive has no expiry. It lasts until restored.
- A new sidebar destination, **Archive**, lists archived documents with a Restore action.

### The constraint that must not bend

**Restore preserves status.** An archived finalized document comes back finalized.

If restore returned a document as a draft, then archive → restore would be a route to *un-finalize*
a closed record: edit an immutable document by round-tripping it through the archive. That defeats
the single rule the whole lifecycle exists to protect.

It is guaranteed by **the service guard and the end-to-end test**. The database asserts only the
weaker row-level predicate — *archived implies finalized* — and cannot assert the transition rule
itself: a row-level CHECK sees only the new row, never the old one, so no CHECK can express
"status must not move away from FINALIZED". An earlier draft of this document claimed a database
assertion here; that claim was wrong and review caught it (§6.1).

Worth being precise about what the existing schema does still catch. The *careless* form of the bug
— setting `status = 'DRAFT'` while leaving `finalizedAt` populated, the slip you get by copying
duplicate's status literal — is rejected today by `documents_finalized_at_matches_status`, and
`verify-constraints.ts` already probes exactly that row. What the database cannot see is the
*fully consistent* un-finalize: `archivedAt` null, `status` DRAFT, `finalizedAt` null. That is not a
slip, it is a deliberate decision by some future developer that "restore should return it to draft
so the user can edit it" — which is precisely the threat named above. A `BEFORE UPDATE` trigger
would close it at the storage layer; see §6.1 for whether that is worth doing.

---

## 4. The accepted tradeoff, stated plainly

**Excluding archived documents from the report means archiving mutates historical totals.** A date
range totalled today will total differently tomorrow if a document inside it is archived, with
nothing in the figures to indicate why.

This was raised before the decision and chosen anyway. It is the product owner's call, and it is
recorded here rather than buried:

- **What we lose:** a report is no longer reproducible over time. Two people running the same range
  a week apart can legitimately disagree.
- **Why it is defensible:** in this product a document is a quote, not a posted ledger entry. Nothing
  downstream depends on the total, and a user who archives a quote is saying it should stop counting.
- **How the loss is contained:** the report states in words which documents it counted, using the
  same pattern as the existing drafts toggle, so a changed number is never unexplained.

An "include archived" toggle would remove the downside entirely, at the cost of one control. It is
noted as the obvious first extension if this ever matters.

---

## 5. Implementation plan

### Data

- `Document.archivedAt DateTime?`
- Index on `(userId, archivedAt)` — every list and report query filters on it
- CHECK constraint, written as an **implication** rather than the two-branch shape used by
  `documents_finalized_at_matches_status`:

  ```sql
  ALTER TABLE "documents"
    ADD CONSTRAINT "documents_archived_only_when_finalized"
    CHECK ("archivedAt" IS NULL OR "status" = 'FINALIZED');
  ```

  This is the whole of what the database can assert about archiving. It does **not** enforce
  restore-preserves-status — see §3 and §6.1.

Rejected alternative: extending the status enum to `DRAFT | FINALIZED | ARCHIVED`. Archive is
orthogonal to lifecycle state, not a third position in it — an archived document is still finalized,
and collapsing the two would break the `finalizedAt`-matches-status constraint and every
`status === 'FINALIZED'` check in the codebase.

### API

| Method | Path | Notes |
|---|---|---|
| POST | `/documents/:id/archive` | Requires `FINALIZED`. Idempotent. |
| POST | `/documents/:id/unarchive` | Restores; status untouched. Idempotent. |
| GET | `/documents?archived=true` | The archive view |

Note the guard interaction: `requireDraft` rejects every mutation on a finalized document, but
archive must be permitted on *precisely* a finalized document. So archive cannot sit behind that
guard — it needs its own, and the reason must be commented, or a later reader will "fix" the
omission and break the feature.

### Query filtering

Explicit `archivedAt: null` at each read site — the document list, the report's `groupBy`, and the
report's document list — rather than a global Prisma extension.

The reason is specific: `loadDocument` must still be able to *read* an archived document, because
that is how restore finds it. A global filter would hide the row from the very endpoint that needs
it, and the escape hatch would be more confusing than the explicit filter. Tests assert that
archived documents appear in neither the list nor the report.

### Frontend

- Sidebar entry with an archived count
- Archive screen: the document table, read-only, with Restore per row and an empty state
- On a finalized document, **Archive** occupies the place where the absent delete control was
- The locked banner gains a sentence about what can and cannot be removed
- Report states its inclusion mode in words

### Tests

Extending `scripts/verify-api.ts`:

- Archiving a draft is refused
- Deleting a finalized document is still refused
- An archived document leaves the list and the report
- Restore returns it **still finalized** — the laundering path stays closed
- Archive and unarchive are both idempotent
- Another user cannot archive or restore someone else's document (404, not 403)

---

## 6. Independent review

Four lenses were run over this plan before any code: financial-systems practice, data modelling,
API and security, and UX convention plus scope discipline. Each objection was then handed to a
separate reviewer whose only job was to refute it, so what appears below survived contradiction.

The financial lens was pointed deliberately at §4 — the decision to drop archived documents from
the report — and the UX lens was asked to say plainly if building this at all is the wrong use of
remaining effort.

**Result: 12 objections verified, 1 survived. Verdict — proceed, with one correction.**

No finding invalidated the feature. The single survivor is an over-claim in this document's own
prose, not a flaw in the design.

### 6.1 The finding that held

**A row-level CHECK cannot assert a transition rule.** §3 originally claimed
restore-preserves-FINALIZED was "enforced in the service, asserted in the database, and tested".
The middle third is not deliverable: a CHECK sees only the new row, so it cannot compare against
the previous one, and the proposed constraint short-circuits on `archivedAt IS NULL` — exactly the
state an unarchive leaves behind.

This matters more here than it would elsewhere, because the repository *advertises* database-level
guarantees: the first migration's header claims the domain rules are "impossible to violate through
any path into the database", and the README points at 22 raw-SQL constraint probes. A reader who
goes looking for the probe behind "asserted in the database" would find none.

**Fixed:** §3 and §5 now state the guarantee accurately and express the constraint as an implication.

**Optional hardening, not taken:** a `BEFORE UPDATE` trigger raising on
`OLD.status = 'FINALIZED' AND NEW.status <> 'FINALIZED'` would make "FINALIZED is terminal" true at
the storage layer — which is literally the lifecycle rubric row. Nothing in the codebase
un-finalizes today (duplicate inserts a new row; the totals service touches only computed columns),
so it would break nothing. Three details if it is ever added:

- The exception message must read `violates check constraint "documents_finalized_is_terminal"`,
  because `verify-constraints.ts` matches that pattern. A differently worded message still passes
  the probe but prints a bare "rejected" and stops naming what refused the write, which is the
  whole point of that suite.
- Plain `BEFORE UPDATE`, not `BEFORE UPDATE OF "status"` — the `OF` form fires when the column
  appears in the SET list rather than when its value actually changes.
- The probe must be a single statement; Prisma's `$executeRawUnsafe` rejects several separated by
  semicolons.

### 6.2 Both predictions were wrong

Recorded because the point of writing them down first was to test the review, and the review won.

| Prediction | Outcome |
|---|---|
| §4 report exclusion contradicts accounting practice | **Refuted.** The comparison does not hold: QuickBooks permits edits to posted transactions, neither product's storage layer is observable, and — decisively — a quote is not a posted ledger entry. §4's own reasoning was stronger than the objection against it. |
| The delete/archive asymmetry will be flagged as confusing | **Refuted.** §3 matches the behaviour of every named comparison product. |

Two further objections in the same territory were also refuted: that archive is "a state with no
exit" because no product ships an un-emptiable removal destination, and that excluding archived
documents from the report endangers a graded rubric row.

### 6.3 What the review did not clear

Honesty about the instrument: each lens produced seven or eight objections, and only the **top three
per lens** were sent for verification — 12 of roughly 30. The remainder were neither confirmed nor
refuted. They are unexamined, not cleared. The ones that read as substantive:

- **Duplicate bypasses every state guard**, so an archived document can be duplicated into a live
  draft. Decide that deliberately rather than discovering it.
- **`archivedAt` is absent from the response contract**, so a client fetching a document by id
  cannot tell that it is looking at an archived record.
- **The 83-check suite would not catch archive's two most likely regressions** — the report filter
  missing from one of the two report queries, and restore losing FINALIZED.
- **Archiving moves `updatedAt`** on a record the schema and README both describe as frozen.
- **The CHECK constraint will reach users as a 500**, because the error middleware has no Prisma
  branch — which contradicts the reasoning the existing migrations were written on.
- **No undo at the point of action**, and the detail page's behaviour immediately after archiving
  is unspecified.

The first three should be resolved during implementation. The rest are worth a second pass.

---

## 7. Explicitly out of scope

- **Auto-purge / expiry.** Removed when the feature became Archive rather than Trash.
- **Void with a reversing entry.** The accounting-correct answer to §4, and a much larger feature.
- **Audit trail.** Who archived a document, when, and why is not recorded. The wider gap — no
  history of any change — is already listed in the README's pre-production improvements.
- **Reason or memo field** on archiving.
- **Bulk archive.**
- **Archiving drafts.** A draft you do not want is deleted. Simplicity was chosen over symmetry;
  §6 may argue otherwise.

---

## 8. What was built

| | |
|---|---|
| Migration | `20260812145547_archive_documents` — `archivedAt`, `(userId, archivedAt)` index, two CHECKs |
| Guards | `requireFinalized`, `requireNotArchived`, `requireArchived` |
| Endpoints | `POST /documents/:id/archive`, `POST /documents/:id/unarchive`, `GET /documents?archived=true` |
| Response | `archivedAt` and `archived` on every document; `excludesArchived` on the report |
| Web | Archive screen, sidebar entry, Archive/Restore on the document, archived banner, report caveat |

Three decisions from §6.3 resolved during implementation, as review advised:

**Duplicating an archived document is allowed**, and now tested rather than accidental. Reviving an
old quote into a fresh draft is the natural next-year move, and the copy is a new document, so the
archived record is untouched.

**`archivedAt` and `archived` are in the response contract**, so a client following a bookmarked
link can tell it is looking at an archived record and explain itself.

**Both report regressions are covered.** The aggregate and the document list now share a single
`where` binding, which makes the divergence review warned about — filter on one query but not the
other — unrepresentable rather than merely tested. The suite asserts reconciliation after archiving
anyway, per currency.

Two implementation notes worth keeping:

**Archive and unarchive are raw SQL, not `prisma.document.update`.** Prisma's `@updatedAt` would
move the timestamp on a record the schema calls frozen. The unarchive statement also mentions only
`archivedAt` — `status` and `finalizedAt` are not in it at all, which is the strongest form the
un-finalize guarantee can take in a single statement.

**`archived=true` has no "both" mode.** A list mixing archived and active documents would need a
column to tell them apart, and separation is the entire point of archiving.

## 9. Sequencing

The one **hard** deliverable still outstanding is a deployed live URL, and it needs account access
only the product owner has. Archive is polish on an application a reviewer cannot yet open.

Building Archive does not delay deployment, since deployment is blocked on credentials either way.
But if effort has to be chosen between them, the live URL wins — it is required, and this is not.
