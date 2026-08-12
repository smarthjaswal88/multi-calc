import { describe, expect, it } from 'vitest';
import { assertTotalsConsistent, computeDocument, sumLineResults } from '../src/document.js';
import type { LineInput } from '../src/types.js';

describe('computeDocument', () => {
  it('returns zero totals for a document with no lines', () => {
    const { lines, totals } = computeDocument([]);
    expect(lines).toEqual([]);
    expect(totals).toEqual({
      subtotalMinor: 0,
      totalDiscountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 0,
    });
  });

  it('sums the rounded line figures rather than recomputing from raw inputs', () => {
    const line: LineInput = {
      quantity: 1,
      unitPriceMinor: 1000,
      discountType: 'NONE',
      taxPercentBp: 337,
    };
    const { lines, totals } = computeDocument([line, line, line]);

    expect(lines.map((l) => l.taxAmountMinor)).toEqual([34, 34, 34]);
    expect(totals.totalTaxMinor).toBe(102);
    expect(totals.grandTotalMinor).toBe(3102);
  });

  it('keeps the grand total equal to the visible sum of line totals', () => {
    const inputs: LineInput[] = [
      { quantity: 3, unitPriceMinor: 999, discountType: 'PERCENT', discountPercentBp: 750, taxPercentBp: 825 },
      { quantity: 1, unitPriceMinor: 4999, discountType: 'FIXED', discountFixedMinor: 1234, taxPercentBp: 1250 },
      { quantity: 7, unitPriceMinor: 333, discountType: 'NONE', taxPercentBp: 333 },
    ];
    const { lines, totals } = computeDocument(inputs);

    const visibleSum = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
    expect(totals.grandTotalMinor).toBe(visibleSum);
  });

  it('holds the invariant on a wide spread of generated documents', () => {
    let seed = 42;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };

    for (let doc = 0; doc < 200; doc += 1) {
      const inputs: LineInput[] = Array.from({ length: 1 + next(8) }, () => {
        const kind = next(3);
        return {
          quantity: 1 + next(50),
          unitPriceMinor: next(500_000),
          discountType: kind === 0 ? 'NONE' : kind === 1 ? 'PERCENT' : 'FIXED',
          discountPercentBp: kind === 1 ? next(10_001) : null,
          discountFixedMinor: kind === 2 ? next(50_000) : null,
          taxPercentBp: next(10_001),
        } satisfies LineInput;
      });

      const { lines, totals } = computeDocument(inputs);

      expect(() => assertTotalsConsistent(totals)).not.toThrow();
      expect(totals.grandTotalMinor).toBe(lines.reduce((s, l) => s + l.lineTotalMinor, 0));

      for (const l of lines) {
        expect(l.afterDiscountMinor).toBeGreaterThanOrEqual(0);
        expect(l.lineTotalMinor).toBeGreaterThanOrEqual(0);
        expect(l.discountAmountMinor).toBeLessThanOrEqual(l.lineSubtotalMinor);
      }
    }
  });
});

describe('assertTotalsConsistent', () => {
  it('accepts consistent totals', () => {
    expect(() =>
      assertTotalsConsistent({
        subtotalMinor: 45000,
        totalDiscountMinor: 4000,
        totalTaxMinor: 1150,
        grandTotalMinor: 42150,
      }),
    ).not.toThrow();
  });

  it('throws loudly on an inconsistent set rather than letting it reach an invoice', () => {
    expect(() =>
      assertTotalsConsistent({
        subtotalMinor: 45000,
        totalDiscountMinor: 4000,
        totalTaxMinor: 1150,
        grandTotalMinor: 42151,
      }),
    ).toThrow(/inconsistent/);
  });
});

describe('sumLineResults', () => {
  it('sums an empty list to zeros', () => {
    expect(sumLineResults([])).toEqual({
      subtotalMinor: 0,
      totalDiscountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 0,
    });
  });
});
