import type { Document, LineItem } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;

      document?: Document & { lines: LineItem[] };
    }
  }
}

export {};
