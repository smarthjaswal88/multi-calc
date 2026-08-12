/**
 * The immutability rule, enforced in one place.
 *
 * Applied as middleware to every mutating route rather than repeated as a conditional inside
 * each handler — a rule expressed in a dozen places is a rule that will eventually be omitted
 * from the thirteenth.
 *
 * A finalized document is a closed record. The 409 is what the interface turns into "This
 * document is finalized and can't be edited," with a Refresh action: the realistic cause is a
 * stale browser tab whose document was finalized somewhere else.
 */

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
