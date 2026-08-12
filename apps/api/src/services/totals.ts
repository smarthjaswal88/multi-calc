/**
 * The only code in the service permitted to write a computed column.
 *
 * Every mutation — creating a line, editing one, deleting one, reordering, changing the
 * currency — routes through here. Nine denormalised columns exist across two tables (five per
 * line, four per document), and a single write path is what keeps them from drifting out of
 * agreement with the engine that produced them.
 *
 * The client never computes a total. This module, calling @multi-calc/calc, is the only source
 * of every figure a user sees.
 *
 * ROUND-TRIP BUDGET
 * -----------------
 * This used to issue one UPDATE per line. Prisma interactive transactions run on a single
 * connection, so a `Promise.all` over those updates serialises rather than parallelising — the
 * cost was one network round trip per line, and adding a line to a four-line document took
 * about a second against a database in another country.
 *
 * Everything here is now written in a single statement, and the post-mutation state is composed
 * from values already in memory rather than read back. A fifty-line document costs the same as a
 * two-line one.
 */

import {
  assertTotalsConsistent,
  computeDocument,
  exceedsStorageBounds,
  VALIDATION_MESSAGES,
  type DocumentTotals,
  type LineInput,
} from '@multi-calc/calc';
import { Prisma, type Document, type LineItem } from '../generated/prisma/client.js';
import type { Tx } from '../db/prisma.js';
import { ValidationError } from '../errors.js';

export interface RecomputeResult {
  lines: LineItem[];
  totals: DocumentTotals;
}

/**
 * Take an exclusive lock on the document, then read its lines inside the same transaction.
 *
 * WHY EVERY MUTATION MUST START HERE
 * ----------------------------------
 * `loadDocument` reads the document and its lines OUTSIDE any transaction, for authorization and
 * the 404. Using that snapshot to compute totals is a race: between the read and the write, a
 * concurrent request can add or delete a line, and the totals then persisted describe a set of
 * lines that no longer exists.
 *
 * That is worse than the metadata last-write-wins the README already admits to. A row-level CHECK
 * cannot sum child rows, so the database will happily store totals that disagree with the lines —
 * and once the document is finalized, the drift is frozen into a record that is supposed to be
 * exactly reconcilable. `subtotal − discount + tax = grandTotal` would still hold, because all four
 * are computed from the same stale snapshot; they would simply all be wrong together, which is the
 * hardest kind of wrong to notice.
 *
 * `FOR UPDATE` serialises mutations per document. Concurrent requests on the *same* document queue;
 * requests on different documents are unaffected, since the lock is one row.
 *
 * It also fixes a 500: two concurrent line inserts previously computed the same `position` from
 * their own snapshots and collided on the unique (documentId, position) index. Computing the next
 * position under this lock makes that unreachable.
 *
 * Returns the authoritative line set. Callers must use THIS, not `req.document.lines`.
 */
export async function lockDocumentAndReadLines(tx: Tx, documentId: string): Promise<LineItem[]> {
  // Locks the row and nothing else; the result is discarded. Written as raw SQL because Prisma has
  // no FOR UPDATE in its query API.
  await tx.$executeRaw`SELECT 1 FROM "documents" WHERE "id" = ${documentId}::text FOR UPDATE`;

  return tx.lineItem.findMany({
    where: { documentId },
    orderBy: { position: 'asc' },
  });
}

function toEngineInput(line: LineItem): LineInput {
  return {
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountType: line.discountType,
    discountPercentBp: line.discountPercentBp,
    discountFixedMinor: line.discountFixedMinor,
    taxPercentBp: line.taxPercentBp,
  };
}

/**
 * Compute and persist every derived figure for one document, in a single statement.
 *
 * `lines` must be the complete post-mutation set with their *input* fields already correct —
 * the caller has them in hand after its own insert, update, or delete, so no read is needed
 * here. They are returned with the computed columns filled in, which is what the route
 * serialises: there is no point asking the database to repeat what we just told it.
 *
 * Must run inside a transaction, so no caller can observe line amounts updated alongside
 * document totals that are not.
 */
