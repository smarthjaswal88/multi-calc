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

  app.use(
    cors({
      origin: env.webOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  app.use(verifyOrigin);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: env.NODE_ENV });
  });

  app.use('/api/auth', authRouter);

  app.use('/api/documents', requireAuth, documentsRouter);
  app.use('/api/documents/:documentId/lines', requireAuth, linesRouter);
  app.use('/api/reports', requireAuth, reportsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
