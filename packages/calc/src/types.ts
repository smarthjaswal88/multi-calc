import type { CurrencyCode } from './currency.js';

export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';

export type DocumentStatus = 'DRAFT' | 'FINALIZED';

/**
 * The inputs a user controls on a line. Everything else about a line is derived.
 *
 * A percent discount and a fixed discount are mutually exclusive: `discountType` selects
 * which field carries meaning, and the other must be null.
 */
export interface LineInput {
  quantity: number;
  unitPriceMinor: number;
  discountType: DiscountType;
  discountPercentBp?: number | null;
  discountFixedMinor?: number | null;
  taxPercentBp?: number | null;
}

/**
 * Every figure the calculation produces for one line.
 *
 * All five are returned rather than only the total, because the interface displays the
 * derivation. Discarding the intermediates would force the client to recompute them, which
 * is exactly what keeping the server authoritative forbids.
 */
export interface LineResult {
  lineSubtotalMinor: number;
  discountAmountMinor: number;
  afterDiscountMinor: number;
  taxAmountMinor: number;
  lineTotalMinor: number;
}

export interface DocumentTotals {
  subtotalMinor: number;
  totalDiscountMinor: number;
  totalTaxMinor: number;
  grandTotalMinor: number;
}

export interface DocumentInput {
  currency: CurrencyCode;
  lines: LineInput[];
}