export async function recompute(
  tx: Tx,
  documentId: string,
  lines: LineItem[],
): Promise<RecomputeResult> {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const { lines: computed, totals } = computeDocument(ordered.map(toEngineInput));

  // A document is a sum of lines, so totals can exceed the storage ceiling even when every
  // individual line sits inside it. Checked here so the caller gets a specific 400 rather than
  // a driver-level range error surfacing as a 500.
  if (exceedsStorageBounds(totals)) {
    throw new ValidationError(VALIDATION_MESSAGES.documentTotalTooLarge, [
      { path: 'lines', message: VALIDATION_MESSAGES.documentTotalTooLarge },
    ]);
  }

  // Turns an arithmetic fault into a loud failure here rather than a document whose totals
  // silently fail to reconcile. The database asserts the same invariant; this catches it first,
  // with a stack trace.
  assertTotalsConsistent(totals);

  if (ordered.length === 0) {
    await tx.document.update({
      where: { id: documentId },
      data: {
        subtotalMinor: totals.subtotalMinor,
        totalDiscountMinor: totals.totalDiscountMinor,
        totalTaxMinor: totals.totalTaxMinor,
        grandTotalMinor: totals.grandTotalMinor,
      },
    });
    return { lines: [], totals };
  }

  // Explicit casts on every value: Prisma sends these as untyped bind parameters, and Postgres
  // cannot infer a column type for a bare parameter inside VALUES.
  const values = ordered.map(
    (line, index) => Prisma.sql`(
      ${line.id}::text,
      ${computed[index]!.lineSubtotalMinor}::integer,
      ${computed[index]!.discountAmountMinor}::integer,
      ${computed[index]!.afterDiscountMinor}::integer,
      ${computed[index]!.taxAmountMinor}::integer,
      ${computed[index]!.lineTotalMinor}::integer
    )`,
  );

  // One statement, one round trip. The data-modifying CTE runs to completion whether or not the
  // primary query reads its output, which is what lets the line update and the document update
  // share a single trip.
  await tx.$executeRaw`
    WITH v (id, sub, disc, aft, tax, tot) AS (
      VALUES ${Prisma.join(values)}
    ), line_update AS (
      UPDATE "line_items" AS l
      SET "lineSubtotalMinor"   = v.sub,
          "discountAmountMinor" = v.disc,
          "afterDiscountMinor"  = v.aft,
          "taxAmountMinor"      = v.tax,
          "lineTotalMinor"      = v.tot,
          "updatedAt"           = NOW()
      FROM v
      WHERE l."id" = v.id
      RETURNING l."id"
    )
    UPDATE "documents"
    SET "subtotalMinor"      = ${totals.subtotalMinor}::integer,
        "totalDiscountMinor" = ${totals.totalDiscountMinor}::integer,
        "totalTaxMinor"      = ${totals.totalTaxMinor}::integer,
        "grandTotalMinor"    = ${totals.grandTotalMinor}::integer,
        "updatedAt"          = NOW()
    WHERE "id" = ${documentId}::text
  `;

  const merged = ordered.map((line, index) => ({
    ...line,
    lineSubtotalMinor: computed[index]!.lineSubtotalMinor,
    discountAmountMinor: computed[index]!.discountAmountMinor,
    afterDiscountMinor: computed[index]!.afterDiscountMinor,
    taxAmountMinor: computed[index]!.taxAmountMinor,
    lineTotalMinor: computed[index]!.lineTotalMinor,
  }));

  return { lines: merged, totals };
}

/**
 * Positions are parked here during a reorder, out of the way of any real ordering.
 *
 * The obvious trick is to park on negatives, but the schema's `line_items_position_positive`
 * CHECK forbids those — so the parking range is a high offset instead. No document approaches a
 * million lines; the per-document cap is far below it.
 */
const PARK_OFFSET = 1_000_000;

/**
 * Renumber a document's lines to 1..n in the order given, in two statements.
 *
 * The unique (documentId, position) index means positions cannot be reassigned in place: moving
 * line 3 to position 1 collides with whatever holds position 1. So every row is parked above the
 * real range first, then brought down.
 *
 * Two statements rather than the 2N it used to be — the same reason `recompute` collapsed. Both
 * run inside the caller's transaction, so a failure leaves no row parked.
 */
export async function renumber(tx: Tx, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  const park = orderedIds.map(
    (id, index) => Prisma.sql`(${id}::text, ${PARK_OFFSET + index}::integer)`,
  );
  const place = orderedIds.map((id, index) => Prisma.sql`(${id}::text, ${index + 1}::integer)`);

  const apply = (rows: Prisma.Sql[]) => tx.$executeRaw`
    UPDATE "line_items" AS l
    SET "position" = v.pos, "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(rows)}) AS v (id, pos)
    WHERE l."id" = v.id
  `;

  await apply(park);
  await apply(place);
}

/**
 * Apply a new ordering to line rows already in memory.
 *
 * Reordering changes no amount, so the route needs the reordered rows but not a recompute and
 * not a read-back.
 */
export function applyOrder(lines: LineItem[], orderedIds: string[]): LineItem[] {
  const byId = new Map(lines.map((line) => [line.id, line]));
  return orderedIds.flatMap((id, index) => {
    const line = byId.get(id);
    return line ? [{ ...line, position: index + 1 }] : [];
  });
}

/**
 * Compose the response document from the values just written, with no read-back.
 *
 * `updatedAt` is deliberately left as loaded rather than stamped with `new Date()`. The recompute
 * statement sets it with SQL `NOW()`, which is the transaction's clock, not the Node process's —
 * so stamping one here returned a value that disagreed with what the row actually holds, by
 * whatever the clock skew and round-trip happened to be. A slightly stale timestamp is honest; an
 * invented one is not, and this field is a plausible basis for a future "modified since" check.
 */
export function withTotals(document: Document, totals: DocumentTotals): Document {
  return {
    ...document,
    subtotalMinor: totals.subtotalMinor,
    totalDiscountMinor: totals.totalDiscountMinor,
    totalTaxMinor: totals.totalTaxMinor,
    grandTotalMinor: totals.grandTotalMinor,
  };
}
