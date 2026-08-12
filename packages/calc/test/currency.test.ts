import { describe, expect, it } from 'vitest';
import { CURRENCIES, CURRENCY_CODES, getCurrency, minorUnitsPerMajor } from '../src/currency.js';
import { computeDocument } from '../src/document.js';
import { formatMoney, parseMoney } from '../src/money.js';

describe('the currency table', () => {
  it('exposes an exponent for every listed currency', () => {
    for (const code of CURRENCY_CODES) {
      expect([0, 2, 3]).toContain(getCurrency(code).exponent);
    }
  });

  it('reports the right number of minor units per major unit', () => {
    expect(minorUnitsPerMajor('JPY')).toBe(1);
    expect(minorUnitsPerMajor('USD')).toBe(100);
    expect(minorUnitsPerMajor('KWD')).toBe(1000);
  });

  it('records the known zero- and three-decimal currencies correctly', () => {
    expect(CURRENCIES.JPY.exponent).toBe(0);
    expect(CURRENCIES.KRW.exponent).toBe(0);
    expect(CURRENCIES.KWD.exponent).toBe(3);
    expect(CURRENCIES.BHD.exponent).toBe(3);
    expect(CURRENCIES.USD.exponent).toBe(2);
    expect(CURRENCIES.INR.exponent).toBe(2);
  });

  it('rejects an unsupported code', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => getCurrency('XYZ')).toThrow(/Unsupported currency/);
  });
});

describe('the same line across currencies', () => {
  function computeIn(code: 'USD' | 'KWD') {
    return computeDocument([
      {
        quantity: 3,
        unitPriceMinor: parseMoney('9.99', code),
        discountType: 'PERCENT',
        discountPercentBp: 750,
        taxPercentBp: 825,
      },
    ]);
  }

  it('rounds to cents in USD', () => {
    const { lines } = computeIn('USD');
    expect(lines[0]).toEqual({
      lineSubtotalMinor: 2997,
      discountAmountMinor: 225,
      afterDiscountMinor: 2772,
      taxAmountMinor: 229,
      lineTotalMinor: 3001,
    });
    expect(formatMoney(3001, 'USD')).toBe('$30.01');
  });

  it('rounds to fils in KWD, keeping a third decimal place', () => {
    const { lines } = computeIn('KWD');
    expect(lines[0]).toEqual({
      lineSubtotalMinor: 29970,
      discountAmountMinor: 2248,
      afterDiscountMinor: 27722,
      taxAmountMinor: 2287,
      lineTotalMinor: 30009,
    });
    expect(formatMoney(30009, 'KWD')).toMatch(/30\.009/);
  });

  it('rounds to whole yen in JPY', () => {
    const { lines, totals } = computeDocument([
      {
        quantity: 3,
        unitPriceMinor: parseMoney('1200', 'JPY'),
        discountType: 'PERCENT',
        discountPercentBp: 1000,
        taxPercentBp: 1000,
      },
    ]);
    expect(lines[0]).toEqual({
      lineSubtotalMinor: 3600,
      discountAmountMinor: 360,
      afterDiscountMinor: 3240,
      taxAmountMinor: 324,
      lineTotalMinor: 3564,
    });
    expect(formatMoney(totals.grandTotalMinor, 'JPY')).not.toContain('.');
  });

  it('rounds a fractional yen amount to a whole yen', () => {
    const { lines } = computeDocument([
      {
        quantity: 1,
        unitPriceMinor: 1000,
        discountType: 'NONE',
        taxPercentBp: 333,
      },
    ]);
    expect(lines[0]!.taxAmountMinor).toBe(33);
  });
});
