/**
 * Cross-site request forgery protection, by Origin verification.
 *
 * WHAT WAS WRONG
 * --------------
 * The session is a cookie, and in production it is set `SameSite=None` because the web app and the
 * API are deployed on different domains. The auth middleware's docstring claimed CSRF was
 * "addressed by SameSite plus an exact-origin CORS policy". Both halves were false:
 *
 *   - `SameSite=None` is the value that explicitly *permits* the cookie on cross-site requests. It
 *     provides no CSRF protection whatsoever; `Lax` or `Strict` would, which is why the
 *     development configuration was accidentally safer than production.
 *
 *   - CORS does not prevent a cross-site request. It governs whether the *response* may be read.
 *     A form on an attacker's page can POST to this API, the browser will attach the victim's
 *     cookie, and the request will execute. The attacker never needs to see the reply.
 *
 * Every mutation that needs no request body was therefore triggerable from any website:
 * `/finalize`, `/archive`, `/unarchive`, `/auth/logout`. Finalizing someone's draft is
 * irreversible — the document becomes immutable — so this was a real, destructive hole.
 *
 * WHY ORIGIN VERIFICATION IS SUFFICIENT
 * -------------------------------------
 * Browsers set `Origin` on every cross-origin state-changing request, including the simple form
 * POSTs that need no preflight — that has been true across all major browsers for years. An
 * attacker's page cannot forge or suppress the header: it is set by the browser, and `fetch`
 * rejects any attempt to override it. So comparing `Origin` against the configured allowlist
 * rejects exactly the requests CORS was mistakenly believed to stop.
 *
 * WHY A MISSING HEADER IS ALLOWED
 * -------------------------------
 * If neither `Origin` nor `Referer` is present, the request passes. That looks like a hole and is
 * not, because CSRF requires *a browser* to attach the victim's cookie. A caller that sends
 * neither header is not a browser — it is curl, a server, or this repository's own end-to-end
 * suite, which uses Node's fetch — and such a caller has no victim session to abuse. It must
 * supply credentials of its own, at which point it is not forgery.
 *
 * Rejecting instead would break every non-browser client and the 110-check verification suite,
 * while adding no security.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a synchroniser-token or double-submit-cookie scheme. Those defend additionally against an
 * attacker who can forge headers, which requires XSS on an allowed origin — and an attacker with
 * XSS on the web app has better options than CSRF. Origin verification is the proportionate
 * control here, and it is what the SameSite=None cookie actually needs.
 */

import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ForbiddenError } from '../errors.js';

/** Methods that can change state, and therefore need protecting. */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Reduce a URL to scheme://host[:port], the form `env.webOrigins` holds. */
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

  // Neither header: not a browser, so no victim cookie to forge with. See the note above.
  if (!origin && !referer) {
    next();
    return;
  }

  // `Origin` is authoritative when present. `Referer` is the fallback for the rare browser
  // configuration that suppresses Origin while still sending Referer.
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
