/**
 * The mirror of requireDraft.
 *
 * WHY THIS EXISTS AS ITS OWN GUARD, AND MUST NOT BE FOLDED INTO requireDraft
 * -------------------------------------------------------------------------
 * requireDraft rejects every mutation on a finalized document — that is the whole expression of
 * immutability in this service. Archiving is the one mutation that is valid on *precisely* a
 * finalized document, so it cannot sit behind that guard.
 *
 * A reader who notices that the archive route lacks requireDraft and "fixes" the omission will
 * break the feature outright: every archive request would 409. Hence a named guard rather than an
 * inline conditional, so the absence of requireDraft on that route reads as deliberate.
 *
 * Archiving is also not an edit in the sense the specification cares about. It changes no line, no
 * amount, and no metadata — only whether the document appears in the working list. The frozen
 * figures stay exactly as finalize left them.
 */

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

/** Rejects a document that is already archived, so archive is not a silent overwrite. */
export const requireNotArchived: RequestHandler = (req, _res, next) => {
  if (req.document?.archivedAt) {
    next(new ConflictError('This document is already archived.'));
    return;
  }
  next();
};

/** Rejects a document that is not archived, so restore has something to do. */
export const requireArchived: RequestHandler = (req, _res, next) => {
  if (!req.document?.archivedAt) {
    next(new ConflictError('This document is not archived.'));
    return;
  }
  next();
};
