/**
 * Session handling: a JWT carried in an httpOnly cookie.
 *
 * Not localStorage. A token readable by JavaScript is exfiltrable by any successful XSS; an
 * httpOnly cookie is not. The trade is CSRF exposure.
 *
 * CSRF is handled by the Origin check in middleware/csrf.ts — NOT by SameSite, and NOT by CORS.
 * Both of those were claimed here previously and neither is true in production:
 *
 *   - the cookie is `SameSite=None` in production, because the web app and API sit on different
 *     domains. That is the setting which explicitly permits cross-site sending; it protects
 *     nothing. (In development the cookie is `Lax`, which does — so development was accidentally
 *     safer than production.)
 *   - CORS governs whether a response may be *read*, not whether a request is *sent*. A form on
 *     any website could POST here with the victim's cookie attached and the request would run.
 */

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
    // Cross-site in production, where the web app and API sit on different domains. In
    // development both run on localhost, which counts as same-site regardless of port.
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

/** Rejects the request unless a valid session cookie is present. Attaches `req.userId`. */
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
    // Expired or tampered. Same response either way — the client's move is to sign in again.
    next(new UnauthenticatedError('Your session has expired. Sign in again.'));
  }
};
