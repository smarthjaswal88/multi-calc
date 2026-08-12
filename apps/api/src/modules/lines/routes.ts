/**
 * Line item routes.
 *
 * Mounted under /documents/:documentId, so every route here runs behind loadDocument (the
 * ownership guard) and requireDraft (the immutability guard).
 *
 * Line validation is the one schema that cannot be applied as static middleware: the
 * over-large-fixed-discount message names the line's subtotal in the document's currency, so the
 * schema has to be constructed after the document is known.
 *
 * Each route composes its response from values already in hand — loadDocument supplied the
 * existing rows, and recompute returns the new figures — so no route reads the document back
 * after writing it.
 */

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

/** A document cannot grow without bound: its totals must stay inside the storage ceiling. */
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

/**
 * Validate a line against the document's currency, throwing the standard envelope on failure.
 *
 * Normalises the discount shape as well: whichever field does not match the selected type is
 * forced to null, so a row can never carry a stale value left over from a previous selection —
 * exactly the state the database's discount-shape constraint refuses to store.
 */
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

// ---------------------------------------------------------------------------------------
// PATCH /documents/:documentId/lines/reorder
//
// Declared before the /:lineId routes. Express matches in declaration order, so the parameter
// route would otherwise capture this path with lineId = "reorder".
//
// Reordering changes no amount, so this route renumbers and returns — it does not recompute.
// ---------------------------------------------------------------------------------------
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

      // The new order must be a permutation of exactly the current lines, checked against the
      // locked set rather than the snapshot — otherwise a line added concurrently would be
      // dropped from the ordering, or a deleted one would be renumbered.
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

// ---------------------------------------------------------------------------------------
// POST /documents/:documentId/lines
// ---------------------------------------------------------------------------------------
linesRouter.post(
  '/',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;
    const fields = parseLine(req.body, document.currency);

    const result = await prisma.$transaction(async (tx) => {
      // The authoritative line set, read under an exclusive lock. req.document.lines is a
      // pre-transaction snapshot and must not be used to compute anything persisted.
      const lines = await lockDocumentAndReadLines(tx, document.id);

      if (lines.length >= MAX_LINES_PER_DOCUMENT) {
        const message = `A document can hold at most ${MAX_LINES_PER_DOCUMENT} lines.`;
        throw new ValidationError(message, [{ path: 'lines', message }]);
      }

      // Computed under the lock, so two concurrent inserts cannot pick the same position and
      // collide on the unique (documentId, position) index.
      const nextPosition = lines.reduce((max, line) => Math.max(max, line.position), 0) + 1;

      const created = await tx.lineItem.create({
        data: { documentId: document.id, position: nextPosition, ...fields },
      });
      return recompute(tx, document.id, [...lines, created]);
    });

    respond(res, withTotals(document, result.totals), result.lines, 201);
  }),
);

// ---------------------------------------------------------------------------------------
// PATCH /documents/:documentId/lines/:lineId
// ---------------------------------------------------------------------------------------
linesRouter.patch(
  '/:lineId',
  loadDocument,
  requireDraft,
  handler(async (req, res) => {
    const document = req.document!;

    // A full replacement of the editable fields rather than a partial merge. The discount fields
    // are interdependent — type, percent, and fixed amount only mean anything together — so
    // merging a subset invites a combination the caller never asked for.
    const fields = parseLine(req.body, document.currency);

    const result = await prisma.$transaction(async (tx) => {
      const lines = await lockDocumentAndReadLines(tx, document.id);

      // Existence is re-checked inside the lock: the row may have been deleted between
      // loadDocument and here.
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

// ---------------------------------------------------------------------------------------
// DELETE /documents/:documentId/lines/:lineId
// ---------------------------------------------------------------------------------------
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

      // Close the gap so positions stay 1..n. A hole is legal in the schema but shows up as a
      // wrong line number in the interface and on the printed document.
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
