import type { Request, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors.js';
import { fieldsFromZod } from './error.js';

type Source = 'body' | 'query' | 'params';

export interface ValidatedRequest extends Request {
  validated: Partial<Record<Source, unknown>>;
}

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
    }

    next();
  };
}

export function validated<T>(req: Request, source: Source = 'body'): T {
  const stashed = (req as ValidatedRequest).validated?.[source];
  return (stashed ?? req[source]) as T;
}
