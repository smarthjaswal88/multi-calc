import { Router } from 'express';
import {
  DEFAULT_CURRENCY,
  dateStringSchema,
  isCurrencyCode,
  validateFinalizePreconditions,
  VALIDATION_MESSAGES,
} from '@multi-calc/calc';
import { prisma } from '../../db/prisma.js';
import { ConflictError, PreconditionFailedError } from '../../errors.js';
import { loadDocument } from '../../guards/loadDocument.js';
import { requireDraft } from '../../guards/requireDraft.js';
import {
  requireArchived,
  requireFinalized,
  requireNotArchived,
} from '../../guards/requireFinalized.js';
import { handler } from '../../http/handler.js';
import { validate } from '../../middleware/validate.js';
import { serializeDocument } from '../../services/serialize.js';
import { lockDocumentAndReadLines, recompute, withTotals } from '../../services/totals.js';
import {
  createDocumentSchema,
  listQuerySchema,
  patchDocumentSchema,
  type ListQuery,
} from './schemas.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const documentsRouter = Router();

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function escapeLike(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function orderByFor(sort: ListQuery['sort']): Prisma.DocumentOrderByWithRelationInput {
  const descending = sort.startsWith('-');
  const direction = descending ? ('desc' as const) : ('asc' as const);
  const field = descending ? sort.slice(1) : sort;

  switch (field) {
    case 'grandTotal':
      return { grandTotalMinor: direction };
    case 'title':
      return { title: direction };
    case 'updatedAt':
      return { updatedAt: direction };
    default:
      return { issueDate: direction };
  }
}

documentsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  handler(async (req, res) => {
    const query = req.query as unknown as ListQuery;

    const where: Prisma.DocumentWhereInput = {
      userId: req.userId,

      archivedAt: query.archived ? { not: null } : null,
      ...(query.status !== 'all'
        ? { status: query.status === 'draft' ? ('DRAFT' as const) : ('FINALIZED' as const) }
        : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.from || query.to
        ? {
            issueDate: {
              ...(query.from ? { gte: toUtcDate(query.from) } : {}),
              ...(query.to ? { lte: toUtcDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: escapeLike(query.q), mode: 'insensitive' as const } },
              { customer: { contains: escapeLike(query.q), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, documents] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy: [orderByFor(query.sort), { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { lines: true } } },
      }),
    ]);

    res.json({
      items: documents.map((document) => serializeDocument(document, { includeLines: false })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  }),
);

documentsRouter.post(
  '/',
  validate(createDocumentSchema),
  handler(async (req, res) => {
    const body = req.body as {
      title: string;
      customer: string;
      issueDate: string;
      currency?: string;
    };

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const currency =
      body.currency ??
      (isCurrencyCode(user?.defaultCurrency) ? user.defaultCurrency : DEFAULT_CURRENCY);

    const document = await prisma.document.create({
      data: {
        userId: req.userId!,
        title: body.title,
        customer: body.customer,
        issueDate: toUtcDate(body.issueDate),
        currency,
        status: 'DRAFT',
      },
      include: { lines: true },
    });

    res.status(201).json({ document: serializeDocument(document) });
  }),
);

documentsRouter.get(
  '/:id',
  loadDocument,
  handler(async (req, res) => {
    res.json({ document: serializeDocument(req.document!) });
  }),
);

documentsRouter.patch(
  '/:id',
  loadDocument,
  requireDraft,
  validate(patchDocumentSchema),
  handler(async (req, res) => {
    const document = req.document!;
    const patch = req.body as {
      title?: string;
      customer?: string;
      issueDate?: string;
      currency?: string;
    };

    const updated = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);

      if (patch.currency && patch.currency !== document.currency && lines.length > 0) {
        throw new ConflictError(VALIDATION_MESSAGES.currencyLocked, [
          { path: 'currency', message: VALIDATION_MESSAGES.currencyLocked },
        ]);
      }

      return tx.document.update({
        where: { id: document.id },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.customer !== undefined ? { customer: patch.customer } : {}),
          ...(patch.issueDate !== undefined ? { issueDate: toUtcDate(patch.issueDate) } : {}),
          ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        },
        include: { lines: { orderBy: { position: 'asc' } } },
      });
    });

    if (patch.currency && patch.currency !== document.currency) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { defaultCurrency: patch.currency },
      });
    }

    res.json({ document: serializeDocument(updated) });
  }),
);

