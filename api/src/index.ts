/**
 * TestForge API — entry point.
 *
 * Composition order matters:
 *   1. loadConfig()   — env validation; throws with a list of missing vars.
 *   2. helmet + cors  — security headers and a tight origin allowlist.
 *   3. JSON parser    — bounded body size.
 *   4. /health        — anonymous, BEFORE auth middleware so probes work.
 *   5. requireInternalAuth + standardLimiter + auditMiddleware — for /api/v1.
 *   6. errorHandler   — last middleware in the chain.
 */

// Ambient Request augmentation is picked up automatically via tsconfig `include`
// (see src/types/express.d.ts) — no import needed.

import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { loadConfig } from './lib/config';
import { healthRouter } from './routes/health';
import { requireInternalAuth } from './middleware/auth';
import { standardLimiter } from './middleware/rateLimiter';
import { auditMiddleware } from './middleware/auditMiddleware';
import { errorHandler } from './middleware/errorHandler';

function buildApp(): Express {
  const config = loadConfig();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  // CORS: in development allow localhost; in production allow the Atlassian
  // tenant origin only. Never use `*`.
  const allowedOrigins =
    config.nodeEnv === 'production'
      ? [/\.atlassian\.net$/]
      : [/\.atlassian\.net$/, 'http://localhost:3000', 'http://localhost:3001'];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: false,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Public probes first.
  app.use('/', healthRouter);

  // Everything under /api/v1 requires the v1 shared-secret trust boundary
  // (DECISIONS.md ADR-002). Feature routers will mount here in later phases.
  app.use(
    '/api/v1',
    requireInternalAuth,
    standardLimiter,
    auditMiddleware,
    // Placeholder so the chain is reachable before feature routers exist.
    (_req, res) => res.json({ ok: true, message: 'TestForge API foundation online' }),
  );

  app.use(errorHandler);

  return app;
}

function main(): void {
  let app: Express;
  try {
    app = buildApp();
  } catch (err) {
    // Most commonly: missing required env vars (loadConfig).
    // eslint-disable-next-line no-console
    console.error('[boot] failed to start:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const config = loadConfig();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[boot] TestForge API listening on :${config.port} (${config.nodeEnv})`);
  });
}

main();
