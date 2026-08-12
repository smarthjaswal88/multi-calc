import type { RequestHandler } from 'express';
import { ConflictError } from '../errors.js';

export const requireFinalized: RequestHandler = (req, _res, next) => {
  const document = req.document;

  if (!document) {
    next(new Error('requireFinalized used without loadDocument'));
    return;
  }

  if (document.status !== 'FINALIZED') {
    next(
      new ConflictError('Only a finalized document can be archived.', [
        {
          path: 'status',
          message: 'Finalize this document first, or delete it if you no longer need it.',
        },
      ]),
    );
    return;
  }

  next();
};

export const requireNotArchived: RequestHandler = (req, _res, next) => {
  if (req.document?.archivedAt) {
    next(new ConflictError('This document is already archived.'));
    return;
  }
  next();
};

export const requireArchived: RequestHandler = (req, _res, next) => {
  if (!req.document?.archivedAt) {
    next(new ConflictError('This document is not archived.'));
    return;
  }
  next();
};
