import { describe, expect, it } from 'vitest';
import {
  VALIDATION_MESSAGES,
  credentialsSchema,
  documentMetadataSchema,
  lineInputSchema,
  reportRangeSchema,
  validateFinalizePreconditions,
} from '../src/schemas.js';

const usdLine = lineInputSchema('USD');

function messageFor(result: { success: boolean; error?: { issues: readonly { path: (string | number)[]; message: string }[] } }, path: string): string | undefined {
  return result.error?.issues.find((i) => i.path.join('.') === path)?.message;
}

function valid(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Widget A',
    quantity: 2,
    unitPriceMinor: 10000,
    discountType: 'NONE' as const,
    ...overrides,
  };
}

describe('line validation — required fields', () => {
  it('accepts a well-formed line', () => {
    expect(usdLine.safeParse(valid()).success).toBe(true);
  });

  it('rejects an empty description', () => {
    const result = usdLine.safeParse(valid({ description: '   ' }));
    expect(messageFor(result, 'description')).toBe(VALIDATION_MESSAGES.descriptionRequired);
  });

  it('rejects a quantity below 1', () => {
    const result = usdLine.safeParse(valid({ quantity: 0 }));
    expect(messageFor(result, 'quantity')).toBe(VALIDATION_MESSAGES.quantityMin);
  });

  it('rejects a negative quantity', () => {
    const result = usdLine.safeParse(valid({ quantity: -3 }));
    expect(messageFor(result, 'quantity')).toBe(VALIDATION_MESSAGES.quantityMin);
  });

  it('rejects a fractional quantity with its own message', () => {
    const result = usdLine.safeParse(valid({ quantity: 1.5 }));
    expect(messageFor(result, 'quantity')).toBe(VALIDATION_MESSAGES.quantityInteger);
  });

  it('rejects a negative unit price', () => {
    const result = usdLine.safeParse(valid({ unitPriceMinor: -1 }));
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.unitPriceNegative);
  });

  it('accepts a zero unit price', () => {
    expect(usdLine.safeParse(valid({ unitPriceMinor: 0 })).success).toBe(true);
  });
});

describe('line validation — discount rules', () => {
  it('rejects a discount percent above 100', () => {
    const result = usdLine.safeParse(
      valid({ discountType: 'PERCENT', discountPercentBp: 10001 }),
    );
    expect(messageFor(result, 'discountPercentBp')).toBe(
      VALIDATION_MESSAGES.discountPercentRange,
    );
  });

  it('rejects a negative discount percent', () => {
    const result = usdLine.safeParse(valid({ discountType: 'PERCENT', discountPercentBp: -1 }));
    expect(messageFor(result, 'discountPercentBp')).toBe(
      VALIDATION_MESSAGES.discountPercentRange,
    );
  });

  it('accepts exactly 100 percent', () => {
    expect(
      usdLine.safeParse(valid({ discountType: 'PERCENT', discountPercentBp: 10000 })).success,
    ).toBe(true);
  });

  it('rejects both discount types supplied at once', () => {
    const result = usdLine.safeParse(
      valid({ discountType: 'PERCENT', discountPercentBp: 1000, discountFixedMinor: 500 }),
    );
    expect(messageFor(result, 'discountType')).toBe(VALIDATION_MESSAGES.discountBothTypes);
  });

  it('rejects a discount value supplied when the type is NONE', () => {
    const result = usdLine.safeParse(valid({ discountType: 'NONE', discountPercentBp: 1000 }));
    expect(messageFor(result, 'discountType')).toBe(VALIDATION_MESSAGES.discountBothTypes);
  });

  it('rejects a PERCENT type with no percentage', () => {
    const result = usdLine.safeParse(valid({ discountType: 'PERCENT' }));
    expect(messageFor(result, 'discountPercentBp')).toBe(
      VALIDATION_MESSAGES.discountPercentMissing,
    );
  });

  it('rejects a FIXED type with no amount', () => {
    const result = usdLine.safeParse(valid({ discountType: 'FIXED' }));
    expect(messageFor(result, 'discountFixedMinor')).toBe(
      VALIDATION_MESSAGES.discountFixedMissing,
    );
  });

  it('rejects a fixed discount larger than the line subtotal, naming the subtotal', () => {
    const result = usdLine.safeParse(
      valid({ discountType: 'FIXED', discountFixedMinor: 25000 }),
    );
    expect(messageFor(result, 'discountFixedMinor')).toBe(
      "Discount can't be more than this line's subtotal of $200.00.",
    );
  });

  it('accepts a fixed discount equal to the subtotal', () => {
    expect(
      usdLine.safeParse(valid({ discountType: 'FIXED', discountFixedMinor: 20000 })).success,
    ).toBe(true);
  });

  it('names the subtotal in the document currency, not always dollars', () => {
    const result = lineInputSchema('INR').safeParse(
      valid({ discountType: 'FIXED', discountFixedMinor: 25000 }),
    );
    expect(messageFor(result, 'discountFixedMinor')).toContain('₹');
  });
});

