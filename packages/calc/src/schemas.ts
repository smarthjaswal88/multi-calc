/**
 * Validation schemas, shared by the API and the web forms.
 *
 * Every message a user can see is authored here exactly once, so the text shown while typing
 * is identical to the text the server would return. Messages name the field and state the
 * fix; none of them says "invalid input".
 */

import { z } from 'zod';
import { CURRENCY_CODES, type CurrencyCode } from './currency.js';
import { formatMoney, MAX_AMOUNT_MINOR, MAX_QUANTITY } from './money.js';
import { BASIS_POINTS_SCALE } from './rounding.js';

export const VALIDATION_MESSAGES = {
  descriptionRequired: 'Add a description.',
  quantityMin: 'Quantity must be at least 1.',
  quantityInteger: 'Quantity must be a whole number.',
  quantityMax: `Quantity must be ${MAX_QUANTITY.toLocaleString('en-US')} or less.`,
  unitPriceRequired: 'Enter a unit price.',
  unitPriceNegative: "Unit price can't be negative.",
  unitPriceWhole: 'Unit price must be a whole number of minor units.',
  discountFixedNegative: "A discount amount can't be negative.",
  discountFixedWhole: 'Discount amount must be a whole number of minor units.',
  amountTooLarge: 'That amount is too large.',
  lineSubtotalTooLarge:
    "This line's subtotal is too large to store. Reduce the quantity or the unit price.",
  documentTotalTooLarge:
    "This document's total is too large to store. Split it across more than one document.",
  discountPercentRange: 'Discount percent must be between 0 and 100.',
  discountPercentMissing: 'Enter a discount percent, or change the discount to none.',
  discountFixedMissing: 'Enter a discount amount, or change the discount to none.',
  discountBothTypes: 'A line can have a percent discount or a fixed discount, not both.',
  taxPercentRange: 'Tax percent must be between 0 and 100.',
  titleRequired: 'Add a title.',
  customerRequired: 'Add a customer name.',
  issueDateRequired: 'Choose an issue date.',
  currencyUnsupported: 'Choose a currency from the list.',
  currencyLocked:
    "Currency can't change once a document has line items. Remove all lines to change it.",
  rangeInverted: 'The end date must fall on or after the start date.',
  finalizeNoLines: 'Add at least one line before finalizing.',
  dateFormat: 'Use the format YYYY-MM-DD.',
  dateNotReal: "That date doesn't exist.",
  passwordTooLong:
    'Use 72 characters or fewer. Accented and non-Latin characters count for more than one.',
} as const;

/** "Discount can't be more than this line's subtotal of $200.00." */
export function discountExceedsSubtotalMessage(
  subtotalMinor: number,
  currency: CurrencyCode,
): string {
  return `Discount can't be more than this line's subtotal of ${formatMoney(subtotalMinor, currency)}.`;
}

/** "Line 3 has a quantity of 0. Every line needs a quantity of at least 1." */
export function finalizeQuantityMessage(position: number, quantity: number): string {
  return `Line ${position} has a quantity of ${quantity}. Every line needs a quantity of at least 1.`;
}

/** "Line 2 has a negative unit price. Prices can't be negative." */
export function finalizePriceMessage(position: number): string {
  return `Line ${position} has a negative unit price. Prices can't be negative.`;
}

export const currencyCodeSchema = z.enum(
  CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]],
  { errorMap: () => ({ message: VALIDATION_MESSAGES.currencyUnsupported }) },
);

/**
 * A calendar date, as `YYYY-MM-DD`.
 *
 * The refine is a *round trip*, not a parse check. `Date.parse('2026-06-31')` succeeds and
 * silently rolls the value forward to 1 July, so a parse check would accept a date that does
 * not exist and then store a different one than the user typed — quietly moving a document out
 * of the reporting range it belongs to. Re-serialising and comparing catches every such case.
 */
export const dateStringSchema = z
  .string({ required_error: VALIDATION_MESSAGES.issueDateRequired })
  .regex(/^\d{4}-\d{2}-\d{2}$/, VALIDATION_MESSAGES.dateFormat)
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      );
    },
    { message: VALIDATION_MESSAGES.dateNotReal },
  );

const quantitySchema = z
  .number({
    required_error: VALIDATION_MESSAGES.quantityMin,
    invalid_type_error: VALIDATION_MESSAGES.quantityInteger,
  })
  .int(VALIDATION_MESSAGES.quantityInteger)
  .min(1, VALIDATION_MESSAGES.quantityMin)
  .max(MAX_QUANTITY, VALIDATION_MESSAGES.quantityMax);

const unitPriceSchema = z
  .number({
    required_error: VALIDATION_MESSAGES.unitPriceRequired,
    invalid_type_error: VALIDATION_MESSAGES.unitPriceRequired,
  })
  .int(VALIDATION_MESSAGES.unitPriceWhole)
  .min(0, VALIDATION_MESSAGES.unitPriceNegative)
  .max(MAX_AMOUNT_MINOR, VALIDATION_MESSAGES.amountTooLarge);

const percentBpSchema = (message: string) =>
  z
    .number({ invalid_type_error: message })
    .int(message)
    .min(0, message)
    .max(BASIS_POINTS_SCALE, message)
    .nullable()
    .optional();

