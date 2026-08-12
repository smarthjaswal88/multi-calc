import type { CurrencyCode } from './currency.js';

export type DiscountType = 'NONE' | 'PERCENT' | 'FIXED';

export type DocumentStatus = 'DRAFT' | 'FINALIZED';

export interface LineInput {
  quantity: number;
  unitPriceMinor: number;
  discountType: DiscountType;
  discountPercentBp?: number | null;
  discountFixedMinor?: number | null;
  taxPercentBp?: number | null;
}

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
