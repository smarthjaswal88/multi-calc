import { computeLine } from './line.js';
import { MAX_AMOUNT_MINOR } from './money.js';
import type { DocumentTotals, LineInput, LineResult } from './types.js';

/**
 * Sum already-computed line results into document totals.
 *
 * Totals are sums of the *rounded* per-line figures, never a recomputation from unrounded
 * intermediates. Two properties follow, both deliberate:
 *
 *   - The grand total always equals the visible sum of the line totals. There is no cent that
 *     appears only at the bottom of the page.
 *   - subtotal − totalDiscount + totalTax === grandTotal, because each component sums the
 *     same rounded values. Asserted by `assertTotalsConsistent`.
 */
export function sumLineResults(lines: readonly LineResult[]): DocumentTotals {
  const totals: DocumentTotals = {
    subtotalMinor: 0,
    totalDiscountMinor: 0,
    totalTaxMinor: 0,
    grandTotalMinor: 0,
  };

  for (const line of lines) {
    totals.subtotalMinor += line.lineSubtotalMinor;
    totals.totalDiscountMinor += line.discountAmountMinor;
    totals.totalTaxMinor += line.taxAmountMinor;
    totals.grandTotalMinor += line.lineTotalMinor;
  }

  return totals;
}

export interface ComputedDocument {
  lines: LineResult[];
  totals: DocumentTotals;
}

/** Compute every line, then the document totals. The one entry point callers should need. */
export function computeDocument(lines: readonly LineInput[]): ComputedDocument {
  const computed = lines.map((line) => computeLine(line));
  return { lines: computed, totals: sumLineResults(computed) };
}

/**
 * Whether any document total exceeds what an INTEGER column can store.
 *
 * Per-line bounds are enforced by the line schema, but a document is a *sum* of lines: fifty
 * lines that are each individually storable can total more than the ceiling. The API checks
 * this before writing and returns a specific 400, rather than letting the database driver
 * fail the insert and produce a 500.
 *
 * Returns a predicate rather than throwing so the caller decides the response shape.
 */
export function exceedsStorageBounds(totals: DocumentTotals): boolean {
  return (
    totals.subtotalMinor > MAX_AMOUNT_MINOR ||
    totals.totalDiscountMinor > MAX_AMOUNT_MINOR ||
    totals.totalTaxMinor > MAX_AMOUNT_MINOR ||
    totals.grandTotalMinor > MAX_AMOUNT_MINOR
  );
}

/**
 * The invariant that ties the four document totals together.
 *
 * Exported so the API can assert it before persisting, turning a silent arithmetic fault into
 * a loud failure at the point it occurs rather than a wrong number on an invoice.
 */
export function assertTotalsConsistent(totals: DocumentTotals): void {
  const derived = totals.subtotalMinor - totals.totalDiscountMinor + totals.totalTaxMinor;
  if (derived !== totals.grandTotalMinor) {
    throw new Error(
      `Document totals are inconsistent: subtotal ${totals.subtotalMinor} − discount ` +
        `${totals.totalDiscountMinor} + tax ${totals.totalTaxMinor} = ${derived}, ` +
        `but grand total is ${totals.grandTotalMinor}.`,
    );
  }
}
