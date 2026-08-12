import { Router } from 'express';
import { z } from 'zod';
import { dateStringSchema, VALIDATION_MESSAGES } from '@multi-calc/calc';
import { prisma } from '../../db/prisma.js';
import { handler } from '../../http/handler.js';
import { validate } from '../../middleware/validate.js';
import { serializeDocument } from '../../services/serialize.js';

export const reportsRouter = Router();

const MAX_BREAKDOWN_ROWS = 500;

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const summaryQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    includeDrafts: booleanish.default(true),

    includeDocuments: booleanish.default(false),
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

type SummaryQuery = z.infer<typeof summaryQuerySchema>;

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

reportsRouter.get(
  '/summary',
  validate(summaryQuerySchema, 'query'),
  handler(async (req, res) => {
    const query = req.query as unknown as SummaryQuery;

    const where = {
      userId: req.userId,

      archivedAt: null,
      issueDate: { gte: toUtcDate(query.from), lte: toUtcDate(query.to) },
      ...(query.includeDrafts ? {} : { status: 'FINALIZED' as const }),
    };

    const grouped = await prisma.document.groupBy({
      by: ['currency'],
      where,
      _count: { _all: true },
      _sum: {
        subtotalMinor: true,
        totalDiscountMinor: true,
        totalTaxMinor: true,
        grandTotalMinor: true,
      },
      orderBy: { currency: 'asc' },
    });

    const groups = grouped.map((row) => ({
      currency: row.currency,
      documentCount: row._count._all,
      subtotalMinor: row._sum.subtotalMinor ?? 0,
      totalDiscountMinor: row._sum.totalDiscountMinor ?? 0,
      totalTaxMinor: row._sum.totalTaxMinor ?? 0,
      grandTotalMinor: row._sum.grandTotalMinor ?? 0,
    }));

    const documents = query.includeDocuments
      ? await prisma.document.findMany({
          where,
          orderBy: [{ currency: 'asc' }, { issueDate: 'asc' }],
          include: { _count: { select: { lines: true } } },
          take: MAX_BREAKDOWN_ROWS + 1,
        })
      : undefined;

    const truncated = (documents?.length ?? 0) > MAX_BREAKDOWN_ROWS;
    const breakdown = truncated ? documents!.slice(0, MAX_BREAKDOWN_ROWS) : documents;

    res.json({
      range: { from: query.from, to: query.to },
      includeDrafts: query.includeDrafts,

      excludesArchived: true,

      documentCount: groups.reduce((sum, group) => sum + group.documentCount, 0),
      currencyCount: groups.length,
      groups,

      breakdownTruncated: truncated,
      ...(breakdown
        ? {
            documents: breakdown.map((document) =>
              serializeDocument(document, { includeLines: false }),
            ),
          }
        : {}),
    });
  }),
);
