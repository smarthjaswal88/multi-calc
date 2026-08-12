import type { RequestHandler } from 'express';
import { ConflictError } from '../errors.js';

export const requireDraft: RequestHandler = (req, _res, next) => {
  const document = req.document;

  if (!document) {
    next(new Error('requireDraft used without loadDocument'));
    return;
  }

  if (document.status === 'FINALIZED') {
    next(
      new ConflictError('This document is finalized and can no longer be edited.', [
        { path: 'status', message: 'Finalized documents are read-only.' },
      ]),
    );
    return;
  }

  next();
};
