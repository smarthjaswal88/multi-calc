import type { CookieOptions, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthenticatedError } from '../errors.js';

export const SESSION_COOKIE = 'mc_session';

interface SessionClaims {
  sub: string;
  email: string;
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,

    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: env.SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function issueSession(res: Response, user: { id: string; email: string }): void {
  const token = jwt.sign({ sub: user.id, email: user.email } satisfies SessionClaims, env.JWT_SECRET, {
    expiresIn: `${env.SESSION_DAYS}d`,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;

  if (!token) {
    next(new UnauthenticatedError());
    return;
  }

  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as SessionClaims;
    req.userId = claims.sub;
    req.userEmail = claims.email;
    next();
  } catch {
    next(new UnauthenticatedError('Your session has expired. Sign in again.'));
  }
};
