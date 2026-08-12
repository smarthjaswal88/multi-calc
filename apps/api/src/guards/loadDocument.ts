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
