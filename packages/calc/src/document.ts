import { computeLine } from './line.js';
import { MAX_AMOUNT_MINOR } from './money.js';
import type { DocumentTotals, LineInput, LineResult } from './types.js';

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

export function computeDocument(lines: readonly LineInput[]): ComputedDocument {
  const computed = lines.map((line) => computeLine(line));
  return { lines: computed, totals: sumLineResults(computed) };
}

export function exceedsStorageBounds(totals: DocumentTotals): boolean {
  return (
    totals.subtotalMinor > MAX_AMOUNT_MINOR ||
    totals.totalDiscountMinor > MAX_AMOUNT_MINOR ||
    totals.totalTaxMinor > MAX_AMOUNT_MINOR ||
    totals.grandTotalMinor > MAX_AMOUNT_MINOR
  );
}

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
