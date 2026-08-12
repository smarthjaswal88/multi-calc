import type { Document, LineItem } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every authenticated route. */
      userId?: string;
      userEmail?: string;
      /**
       * Set by loadDocument. Already scoped to the authenticated user, so a handler that has
       * this can never be looking at somebody else's document.
       */
      document?: Document & { lines: LineItem[] };
    }
  }
}

export {};
