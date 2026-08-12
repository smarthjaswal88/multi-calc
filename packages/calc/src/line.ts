import { applyPercentBp } from './rounding.js';
import type { LineInput, LineResult } from './types.js';

export function computeLine(input: LineInput): LineResult {
  const lineSubtotalMinor = input.quantity * input.unitPriceMinor;

  let discountAmountMinor = 0;
  if (input.discountType === 'PERCENT') {
    discountAmountMinor = applyPercentBp(lineSubtotalMinor, input.discountPercentBp ?? 0);
  } else if (input.discountType === 'FIXED') {
    discountAmountMinor = input.discountFixedMinor ?? 0;
  }

  discountAmountMinor = Math.min(discountAmountMinor, lineSubtotalMinor);

  const afterDiscountMinor = lineSubtotalMinor - discountAmountMinor;
  const taxAmountMinor = applyPercentBp(afterDiscountMinor, input.taxPercentBp ?? 0);
  const lineTotalMinor = afterDiscountMinor + taxAmountMinor;

  return {
    lineSubtotalMinor,
    discountAmountMinor,
    afterDiscountMinor,
    taxAmountMinor,
    lineTotalMinor,
  };
}
