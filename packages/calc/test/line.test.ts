import { describe, expect, it } from 'vitest';
import { computeLine } from '../src/line.js';
import { divideRound, applyPercentBp } from '../src/rounding.js';
import type { LineInput } from '../src/types.js';

function line(overrides: Partial<LineInput> = {}): LineInput {
  return {
    quantity: 1,
    unitPriceMinor: 10000,
    discountType: 'NONE',
    ...overrides,
  };
}

describe('computeLine — discount handling', () => {
  it('applies no discount when the type is NONE', () => {
    const result = computeLine(line({ quantity: 3, unitPriceMinor: 1999 }));
    expect(result.lineSubtotalMinor).toBe(5997);
    expect(result.discountAmountMinor).toBe(0);
    expect(result.afterDiscountMinor).toBe(5997);
  });

  it('applies a percent discount to the subtotal', () => {
    const result = computeLine(
      line({ quantity: 2, unitPriceMinor: 10000, discountType: 'PERCENT', discountPercentBp: 2500 }),
    );
    expect(result.discountAmountMinor).toBe(5000); // 25% of 200.00
    expect(result.afterDiscountMinor).toBe(15000);
  });

  it('applies a fixed discount as an absolute amount', () => {
    const result = computeLine(
      line({ unitPriceMinor: 20000, discountType: 'FIXED', discountFixedMinor: 2000 }),
    );
    expect(result.discountAmountMinor).toBe(2000);
    expect(result.afterDiscountMinor).toBe(18000);
  });

  it('handles a 100% discount, leaving nothing to tax', () => {
    const result = computeLine(
      line({ discountType: 'PERCENT', discountPercentBp: 10000, taxPercentBp: 500 }),
    );
    expect(result.discountAmountMinor).toBe(10000);
    expect(result.afterDiscountMinor).toBe(0);
    expect(result.taxAmountMinor).toBe(0);
    expect(result.lineTotalMinor).toBe(0);
  });

  it('never returns a negative line, even if a fixed discount slips through oversized', () => {
    // Validation rejects this input; the defensive floor in computeLine is the backstop.
    const result = computeLine(
      line({ unitPriceMinor: 5000, discountType: 'FIXED', discountFixedMinor: 9999 }),
    );
    expect(result.discountAmountMinor).toBe(5000);
    expect(result.afterDiscountMinor).toBe(0);
    expect(result.lineTotalMinor).toBe(0);
  });

  it('ignores a percent value when the type is FIXED', () => {
    const result = computeLine(
      line({
        unitPriceMinor: 10000,
        discountType: 'FIXED',
        discountFixedMinor: 1000,
        discountPercentBp: 5000,
      }),
    );
    expect(result.discountAmountMinor).toBe(1000);
  });
});

describe('computeLine — tax handling', () => {
  it('charges tax on the discounted amount, never the subtotal', () => {
    const result = computeLine(
      line({
        quantity: 2,
        unitPriceMinor: 10000,
        discountType: 'PERCENT',
        discountPercentBp: 1000,
        taxPercentBp: 500,
      }),
    );
    expect(result.afterDiscountMinor).toBe(18000);
    expect(result.taxAmountMinor).toBe(900); // 5% of 180.00
  });

  it('treats a null tax percent as no tax', () => {
    const result = computeLine(line({ taxPercentBp: null }));
    expect(result.taxAmountMinor).toBe(0);
    expect(result.lineTotalMinor).toBe(result.afterDiscountMinor);
  });

  it('treats a zero tax percent as no tax', () => {
    const result = computeLine(line({ taxPercentBp: 0 }));
    expect(result.taxAmountMinor).toBe(0);
  });

  it('supports a fractional tax rate held in basis points', () => {
    const result = computeLine(line({ unitPriceMinor: 10000, taxPercentBp: 825 })); // 8.25%
    expect(result.taxAmountMinor).toBe(825); // 8.25% of 100.00 = 8.25
    expect(result.lineTotalMinor).toBe(10825);
  });
});

describe('computeLine — quantity and price edges', () => {
  it('handles a zero unit price', () => {
    const result = computeLine(line({ unitPriceMinor: 0, taxPercentBp: 500 }));
    expect(result).toEqual({
      lineSubtotalMinor: 0,
      discountAmountMinor: 0,
      afterDiscountMinor: 0,
      taxAmountMinor: 0,
      lineTotalMinor: 0,
    });
  });

  it('multiplies exactly for a large quantity', () => {
    const result = computeLine(line({ quantity: 9999, unitPriceMinor: 99999 }));
    expect(result.lineSubtotalMinor).toBe(9999 * 99999);
  });
});

describe('rounding', () => {
  it('rounds half away from zero, not down', () => {
    expect(divideRound(5, 2)).toBe(3); // 2.5 → 3
    expect(divideRound(7, 2)).toBe(4); // 3.5 → 4
    expect(divideRound(-5, 2)).toBe(-3); // −2.5 → −3
  });

  it('leaves exact quotients alone', () => {
    expect(divideRound(10, 2)).toBe(5);
    expect(divideRound(0, 7)).toBe(0);
  });

  it('rounds below the halfway point down', () => {
    expect(divideRound(4, 3)).toBe(1); // 1.33
    expect(divideRound(149, 100)).toBe(1); // 1.49
    expect(divideRound(150, 100)).toBe(2); // 1.50
  });

  it('rejects non-integer operands rather than silently drifting', () => {
    expect(() => divideRound(1.5, 2)).toThrow(/integer operands/);
  });

  it('applies a basis-point percentage with one rounding step', () => {
    expect(applyPercentBp(2997, 750)).toBe(225); // 224.775 → 225
    expect(applyPercentBp(2772, 825)).toBe(229); // 228.69  → 229
  });

  it('engages both rounding points on one line', () => {
    // qty 3 · $9.99 · 7.5% discount · 8.25% tax
    const result = computeLine({
      quantity: 3,
      unitPriceMinor: 999,
      discountType: 'PERCENT',
      discountPercentBp: 750,
      taxPercentBp: 825,
    });
    expect(result).toEqual({
      lineSubtotalMinor: 2997, // exact
      discountAmountMinor: 225, // 224.775 rounded
      afterDiscountMinor: 2772,
      taxAmountMinor: 229, // 228.69 rounded
      lineTotalMinor: 3001, // $30.01
    });
  });
});
