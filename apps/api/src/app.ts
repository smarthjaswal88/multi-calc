import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { verifyOrigin } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './modules/auth/routes.js';
import { documentsRouter } from './modules/documents/routes.js';
import { linesRouter } from './modules/lines/routes.js';
import { reportsRouter } from './modules/reports/routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  // An exact origin allowlist, not a wildcard. Credentialed requests require it, and the
  // session cookie is the reason CORS is configured at all.
  app.use(
    cors({
      origin: env.webOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // Capped so a large body cannot be used to exhaust memory. A 200-line document is a few tens
  // of kilobytes.
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // After cookieParser and before every router, so it covers all mutations including
  // /api/auth/logout. CORS does NOT stop a cross-site form POST — it only blocks reading the
  // response — so this is what actually protects the SameSite=None session cookie. See csrf.ts.
  app.use(verifyOrigin);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });

  app.use('/api/auth', authRouter);

  // Everything below requires a session. Mounting requireAuth on the router rather than on
  // each route means a new endpoint is authenticated by default.
  app.use('/api/documents', requireAuth, documentsRouter);
  app.use('/api/documents/:documentId/lines', requireAuth, linesRouter);
  app.use('/api/reports', requireAuth, reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