documentsRouter.delete(
  '/:id',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    await prisma.document.delete({ where: { id: req.document!.id } });
    res.status(204).end();
  }),
);

documentsRouter.post(
  '/:id/finalize',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;

    const lockedLines = await prisma.$transaction((tx) =>
      lockDocumentAndReadLines(tx, document.id),
    );

    const issues = validateFinalizePreconditions(
      lockedLines.map((line) => ({
        id: line.id,
        position: line.position,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })),
    );

    if (issues.length > 0) {
      throw new PreconditionFailedError(
        issues.length === 1
          ? issues[0]!.message
          : `${issues.length} lines need attention before this document can be finalized.`,
        issues.map((issue) => ({
          path: `lines.${issue.position}`,
          message: issue.message,
          ...(issue.lineId ? { lineId: issue.lineId } : {}),
        })),
      );
    }

    const finalized = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);
      const result = await recompute(tx, document.id, lines);

      const updated = await tx.document.update({
        where: { id: document.id },
        data: { status: 'FINALIZED', finalizedAt: new Date() },
      });

      return { ...updated, lines: result.lines };
    });

    res.json({ document: serializeDocument(finalized) });
  }),
);

documentsRouter.post(
  '/:id/duplicate',
  loadDocument,
  handler(async (req, res) => {
    const source = req.document!;

    const requestedDate =
      typeof (req.body as { issueDate?: unknown } | undefined)?.issueDate === 'string'
        ? (req.body as { issueDate: string }).issueDate
        : undefined;
    const today =
      requestedDate && dateStringSchema.safeParse(requestedDate).success
        ? requestedDate
        : new Date().toISOString().slice(0, 10);

    const copy = await prisma.$transaction(async (tx) => {
      const sourceLines = await lockDocumentAndReadLines(tx, source.id);

      const created = await tx.document.create({
        data: {
          userId: req.userId!,
          title: `${source.title} (copy)`.slice(0, 200),
          customer: source.customer,

          issueDate: toUtcDate(today),
          currency: source.currency,
          status: 'DRAFT',
          lines: {
            create: sourceLines.map((line) => ({
              position: line.position,
              description: line.description,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              discountType: line.discountType,
              discountPercentBp: line.discountPercentBp,
              discountFixedMinor: line.discountFixedMinor,
              taxPercentBp: line.taxPercentBp,
            })),
          },
        },
        include: { lines: { orderBy: { position: 'asc' } } },
      });

      const result = await recompute(tx, created.id, created.lines);

      return { ...withTotals(created, result.totals), lines: result.lines };
    });

    res.status(201).json({ document: serializeDocument(copy) });
  }),
);

documentsRouter.post(
  '/:id/archive',
  loadDocument,
  requireFinalized,
  requireNotArchived,
  handler(async (req, res) => {
    const document = req.document!;
    const archivedAt = new Date();

    await prisma.$executeRaw`
      UPDATE "documents" SET "archivedAt" = ${archivedAt} WHERE "id" = ${document.id}::text
    `;

    res.json({ document: serializeDocument({ ...document, archivedAt }) });
  }),
);

documentsRouter.post(
  '/:id/unarchive',
  loadDocument,
  requireArchived,
  handler(async (req, res) => {
    const document = req.document!;

    await prisma.$executeRaw`
      UPDATE "documents" SET "archivedAt" = NULL WHERE "id" = ${document.id}::text
    `;

    res.json({ document: serializeDocument({ ...document, archivedAt: null }) });
  }),
);
