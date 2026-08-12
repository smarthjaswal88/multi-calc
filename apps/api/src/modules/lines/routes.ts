import { Router, type Response } from 'express';
import { z } from 'zod';
import { isCurrencyCode, lineInputSchema } from '@multi-calc/calc';
import { prisma } from '../../db/prisma.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import { loadDocument } from '../../guards/loadDocument.js';
import { requireDraft } from '../../guards/requireDraft.js';
import { handler } from '../../http/handler.js';
import { fieldsFromZod } from '../../middleware/error.js';
import { serializeDocument } from '../../services/serialize.js';
import {
  applyOrder,
  lockDocumentAndReadLines,
  recompute,
  renumber,
  withTotals,
} from '../../services/totals.js';
import type { Document, LineItem } from '../../generated/prisma/client.js';

export const linesRouter = Router({ mergeParams: true });

const MAX_LINES_PER_DOCUMENT = 200;

interface LineFields {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  discountType: 'NONE' | 'PERCENT' | 'FIXED';
  discountPercentBp: number | null;
  discountFixedMinor: number | null;
  taxPercentBp: number | null;
}

function parseLine(body: unknown, currency: string): LineFields {
  const code = isCurrencyCode(currency) ? currency : 'USD';
  const result = lineInputSchema(code).safeParse(body);

  if (!result.success) {
    const fields = fieldsFromZod(result.error);
    throw new ValidationError(fields[0]?.message ?? 'Check the highlighted fields.', fields);
  }

  const line = result.data;

  return {
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountType: line.discountType,
    discountPercentBp: line.discountType === 'PERCENT' ? (line.discountPercentBp ?? 0) : null,
    discountFixedMinor: line.discountType === 'FIXED' ? (line.discountFixedMinor ?? 0) : null,
    taxPercentBp: line.taxPercentBp ?? null,
  };
}

function respond(res: Response, document: Document, lines: LineItem[], status = 200): void {
  res.status(status).json({ document: serializeDocument({ ...document, lines }) });
}

const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1, 'Include the line ids in their new order.'),
});

linesRouter.patch(
  '/reorder',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;
    const parsed = reorderSchema.safeParse(req.body);

    if (!parsed.success) {
      const fields = fieldsFromZod(parsed.error);
      throw new ValidationError(fields[0]?.message ?? 'Check the submitted order.', fields);
    }

    const { order } = parsed.data;

    const reordered = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);
      const existingIds = lines.map((line) => line.id);

      const isPermutation =
        order.length === existingIds.length &&
        new Set(order).size === order.length &&
        order.every((id) => existingIds.includes(id));

      if (!isPermutation) {
        const message = 'The new order must list every line on this document exactly once.';
        throw new ValidationError(message, [{ path: 'order', message }]);
      }

      await renumber(tx, order);
      return applyOrder(lines, order);
    });

    respond(res, document, reordered);
  }),
);

linesRouter.post(
  '/',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;
    const fields = parseLine(req.body, document.currency);

    const result = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);

      if (lines.length >= MAX_LINES_PER_DOCUMENT) {
        const message = `A document can hold at most ${MAX_LINES_PER_DOCUMENT} lines.`;
        throw new ValidationError(message, [{ path: 'lines', message }]);
      }

      const nextPosition = lines.reduce((max, line) => Math.max(max, line.position), 0) + 1;

      const created = await tx.lineItem.create({
        data: { documentId: document.id, position: nextPosition, ...fields },
      });
      return recompute(tx, document.id, [...lines, created]);
    });

    respond(res, withTotals(document, result.totals), result.lines, 201);
  }),
);

linesRouter.patch(
  '/:lineId',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;

    const fields = parseLine(req.body, document.currency);

    const result = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);

      if (!lines.some((line) => line.id === req.params.lineId)) {
        throw new NotFoundError('That line does not exist on this document.');
      }

      const updated = await tx.lineItem.update({ where: { id: req.params.lineId }, data: fields });
      const next = lines.map((line) => (line.id === updated.id ? updated : line));
      return recompute(tx, document.id, next);
    });

    respond(res, withTotals(document, result.totals), result.lines);
  }),
);

linesRouter.delete(
  '/:lineId',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;

    const result = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);

      if (!lines.some((line) => line.id === req.params.lineId)) {
        throw new NotFoundError('That line does not exist on this document.');
      }

      const remaining = lines
        .filter((line) => line.id !== req.params.lineId)
        .sort((a, b) => a.position - b.position);

      await tx.lineItem.delete({ where: { id: req.params.lineId } });

      await renumber(
        tx,
        remaining.map((line) => line.id),
      );

      return recompute(
        tx,
        document.id,
        remaining.map((line, index) => ({ ...line, position: index + 1 })),
      );
    });

    respond(res, withTotals(document, result.totals), result.lines);
  }),
);
