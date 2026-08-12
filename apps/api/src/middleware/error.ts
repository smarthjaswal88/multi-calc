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

function isPrismaKnownError(error: unknown): error is { code: string; meta?: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^P\d{4}$/.test((error as { code: string }).code)
  );
}

export function fieldsFromZod(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No route for ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
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

  if (error instanceof MoneyParseError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    } satisfies ErrorBody);
    return;
  }

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

  console.error('Unhandled error:', error);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Try again.',
      ...(env.isProduction ? {} : { fields: [{ path: '', message: String(error) }] }),
    },
  } satisfies ErrorBody);
};
