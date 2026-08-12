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

/** Parse a YYYY-MM-DD string into the UTC midnight a DATE column round-trips to. */
function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/**
 * Escape the LIKE metacharacters before a search term reaches Prisma's `contains`.
 *
 * `contains` compiles to LIKE, where `%` matches any run of characters and `_` matches any single
 * one. So searching for the literal text "50%" matched every title containing "50" followed by
 * anything — a search for a discount label quietly returned unrelated documents. Backslash goes
 * first, or it would escape the escapes added after it.
 */
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

// ---------------------------------------------------------------------------------------
// GET /documents — the list
// ---------------------------------------------------------------------------------------
documentsRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  handler(async (req, res) => {
    const query = req.query as unknown as ListQuery;

    const where: Prisma.DocumentWhereInput = {
      userId: req.userId,
      // Archived documents are excluded unless explicitly asked for. `archived=true` is how the
      // Archive screen fetches; there is deliberately no "both" mode, because a list mixing the
      // two would need a column to tell them apart and the point of archiving is separation.
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

// ---------------------------------------------------------------------------------------
// POST /documents — create a draft
// ---------------------------------------------------------------------------------------
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

    // Falls back to the user's last choice, so someone who works in one currency never picks it
    // twice.
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

// ---------------------------------------------------------------------------------------
// GET /documents/:id
// ---------------------------------------------------------------------------------------
documentsRouter.get(
  '/:id',
  loadDocument,
  handler(async (req, res) => {
    res.json({ document: serializeDocument(req.document!) });
  }),
);

// ---------------------------------------------------------------------------------------
// PATCH /documents/:id — metadata, and the currency lock
// ---------------------------------------------------------------------------------------
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
      // The currency lock, checked against the LOCKED line set.
      //
      // It previously read document.lines.length from the unlocked loadDocument snapshot, which is
      // the one mutation left outside the lock. Two tabs — one holding a 0-line draft, one adding a
      // line — could land a currency change beside a new line, producing exactly the hundredfold
      // re-denomination this rule exists to prevent: 10000 minor units means $100.00 as USD and
      // ¥10,000 as JPY.
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

    // Changing currency does not change any stored amount — only how it is read. Totals are
    // unaffected, so no recompute is needed here.
    if (patch.currency && patch.currency !== document.currency) {
      await prisma.user.update({
        where: { id: req.userId },
        data: { defaultCurrency: patch.currency },
      });
    }

    res.json({ document: serializeDocument(updated) });
  }),
);

// ---------------------------------------------------------------------------------------
// DELETE /documents/:id — drafts only
// ---------------------------------------------------------------------------------------
documentsRouter.delete(
  '/:id',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    // Lines cascade.
    await prisma.document.delete({ where: { id: req.document!.id } });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------------------
// POST /documents/:id/finalize
// ---------------------------------------------------------------------------------------
documentsRouter.post(
  '/:id/finalize',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;

    // Read under the lock before validating: preconditions checked against a pre-transaction
    // snapshot could pass while a concurrent edit makes them false, freezing a document that
    // should have been refused.
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
      // Every problem at once, each naming its line, so the interface can list them with links
      // rather than making the user fix them one at a time.
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
      // Recompute once more before closing the record, so the frozen figures are provably the
      // engine's current output rather than whatever was last written.
      // Re-locked and re-read inside the writing transaction. The precondition check above used a
      // separate transaction, so this is the set that actually gets frozen.
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

// ---------------------------------------------------------------------------------------
// POST /documents/:id/duplicate — the only route from a closed record back to an editable one
// ---------------------------------------------------------------------------------------
documentsRouter.post(
  '/:id/duplicate',
  loadDocument,
  handler(async (req, res) => {
    const source = req.document!;

    /**
     * "Today" from the caller's perspective, not the server's.
     *
     * `new Date().toISOString()` is UTC, so for a user in IST every duplicate created before 05:30
     * local time was stamped with yesterday's date — silently filing it into the previous day's
     * reporting range.
     *
     * The request carries no timezone, so the client may state the date it means; the UTC date
     * remains the fallback. Documented limitation rather than a silent off-by-one: a client that
     * sends nothing still gets UTC.
     */
    const requestedDate =
      typeof (req.body as { issueDate?: unknown } | undefined)?.issueDate === 'string'
        ? (req.body as { issueDate: string }).issueDate
        : undefined;
    const today =
      requestedDate && dateStringSchema.safeParse(requestedDate).success
        ? requestedDate
        : new Date().toISOString().slice(0, 10);

    const copy = await prisma.$transaction(async (tx) => {
      // Lock the source so a concurrent edit cannot be copied half-applied.
      const sourceLines = await lockDocumentAndReadLines(tx, source.id);

      const created = await tx.document.create({
        data: {
          userId: req.userId!,
          title: `${source.title} (copy)`.slice(0, 200),
          customer: source.customer,
          // A copy is a new document, issued now — not a claim to have been issued when the
          // original was.
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

      // Totals are recomputed from the copied inputs rather than copied, so a duplicate is
      // always internally consistent with the engine as it stands today.
      const result = await recompute(tx, created.id, created.lines);

      return { ...withTotals(created, result.totals), lines: result.lines };
    });

    res.status(201).json({ document: serializeDocument(copy) });
  }),
);

// ---------------------------------------------------------------------------------------
// POST /documents/:id/archive
//
// Note the guard stack: requireFinalized, NOT requireDraft. Archiving is the one mutation that
// is valid on precisely a finalized document, so requireDraft — which rejects everything on a
// finalized document — would reject every request here. See guards/requireFinalized.ts.
//
// Written as raw SQL rather than prisma.document.update because Prisma's @updatedAt would move
// the timestamp on a record the schema and README both describe as frozen. Archiving changes no
// line, no amount, and no metadata; archivedAt carries the only timestamp the action needs.
// ---------------------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------------------
// POST /documents/:id/unarchive
//
// Restoring must NOT touch status. An archived document comes back finalized, because
// archive → restore returning a draft would be a route to un-finalize a closed record: edit an
// immutable document by round-tripping it through the archive.
//
// This handler is the guarantee. A row-level CHECK cannot express it — a CHECK sees only the new
// row, never the previous one, so it cannot forbid a status transition. The end-to-end suite
// asserts it explicitly.
// ---------------------------------------------------------------------------------------
documentsRouter.post(
  '/:id/unarchive',
  loadDocument,
  requireArchived,
  handler(async (req, res) => {
    const document = req.document!;

    // Only archivedAt is cleared. status and finalizedAt are not in this statement at all, which
    // is the strongest form the guarantee can take here.
    await prisma.$executeRaw`
      UPDATE "documents" SET "archivedAt" = NULL WHERE "id" = ${document.id}::text
    `;

    res.json({ document: serializeDocument({ ...document, archivedAt: null }) });
  }),
);
