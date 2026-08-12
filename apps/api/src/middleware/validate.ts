import type { Request, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors.js';
import { fieldsFromZod } from './error.js';

type Source = 'body' | 'query' | 'params';

/**
 * Where a validated payload is stashed for handlers to read.
 *
 * Handlers read `req.validated.query` rather than `req.query`, because assigning to `req.query`
 * does not survive an Express upgrade: in Express 5 it is a getter with no setter, so the write is
 * silently dropped and every handler downstream sees raw, unparsed strings — coercions gone,
 * defaults gone, a `"false"` that is suddenly truthy again. Writing to our own property means the
 * parsed value is where we put it regardless of framework version.
 */
export interface ValidatedRequest extends Request {
  validated: Partial<Record<Source, unknown>>;
}

/**
 * Validate part of a request against a schema and stash the parsed result.
 *
 * Keeping the parsed value matters as much as the check: it carries Zod's coercions and defaults,
 * so downstream handlers work with normalised data — a trimmed, lower-cased email, an
 * `includeDrafts` that is a real boolean, a date string proven to be a real calendar date.
 *
 * The parsed value is ALSO written back onto the request where the framework permits it, so the
 * existing handlers that read `req.query` directly keep working on Express 4. The write is
 * best-effort: on Express 5 `req.query` is a getter with no setter, and the assignment is skipped
 * rather than throwing. Handlers migrated to `validated(req, 'query')` are correct on both.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fields = fieldsFromZod(result.error);
      next(new ValidationError(fields[0]?.message ?? 'Check the highlighted fields.', fields));
      return;
    }

    const validatedReq = req as ValidatedRequest;
    validatedReq.validated ??= {};
    validatedReq.validated[source] = result.data;

    try {
      req[source] = result.data as never;
    } catch {
      // Express 5 exposes req.query as a getter. The stash above is the durable copy; handlers
      // reading req.query directly are the ones an upgrade would break, which is why `validated`
      // exists.
    }

    next();
  };
}

/**
 * Read a validated payload, falling back to the raw property.
 *
 * The fallback exists so a route that forgot its validate() middleware degrades to today's
 * behaviour rather than reading undefined and throwing.
 */
export function validated<T>(req: Request, source: Source = 'body'): T {
  const stashed = (req as ValidatedRequest).validated?.[source];
  return (stashed ?? req[source]) as T;
}
