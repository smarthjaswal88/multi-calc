import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { credentialsSchema, DEFAULT_CURRENCY, isCurrencyCode } from '@multi-calc/calc';
import { prisma } from '../../db/prisma.js';
import { ConflictError, UnauthenticatedError } from '../../errors.js';
import { handler } from '../../http/handler.js';
import { clearSession, issueSession, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

const BCRYPT_COST = 12;

const ABSENT_USER_HASH = bcrypt.hashSync('this password matches nothing', BCRYPT_COST);

export const authRouter = Router();

authRouter.post(
  '/signup',
  validate(credentialsSchema),
  handler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