const baseLineShape = {
  description: z
    .string({ required_error: VALIDATION_MESSAGES.descriptionRequired })
    .trim()
    .min(1, VALIDATION_MESSAGES.descriptionRequired)
    .max(500, 'Keep the description under 500 characters.'),
  quantity: quantitySchema,
  unitPriceMinor: unitPriceSchema,
  discountType: z.enum(['NONE', 'PERCENT', 'FIXED']).default('NONE'),
  discountPercentBp: percentBpSchema(VALIDATION_MESSAGES.discountPercentRange),
  discountFixedMinor: z
    .number({ invalid_type_error: VALIDATION_MESSAGES.discountFixedMissing })
    .int(VALIDATION_MESSAGES.discountFixedWhole)
    .min(0, VALIDATION_MESSAGES.discountFixedNegative)
    .max(MAX_AMOUNT_MINOR, VALIDATION_MESSAGES.amountTooLarge)
    .nullable()
    .optional(),
  taxPercentBp: percentBpSchema(VALIDATION_MESSAGES.taxPercentRange),
};

/**
 * Line schema, bound to a currency.
 *
 * The currency is needed only so the over-large-fixed-discount message can name the actual
 * subtotal — "more than this line's subtotal of $200.00" is actionable in a way that
 * "discount too large" is not.
 */
export function lineInputSchema(currency: CurrencyCode) {
  return z.object(baseLineShape).superRefine((line, ctx) => {
    // Quantity and unit price are individually bounded, but their product is what gets
    // stored. Without this check a modest price and a large quantity combine into a subtotal
    // no INTEGER column can hold, and the write fails in the driver as a 500 rather than here
    // as a specific 400.
    if (line.quantity * line.unitPriceMinor > MAX_AMOUNT_MINOR) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['unitPriceMinor'],
        message: VALIDATION_MESSAGES.lineSubtotalTooLarge,
      });
      return;
    }

    const hasPercent = line.discountPercentBp !== null && line.discountPercentBp !== undefined;
    const hasFixed = line.discountFixedMinor !== null && line.discountFixedMinor !== undefined;

    if (hasPercent && hasFixed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountType'],
        message: VALIDATION_MESSAGES.discountBothTypes,
      });
      return;
    }

    if (line.discountType === 'PERCENT' && !hasPercent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountPercentBp'],
        message: VALIDATION_MESSAGES.discountPercentMissing,
      });
    }

    if (line.discountType === 'FIXED' && !hasFixed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountFixedMinor'],
        message: VALIDATION_MESSAGES.discountFixedMissing,
      });
    }

    if (line.discountType === 'NONE' && (hasPercent || hasFixed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountType'],
        message: VALIDATION_MESSAGES.discountBothTypes,
      });
    }

    // A fixed discount may not exceed the line's own subtotal. We reject rather than clamp:
    // silently altering a figure the author typed is the worse failure in a document a
    // customer will read.
    if (line.discountType === 'FIXED' && hasFixed) {
      const subtotal = line.quantity * line.unitPriceMinor;
      if ((line.discountFixedMinor as number) > subtotal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountFixedMinor'],
          message: discountExceedsSubtotalMessage(subtotal, currency),
        });
      }
    }
  });
}

export const documentMetadataSchema = z.object({
  title: z
    .string({ required_error: VALIDATION_MESSAGES.titleRequired })
    .trim()
    .min(1, VALIDATION_MESSAGES.titleRequired)
    .max(200, 'Keep the title under 200 characters.'),
  customer: z
    .string({ required_error: VALIDATION_MESSAGES.customerRequired })
    .trim()
    .min(1, VALIDATION_MESSAGES.customerRequired)
    .max(200, 'Keep the customer name under 200 characters.'),
  issueDate: dateStringSchema,
  currency: currencyCodeSchema,
});

export const documentMetadataPatchSchema = documentMetadataSchema.partial();

export const reportRangeSchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    includeDrafts: z.boolean().default(true),
  })
  .superRefine((range, ctx) => {
    if (range.to < range.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: VALIDATION_MESSAGES.rangeInverted,
      });
    }
  });

export const credentialsSchema = z.object({
  email: z
    .string({ required_error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  /**
   * Bounded by BYTES, not characters, because bcrypt truncates at 72 bytes and says nothing.
   *
   * A 200-character limit let two different long passwords hash identically — everything past the
   * 72nd byte was silently discarded, so a user who changed only the tail of a long password would
   * find the old one still worked. Multibyte characters make the two counts diverge: 'é' is two
   * bytes and most emoji are four, so a 40-character password can exceed the limit.
   */
  password: z
    .string({ required_error: 'Enter a password.' })
    .min(8, 'Use at least 8 characters.')
    .refine((value) => new TextEncoder().encode(value).length <= 72, {
      message: VALIDATION_MESSAGES.passwordTooLong,
    }),
});

export interface FinalizeIssue {
  position: number;
  lineId?: string;
  message: string;
}

/**
 * Structural checks that must hold before a document can be finalized.
 *
 * Returns every problem rather than the first, so the interface can list the offending lines
 * with links instead of making the user fix them one at a time.
 */
export function validateFinalizePreconditions(
  lines: readonly { id?: string; position: number; quantity: number; unitPriceMinor: number }[],
): FinalizeIssue[] {
  const issues: FinalizeIssue[] = [];

  if (lines.length === 0) {
    issues.push({ position: 0, message: VALIDATION_MESSAGES.finalizeNoLines });
    return issues;
  }

  for (const line of lines) {
    if (line.quantity <= 0) {
      issues.push({
        position: line.position,
        ...(line.id ? { lineId: line.id } : {}),
        message: finalizeQuantityMessage(line.position, line.quantity),
      });
    }
    if (line.unitPriceMinor < 0) {
      issues.push({
        position: line.position,
        ...(line.id ? { lineId: line.id } : {}),
        message: finalizePriceMessage(line.position),
      });
    }
  }

  return issues;
}