describe('line validation — tax rules', () => {
  it('rejects a tax percent above 100', () => {
    const result = usdLine.safeParse(valid({ taxPercentBp: 10001 }));
    expect(messageFor(result, 'taxPercentBp')).toBe(VALIDATION_MESSAGES.taxPercentRange);
  });

  it('rejects a negative tax percent', () => {
    const result = usdLine.safeParse(valid({ taxPercentBp: -50 }));
    expect(messageFor(result, 'taxPercentBp')).toBe(VALIDATION_MESSAGES.taxPercentRange);
  });

  it('accepts a null tax percent', () => {
    expect(usdLine.safeParse(valid({ taxPercentBp: null })).success).toBe(true);
  });
});

describe('document metadata validation', () => {
  const validMeta = {
    title: 'Q3 Platform Retainer',
    customer: 'Northwind Trading Co.',
    issueDate: '2026-08-08',
    currency: 'USD',
  };

  it('accepts well-formed metadata', () => {
    expect(documentMetadataSchema.safeParse(validMeta).success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = documentMetadataSchema.safeParse({ ...validMeta, title: '  ' });
    expect(messageFor(result, 'title')).toBe(VALIDATION_MESSAGES.titleRequired);
  });

  it('rejects an empty customer', () => {
    const result = documentMetadataSchema.safeParse({ ...validMeta, customer: '' });
    expect(messageFor(result, 'customer')).toBe(VALIDATION_MESSAGES.customerRequired);
  });

  it('rejects a malformed issue date', () => {
    const result = documentMetadataSchema.safeParse({ ...validMeta, issueDate: '08/08/2026' });
    expect(messageFor(result, 'issueDate')).toBe(VALIDATION_MESSAGES.dateFormat);
  });

  it('rejects a correctly formatted date that does not exist', () => {
    for (const impossible of ['2026-06-31', '2026-02-30', '2025-02-29', '2026-04-31']) {
      const result = documentMetadataSchema.safeParse({ ...validMeta, issueDate: impossible });
      expect(result.success, `${impossible} should be rejected`).toBe(false);
      expect(messageFor(result, 'issueDate')).toBe(VALIDATION_MESSAGES.dateNotReal);
    }
  });

  it('accepts a genuine leap day', () => {
    const result = documentMetadataSchema.safeParse({ ...validMeta, issueDate: '2028-02-29' });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range month or day', () => {
    for (const bad of ['2026-13-01', '2026-00-10', '2026-08-00', '2026-08-32']) {
      const result = documentMetadataSchema.safeParse({ ...validMeta, issueDate: bad });
      expect(result.success, `${bad} should be rejected`).toBe(false);
    }
  });

  it('rejects an unsupported currency', () => {
    const result = documentMetadataSchema.safeParse({ ...validMeta, currency: 'XYZ' });
    expect(messageFor(result, 'currency')).toBe(VALIDATION_MESSAGES.currencyUnsupported);
  });
});

describe('validation messages name the rule that actually rejected the value', () => {
  it('reports a non-integer unit price as non-integer, not as negative', () => {
    const result = usdLine.safeParse(valid({ unitPriceMinor: 1000.5 }));
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.unitPriceWhole);
  });

  it('reports a missing unit price as missing, not as negative', () => {
    const result = usdLine.safeParse({ ...valid(), unitPriceMinor: undefined });
    expect(messageFor(result, 'unitPriceMinor')).toBe(VALIDATION_MESSAGES.unitPriceRequired);
  });

  it('reports a negative fixed discount as negative, not as missing', () => {
    const result = usdLine.safeParse(
      valid({ discountType: 'FIXED', discountFixedMinor: -500 }),
    );
    expect(messageFor(result, 'discountFixedMinor')).toBe(
      VALIDATION_MESSAGES.discountFixedNegative,
    );
  });

  it('reports a non-integer fixed discount as non-integer, not as missing', () => {
    const result = usdLine.safeParse(
      valid({ discountType: 'FIXED', discountFixedMinor: 500.25 }),
    );
    expect(messageFor(result, 'discountFixedMinor')).toBe(VALIDATION_MESSAGES.discountFixedWhole);
  });
});

