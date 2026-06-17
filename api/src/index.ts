/**
 * TestForge API — entry point (pilot / standalone web-app mode).
 *
 * Serves two surfaces:
 *   - locally: `npm run dev` runs this as a process listening on PORT.
 *   - on Vercel: this module's default export (the Express app) is invoked as a
 *     serverless function; `app.listen` is skipped (not run as main).
 *
 * Routes:
 *   GET  /health        — anonymous probe
 *   POST /api/login     — email + password login → JWT
 *   POST /api/invoke    — resolver-style dispatch (Bearer-gated)
 */

// Ambient Request augmentation (req.accountId) via src/types/express.d.ts.

import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { loadConfig } from './lib/config';
import { ensureBootstrapAdmin } from './lib/identity';
import { healthRouter } from './routes/health';
import { apiRouter } from './routes/invoke';
import { standardLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

function buildApp(): Express {
  const config = loadConfig();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  // Frontend + API are same-origin in production (Vercel). For local dev the
  // Vite app on :3000 calls the API cross-origin; auth is a Bearer token (no
  // cookies), so reflecting the origin is sufficient.
  app.use(cors({ origin: true, credentials: false }));

  // 12mb accommodates base64-encoded screenshot uploads (~8mb raw) on the
  // single JSON invoke channel. See ENHANCEMENTS #6.
  app.use(express.json({ limit: '12mb' }));

  app.use('/', healthRouter);

  // OAuth login routes (public) — only mounted when Atlassian OAuth is
  // configured; otherwise the shared-password gate handles login.
  if (oauthConfigured()) {
    app.use('/api/auth', standardLimiter, authRouter);
  }

  // Login is public; /invoke is gated inside the router. A rate limiter guards
  // the whole surface against brute-forcing the password.
  app.use('/api', standardLimiter, apiRouter);

  app.use(errorHandler);

  return app;
}

const app = buildApp();
export default app;

if (require.main === module) {
  const { port, nodeEnv } = loadConfig();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[boot] TestForge API listening on :${port} (${nodeEnv})`);
  });
}
