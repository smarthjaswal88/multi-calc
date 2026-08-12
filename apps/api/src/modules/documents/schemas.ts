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

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const listQuerySchema = z.object({
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
