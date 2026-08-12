import { z } from 'zod';
import { currencyCodeSchema, dateStringSchema, VALIDATION_MESSAGES } from '@multi-calc/calc';

const title = z
  .string({ required_error: VALIDATION_MESSAGES.titleRequired })
  .trim()
  .min(1, VALIDATION_MESSAGES.titleRequired)
  .max(200, 'Keep the title under 200 characters.');

const customer = z
  .string({ required_error: VALIDATION_MESSAGES.customerRequired })
  .trim()
  .min(1, VALIDATION_MESSAGES.customerRequired)
  .max(200, 'Keep the customer name under 200 characters.');

export const createDocumentSchema = z.object({
  title,
  customer,
  issueDate: dateStringSchema,
  currency: currencyCodeSchema.optional(),
});

/**
 * A patch. Every field optional, but at least one required — an empty PATCH is a client bug
 * worth surfacing rather than a no-op that returns 200.
 */
export const patchDocumentSchema = z
  .object({
    title: title.optional(),
    customer: customer.optional(),
    issueDate: dateStringSchema.optional(),
    currency: currencyCodeSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'Include at least one field to update.',
  });

/**
 * Parsed from query-string text rather than coerced.
 *
 * `z.coerce.boolean()` would read the string "false" as true, because every non-empty string is
 * truthy — the same trap the report's includeDrafts flag had to avoid.
 */
const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const listQuerySchema = z.object({
  /** True fetches only archived documents; the default excludes them entirely. */
  archived: booleanish.default(false),
  status: z.enum(['draft', 'finalized', 'all']).default('all'),
  currency: currencyCodeSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  q: z.string().trim().max(200).optional(),
  sort: z
    .enum([
      'issueDate',
      '-issueDate',
      'grandTotal',
      '-grandTotal',
      'title',
      '-title',
      'updatedAt',
      '-updatedAt',
    ])
    .default('-issueDate'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
