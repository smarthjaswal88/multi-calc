/**
 * The specification's reference document.
 *
 * These figures come straight from the assignment and are the canonical regression test for
 * the whole engine. If this file fails, nothing else about the application matters.
 *
 *   Line         Qty  Unit price  Discount       Tax
 *   Widget A       2      100.00  10%            5%
 *   Widget B       1       50.00  —              5%
 *   Service fee    1      200.00  $20.00 fixed   —
 */

import { describe, expect, it } from 'vitest';
import { assertTotalsConsistent, computeDocument } from '../src/document.js';
import { formatMoney, toMinor } from '../src/money.js';
import type { LineInput } from '../src/types.js';

const USD = 'USD' as const;

const widgetA: LineInput = {
  quantity: 2,
  unitPriceMinor: toMinor(100, USD),
  discountType: 'PERCENT',
  discountPercentBp: 1000, // 10.00%
  taxPercentBp: 500, // 5.00%
};

const widgetB: LineInput = {
  quantity: 1,
  unitPriceMinor: toMinor(50, USD),
  discountType: 'NONE',
  taxPercentBp: 500,
};

const serviceFee: LineInput = {
  quantity: 1,
  unitPriceMinor: toMinor(200, USD),
  discountType: 'FIXED',
  discountFixedMinor: toMinor(20, USD),
  taxPercentBp: null,
};

const SAMPLE = [widgetA, widgetB, serviceFee];

describe('the specification reference document', () => {
  const { lines, totals } = computeDocument(SAMPLE);

  it('computes Widget A: 10% off 200.00, then 5% tax on 180.00', () => {
    expect(lines[0]).toEqual({
      lineSubtotalMinor: 20000, // 200.00
      discountAmountMinor: 2000, //  20.00
      afterDiscountMinor: 18000, // 180.00
      taxAmountMinor: 900, //   9.00
      lineTotalMinor: 18900, // 189.00
    });
  });

  it('computes Widget B: no discount, 5% tax on 50.00', () => {
    expect(lines[1]).toEqual({
      lineSubtotalMinor: 5000, //  50.00
      discountAmountMinor: 0, //   0.00
      afterDiscountMinor: 5000, //  50.00
      taxAmountMinor: 250, //   2.50
      lineTotalMinor: 5250, //  52.50
    });
  });

  it('computes Service fee: $20 fixed off 200.00, no tax', () => {
    expect(lines[2]).toEqual({
      lineSubtotalMinor: 20000, // 200.00
      discountAmountMinor: 2000, //  20.00
      afterDiscountMinor: 18000, // 180.00
      taxAmountMinor: 0, //   0.00
      lineTotalMinor: 18000, // 180.00
    });
  });

  it('produces the document totals from the specification', () => {
    expect(totals).toEqual({
      subtotalMinor: 45000, // 450.00
      totalDiscountMinor: 4000, //  40.00
      totalTaxMinor: 1150, //  11.50
      grandTotalMinor: 42150, // 421.50
    });
  });

  it('reaches a grand total of $421.50', () => {
    expect(formatMoney(totals.grandTotalMinor, USD)).toBe('$421.50');
  });

  it('satisfies subtotal − discount + tax = grand total', () => {
    expect(() => assertTotalsConsistent(totals)).not.toThrow();
    expect(totals.subtotalMinor - totals.totalDiscountMinor + totals.totalTaxMinor).toBe(
      totals.grandTotalMinor,
    );
  });

  it('formats every figure as the specification prints it', () => {
    expect(lines.map((l) => formatMoney(l.lineTotalMinor, USD))).toEqual([
      '$189.00',
      '$52.50',
      '$180.00',
    ]);
    expect(formatMoney(totals.subtotalMinor, USD)).toBe('$450.00');
    expect(formatMoney(totals.totalDiscountMinor, USD)).toBe('$40.00');
    expect(formatMoney(totals.totalTaxMinor, USD)).toBe('$11.50');
  });

  it('applies tax to the discounted amount, not the subtotal', () => {
    // The distinguishing rule: Widget A's tax is 5% of 180.00 (9.00), never 5% of 200 (10.00).
    expect(lines[0]!.taxAmountMinor).toBe(900);
    expect(lines[0]!.taxAmountMinor).not.toBe(1000);
  });

  it('applies the discount before the tax', () => {
    // If tax came first, Widget A would total 189.00 by a different route — so assert the
    // intermediate, which only the correct ordering produces.
    expect(lines[0]!.afterDiscountMinor).toBe(18000);
  });
});
