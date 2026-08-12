/**
 * Storage bounds.
 *
 * Every monetary column in the schema is a PostgreSQL INTEGER, which tops out at 2,147,483,647.
 * If validation accepted a value above that, the write would fail inside the database driver
 * and reach the user as a 500 rather than a specific 400. These tests pin the validation
 * ceiling to the storage ceiling so the two cannot drift apart.
 */

import { describe, expect, it } from 'vitest';
import { computeDocument, exceedsStorageBounds } from '../src/document.js';
import { MAX_AMOUNT_MINOR, MAX_QUANTITY, PG_INT4_MAX, parseMoney } from '../src/money.js';
import { VALIDATION_MESSAGES, lineInputSchema } from '../src/schemas.js';
import type { LineInput } from '../src/types.js';

const schema = lineInputSchema('USD');

function messageFor(
  result: { error?: { issues: readonly { path: (string | number)[]; message: string }[] } },
  path: string,
): string | undefined {
  return result.error?.issues.find((i) => i.path.join('.') === path)?.message;
}

function line(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Bounded line',
    quantity: 1,
    unitPriceMinor: 10000,
    discountType: 'NONE' as const,
    ...overrides,
  };
}

describe('the validation ceiling matches the storage ceiling', () => {
  it('keeps the amount ceiling below what an INTEGER column can hold', () => {
    expect(MAX_AMOUNT_MINOR).toBeLessThanOrEqual(PG_INT4_MAX);
  });

  it('leaves room for the worst-case intermediate inside safe-integer range', () => {
    // The largest intermediate is an amount multiplied by the basis-point scale.
    expect(MAX_AMOUNT_MINOR * 10_000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('keeps a maximum-quantity line at the maximum price out of the storable range', () => {
    // Both bounds are individually satisfiable, so their product must be checked separately —
    // which is exactly what the line schema does.
    expect(MAX_QUANTITY * MAX_AMOUNT_MINOR).toBeGreaterThan(PG_INT4_MAX);
  });
});

describe('parseMoney respects the ceiling', () => {
  it('accepts the largest storable amount', () => {
    expect(parseMoney('20000000.00', 'USD')).toBe(2_000_000_000);
  });

  it('rejects an amount above the ceiling', () => {
    expect(() => parseMoney('20000000.01', 'USD')).toThrow('too large');
  });

  it('rejects an amount that would overflow an INTEGER column', () => {
    expect(() => parseMoney('30000000.00', 'USD')).toThrow('too large');
  });
});

describe('line validation bounds', () => {
  it('accepts a unit price at the ceiling', () => {
    expect(schema.safeParse(line({ unitPriceMinor: MAX_AMOUNT_MINOR })).success).toBe(true);
  });

  it('rejects a unit price above the ceiling', () => {
    const result = schema.safeParse(line({ unitPriceMinor: MAX_AMOUNT_MINOR + 1 }));
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.amountTooLarge);
  });

  it('rejects a quantity above the ceiling', () => {
    const result = schema.safeParse(line({ quantity: MAX_QUANTITY + 1 }));
    expect(messageFor(result, 'quantity')).toBe(VALIDATION_MESSAGES.quantityMax);
  });

  it('accepts a quantity at the ceiling when the resulting subtotal still fits', () => {
    expect(schema.safeParse(line({ quantity: MAX_QUANTITY, unitPriceMinor: 1000 })).success).toBe(
      true,
    );
  });

  it('rejects a product that overflows even though both factors are individually valid', () => {
    // 1,000,000 x 100,000 = 1e11, which no INTEGER column can hold. Before this check the
    // request reached Postgres and failed as a driver error.
    const result = schema.safeParse(line({ quantity: 1_000_000, unitPriceMinor: 100_000 }));
    expect(result.success).toBe(false);
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.lineSubtotalTooLarge);
  });

  it('accepts a product exactly at the ceiling', () => {
    const result = schema.safeParse(line({ quantity: 2, unitPriceMinor: MAX_AMOUNT_MINOR / 2 }));
    expect(result.success).toBe(true);
  });

  it('reports the subtotal overflow before other discount issues, so the message is actionable', () => {
    const result = schema.safeParse(
      line({
        quantity: 1_000_000,
        unitPriceMinor: 100_000,
        discountType: 'PERCENT',
        discountPercentBp: 500,
        discountFixedMinor: 100,
      }),
    );
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.lineSubtotalTooLarge);
  });
});

describe('document-level storage bounds', () => {
  it('passes a document well inside the ceiling', () => {
    const { totals } = computeDocument([
      { quantity: 2, unitPriceMinor: 10000, discountType: 'PERCENT', discountPercentBp: 1000, taxPercentBp: 500 },
    ]);
    expect(exceedsStorageBounds(totals)).toBe(false);
  });

  it('catches a document whose lines are each valid but whose sum overflows', () => {
    // Fifty lines at the per-line ceiling: every line passes its own schema, but the document
    // subtotal is 1e11 and cannot be stored.
    const big: LineInput = {
      quantity: 1,
      unitPriceMinor: MAX_AMOUNT_MINOR,
      discountType: 'NONE',
    };
    const { totals } = computeDocument(Array.from({ length: 50 }, () => big));

    expect(totals.subtotalMinor).toBeGreaterThan(PG_INT4_MAX);
    expect(exceedsStorageBounds(totals)).toBe(true);
  });

  it('catches an overflow in the tax total specifically', () => {
    const totals = {
      subtotalMinor: 0,
      totalDiscountMinor: 0,
      totalTaxMinor: MAX_AMOUNT_MINOR + 1,
      grandTotalMinor: 0,
    };
    expect(exceedsStorageBounds(totals)).toBe(true);
  });

  it('accepts totals exactly at the ceiling', () => {
    const totals = {
      subtotalMinor: MAX_AMOUNT_MINOR,
      totalDiscountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: MAX_AMOUNT_MINOR,
    };
    expect(exceedsStorageBounds(totals)).toBe(false);
  });
});
