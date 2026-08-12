/**
 * Load the document named in the route, scoped to the authenticated user.
 *
 * This is the ownership guard. Scoping happens in the `where` clause rather than as a check
 * after retrieval, so there is no window in which a handler holds another user's row. A
 * document that does not exist and a document owned by somebody else produce the same 404 —
 * a 403 would confirm the identifier is real.
 */

import type { RequestHandler } from 'express';
import { prisma } from '../db/prisma.js';
import { NotFoundError } from '../errors.js';
import { handler } from '../http/handler.js';

export const loadDocument: RequestHandler = handler(async (req, _res, next) => {
  const id = req.params.id ?? req.params.documentId;

  const document = await prisma.document.findFirst({
    where: { id, userId: req.userId },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  if (!document) {
    throw new NotFoundError('That document does not exist.');
  }

  req.document = document;
  next();
});
