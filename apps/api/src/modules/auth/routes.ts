import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { credentialsSchema, DEFAULT_CURRENCY, isCurrencyCode } from '@multi-calc/calc';
import { prisma } from '../../db/prisma.js';
import { ConflictError, UnauthenticatedError } from '../../errors.js';
import { handler } from '../../http/handler.js';
import { clearSession, issueSession, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

/** Cost 12: slow enough to matter against offline cracking, fast enough for a login request. */
const BCRYPT_COST = 12;

/**
 * A REAL bcrypt hash, computed once at module load, compared against when no user matches.
 *
 * This closes a measured timing oracle. The obvious approach — a hand-written placeholder string
 * like `'$2a$12$invalidinvalid…'` — does not work, and fails in a way that is invisible by
 * inspection: bcryptjs first checks the hash's structure, and a string that is not exactly 60
 * characters is rejected before any key derivation runs. So the comparison returns false
 * *instantly*.
 *
 * Measured on this machine before the fix:
 *
 *     known email   (against a real 60-char hash) : 222.7 ms
 *     unknown email (against a 66-char literal)   :   0.0 ms
 *
 * That is a reliable oracle for whether any given address is registered — full user enumeration,
 * from a single request each, no rate limit required. After the fix both paths measure ~219 ms.
 *
 * `hashSync` is acceptable here specifically because it runs once at import, before the server
 * accepts connections, so it blocks nothing that is serving traffic.
 */
const ABSENT_USER_HASH = bcrypt.hashSync('this password matches nothing', BCRYPT_COST);

export const authRouter = Router();

authRouter.post(
  '/signup',
  validate(credentialsSchema),
  handler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      /**
       * ACCEPTED TRADEOFF: this response confirms the address is registered.
       *
       * Login was hardened against enumeration — one message for both failures, and equal timing —
       * but signup still answers the same question one endpoint over, so an attacker can enumerate
       * here instead. That is stated rather than quietly ignored.
       *
       * Closing it properly requires email: respond generically, and send a "you already have an
       * account" message out of band. With no mail infrastructure, a generic response would leave a
       * real user stuck with no idea why signup failed and no route forward — a worse product for a
       * concrete privacy gain against an attacker who can already learn the same fact from a
       * password-reset flow in most applications.
       *
       * The login fix is still worth having: login is the endpoint that can be hammered without
       * side effects, and equal timing there removes an oracle that needed no error message at all.
       * Recorded in the README's security section and in the pre-production list.
       */
      throw new ConflictError('That email address is already registered.', [
        { path: 'email', message: 'That email address is already registered.' },
      ]);
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, BCRYPT_COST),
        defaultCurrency: DEFAULT_CURRENCY,
      },
    });

    issueSession(res, user);
    res.status(201).json({ user: { id: user.id, email: user.email, defaultCurrency: user.defaultCurrency } });
  }),
);

authRouter.post(
  '/login',
  validate(credentialsSchema),
  handler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await prisma.user.findUnique({ where: { email } });

    // One message for an unknown address and a wrong password alike, so the endpoint does not
    // reveal which addresses are registered — and the comparison always runs against a real
    // 60-character hash, so the two paths take the same time. See ABSENT_USER_HASH: a placeholder
    // of the wrong length short-circuits bcrypt entirely and turns this into a 0ms-vs-220ms
    // enumeration oracle.
    const hash = user?.passwordHash ?? ABSENT_USER_HASH;
    const matches = await bcrypt.compare(password, hash);

    if (!user || !matches) {
      throw new UnauthenticatedError('Email or password is incorrect.');
    }

    issueSession(res, user);
    res.json({ user: { id: user.id, email: user.email, defaultCurrency: user.defaultCurrency } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    if (!user) {
      // The token verified but the row is gone. Clear the cookie so the client stops retrying.
      clearSession(res);
      throw new UnauthenticatedError('Sign in to continue.');
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        defaultCurrency: isCurrencyCode(user.defaultCurrency)
          ? user.defaultCurrency
          : DEFAULT_CURRENCY,
      },
    });
  }),
);
