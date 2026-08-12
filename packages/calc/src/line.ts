import { applyPercentBp } from './rounding.js';
import type { LineInput, LineResult } from './types.js';

/**
 * Compute one line.
 *
 *   1. lineSubtotal   = quantity × unitPrice                    exact, both integers
 *   2. discountAmount = percent of the subtotal, or a fixed amount
 *   3. afterDiscount  = lineSubtotal − discountAmount
 *   4. taxAmount      = percent of afterDiscount                never of the subtotal
 *   5. lineTotal      = afterDiscount + taxAmount
 *
 * Rounding happens at steps 2 and 4 only. Step 1 needs none: multiplying two integers is
 * exact. Steps 3 and 5 need none: adding integers is exact.
 *
 * No currency argument is required. Because amounts are already integer minor units,
 * rounding to the currency's minor unit is rounding to an integer — so the arithmetic is the
 * same in yen, dollars, and dinars. The exponent matters only at the parse and format
 * boundaries, which live in `money.ts`.
 *
 * Inputs are assumed already validated by `schemas.ts`. In particular a fixed discount is
 * assumed not to exceed the line subtotal; this function clamps at zero as a defensive floor
 * so it can never return a negative line, but a rejection should have happened earlier.
 */
export function computeLine(input: LineInput): LineResult {
  const lineSubtotalMinor = input.quantity * input.unitPriceMinor;

  let discountAmountMinor = 0;
  if (input.discountType === 'PERCENT') {
    discountAmountMinor = applyPercentBp(lineSubtotalMinor, input.discountPercentBp ?? 0);
  } else if (input.discountType === 'FIXED') {
    discountAmountMinor = input.discountFixedMinor ?? 0;
  }

  // Defensive floor. Validation rejects an over-large fixed discount before this point.
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
