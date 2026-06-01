/**
 * GET /health
 *
 * Cheap liveness + DB connectivity check. Used by Azure App Service health
 * monitoring and by humans during local dev to confirm the API is up before
 * `forge tunnel` connects.
 *
 * Intentionally NOT behind requireInternalAuth — the App Service health probe
 * is anonymous.
 */

import { Router } from 'express';
import { prisma } from '../db/prisma';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  let dbStatus: 'connected' | 'error' = 'connected';
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (err) {
    dbStatus = 'error';
    // eslint-disable-next-line no-console
    console.error('[health] db check failed', err);
  }

  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});
