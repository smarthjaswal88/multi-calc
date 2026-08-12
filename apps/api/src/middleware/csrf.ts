import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ForbiddenError } from '../errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export const verifyOrigin: RequestHandler = (req, _res, next) => {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const origin = req.get('origin');
  const referer = req.get('referer');

  if (!origin && !referer) {
    next();
    return;
  }

  const candidate = origin ? originOf(origin) : referer ? originOf(referer) : null;

  if (candidate && env.webOrigins.includes(candidate)) {
    next();
    return;
  }

  next(
    new ForbiddenError(
      'This request came from an origin this API does not serve.',
      [{ path: 'origin', message: 'Cross-site requests are not accepted.' }],
    ),
  );
};
