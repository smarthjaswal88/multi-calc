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

export async function lockDocumentAndReadLines(tx: Tx, documentId: string): Promise<LineItem[]> {
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

export async function recompute(
  tx: Tx,
  documentId: string,
  lines: LineItem[],
): Promise<RecomputeResult> {
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const { lines: computed, totals } = computeDocument(ordered.map(toEngineInput));

  if (exceedsStorageBounds(totals)) {
    throw new ValidationError(VALIDATION_MESSAGES.documentTotalTooLarge, [
      { path: 'lines', message: VALIDATION_MESSAGES.documentTotalTooLarge },
    ]);
  }

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

const PARK_OFFSET = 1_000_000;

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

export function applyOrder(lines: LineItem[], orderedIds: string[]): LineItem[] {
  const byId = new Map(lines.map((line) => [line.id, line]));
  return orderedIds.flatMap((id, index) => {
    const line = byId.get(id);
    return line ? [{ ...line, position: index + 1 }] : [];
  });
}

export function withTotals(document: Document, totals: DocumentTotals): Document {
  return {
    ...document,
    subtotalMinor: totals.subtotalMinor,
    totalDiscountMinor: totals.totalDiscountMinor,
    totalTaxMinor: totals.totalTaxMinor,
    grandTotalMinor: totals.grandTotalMinor,
  };
}
