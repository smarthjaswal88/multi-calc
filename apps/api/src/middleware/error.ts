/**
 * The single error response shape, and the only place that decides a status code.
 */

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { MoneyParseError } from '@multi-calc/calc';
import { AppError, NotFoundError, type FieldError } from '../errors.js';
import { env } from '../config/env.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: FieldError[];
  };
}

/**
 * Recognise a Prisma known-request error without importing the Prisma namespace here.
 *
 * A structural check rather than `instanceof`: the generated client lives outside this module's
 * import graph, and matching on the shape avoids coupling the error middleware to it.
 */
function isPrismaKnownError(error: unknown): error is { code: string; meta?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}

/** Flatten a Zod error into the envelope's field list, preserving nesting as a dotted path. */
export function fieldsFromZod(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/** Anything unrecognised past the last route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // A schema rejection that reached here rather than being caught by validate().
  if (error instanceof ZodError) {
    const fields = fieldsFromZod(error);
    const body: ErrorBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: fields[0]?.message ?? 'Check the highlighted fields.',
        fields,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Thrown by the calc package when a typed amount cannot be read.
  if (error instanceof MoneyParseError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    } satisfies ErrorBody);
    return;
  }

  // Prisma's own errors, mapped rather than falling through to a 500.
  //
  // The domain-constraints migration's header claims these rules are enforced "through any path
  // into the database" — but a violation raised by Postgres arrived here unrecognised and became
  // an opaque 500. A unique-position collision on concurrent inserts is now serialised by the
  // FOR UPDATE in services/totals.ts, so P2002 should be unreachable through the API; it is mapped
  // anyway, because "should be unreachable" is not "is".
  if (isPrismaKnownError(error)) {
    if (error.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'That change conflicts with a concurrent edit. Try again.',
        },
      } satisfies ErrorBody);
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'That record no longer exists.' },
      } satisfies ErrorBody);
      return;
    }
  }

  if (error instanceof AppError) {
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields.length > 0 ? { fields: error.fields } : {}),
      },
    };
    res.status(error.status).json(body);
    return;
  }

  // Anything else is a fault on our side. Log it in full; return nothing that describes the
  // internals to the caller.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Try again.',
      ...(env.isProduction ? {} : { fields: [{ path: '', message: String(error) }] }),
    },
  } satisfies ErrorBody);
};
