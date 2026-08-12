import { describe, expect, it } from 'vitest';
import { assertTotalsConsistent, computeDocument } from '../src/document.js';
import { formatMoney, toMinor } from '../src/money.js';
import type { LineInput } from '../src/types.js';

const USD = 'USD' as const;

const widgetA: LineInput = {
  quantity: 2,
  unitPriceMinor: toMinor(100, USD),
  discountType: 'PERCENT',
  discountPercentBp: 1000,
  taxPercentBp: 500,
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
      lineSubtotalMinor: 20000,
      discountAmountMinor: 2000,
      afterDiscountMinor: 18000,
      taxAmountMinor: 900,
      lineTotalMinor: 18900,
    });
  });

  it('computes Widget B: no discount, 5% tax on 50.00', () => {
    expect(lines[1]).toEqual({
      lineSubtotalMinor: 5000,
      discountAmountMinor: 0,
      afterDiscountMinor: 5000,
      taxAmountMinor: 250,
      lineTotalMinor: 5250,
    });
  });

  it('computes Service fee: $20 fixed off 200.00, no tax', () => {
    expect(lines[2]).toEqual({
      lineSubtotalMinor: 20000,
      discountAmountMinor: 2000,
      afterDiscountMinor: 18000,
      taxAmountMinor: 0,
      lineTotalMinor: 18000,
    });
  });

  it('produces the document totals from the specification', () => {
    expect(totals).toEqual({
      subtotalMinor: 45000,
      totalDiscountMinor: 4000,
      totalTaxMinor: 1150,
      grandTotalMinor: 42150,
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
    expect(lines[0]!.taxAmountMinor).toBe(900);
    expect(lines[0]!.taxAmountMinor).not.toBe(1000);
  });

  it('applies the discount before the tax', () => {
    expect(lines[0]!.afterDiscountMinor).toBe(18000);
  });
});