describe('report range validation', () => {
  it('accepts a forward range', () => {
    expect(
      reportRangeSchema.safeParse({ from: '2026-08-01', to: '2026-08-31' }).success,
    ).toBe(true);
  });

  it('accepts a single-day range', () => {
    expect(
      reportRangeSchema.safeParse({ from: '2026-08-01', to: '2026-08-01' }).success,
    ).toBe(true);
  });

  it('rejects an inverted range', () => {
    const result = reportRangeSchema.safeParse({ from: '2026-08-31', to: '2026-08-01' });
    expect(messageFor(result, 'to')).toBe(VALIDATION_MESSAGES.rangeInverted);
  });

  it('includes drafts by default', () => {
    const parsed = reportRangeSchema.parse({ from: '2026-08-01', to: '2026-08-31' });
    expect(parsed.includeDrafts).toBe(true);
  });
});

describe('finalize preconditions', () => {
  it('passes a document with valid lines', () => {
    const issues = validateFinalizePreconditions([
      { position: 1, quantity: 2, unitPriceMinor: 10000 },
      { position: 2, quantity: 1, unitPriceMinor: 0 },
    ]);
    expect(issues).toEqual([]);
  });

  it('refuses a document with no lines', () => {
    const issues = validateFinalizePreconditions([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(VALIDATION_MESSAGES.finalizeNoLines);
  });

  it('names the offending line and its quantity', () => {
    const issues = validateFinalizePreconditions([
      { position: 1, quantity: 2, unitPriceMinor: 10000 },
      { position: 3, quantity: 0, unitPriceMinor: 5000 },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.position).toBe(3);
    expect(issues[0]!.message).toBe(
      'Line 3 has a quantity of 0. Every line needs a quantity of at least 1.',
    );
  });

  it('flags a negative unit price', () => {
    const issues = validateFinalizePreconditions([
      { position: 2, quantity: 1, unitPriceMinor: -100 },
    ]);
    expect(issues[0]!.message).toBe("Line 2 has a negative unit price. Prices can't be negative.");
  });

  it('reports every problem at once rather than the first', () => {
    const issues = validateFinalizePreconditions([
      { position: 1, quantity: 0, unitPriceMinor: 100 },
      { position: 2, quantity: -1, unitPriceMinor: -100 },
      { position: 3, quantity: 5, unitPriceMinor: 100 },
    ]);
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.position)).toEqual([1, 2, 2]);
  });

  it('carries the line id through when one is supplied, so the UI can link to it', () => {
    const issues = validateFinalizePreconditions([
      { id: 'line_abc', position: 1, quantity: 0, unitPriceMinor: 100 },
    ]);
    expect(issues[0]!.lineId).toBe('line_abc');
  });
});

describe('credentials validation', () => {
  it('accepts and normalises an email', () => {
    const parsed = credentialsSchema.parse({ email: '  USER@Example.COM ', password: 'hunter22' });
    expect(parsed.email).toBe('user@example.com');
  });

  it('rejects a malformed email', () => {
    const result = credentialsSchema.safeParse({ email: 'nope', password: 'hunter22' });
    expect(messageFor(result, 'email')).toBe('Enter a valid email address.');
  });

  it('rejects a password past bcrypt 72-byte truncation point', () => {
    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(73) });
    expect(messageFor(result, 'password')).toBe(VALIDATION_MESSAGES.passwordTooLong);
  });

  it('accepts a password of exactly 72 bytes', () => {
    expect(
      credentialsSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(72) }).success,
    ).toBe(true);
  });

  it('counts BYTES, not characters — 50 accented characters is 100 bytes', () => {
    const accented = 'é'.repeat(50);
    expect(accented.length).toBe(50);
    expect(new TextEncoder().encode(accented).length).toBe(100);

    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: accented });
    expect(messageFor(result, 'password')).toBe(VALIDATION_MESSAGES.passwordTooLong);
  });

  it('rejects a short password', () => {
    const result = credentialsSchema.safeParse({ email: 'a@b.com', password: 'short' });
    expect(messageFor(result, 'password')).toBe('Use at least 8 characters.');
  });
});
