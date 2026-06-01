/**
 * v1 trust boundary (DECISIONS.md ADR-002).
 *
 * The Forge resolver attaches two headers when calling this API:
 *   x-testforge-internal-secret  — shared secret, validated here.
 *   x-atlassian-account-id       — the user's Atlassian accountId.
 *
 * The backend trusts the forwarded accountId ONLY when the shared secret
 * matches the configured TESTFORGE_INTERNAL_SECRET. The secret is attached in
 * the resolver and never reaches the browser.
 *
 * Sprint 2 upgrade: replace this with verifying the Forge remote-invocation
 * JWT against Forge's published keys (issuer = Forge, audience = this app)
 * and read accountId from the verified claims.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { loadConfig } from '../lib/config';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual requires equal-length buffers.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireInternalAuth(req: Request, res: Response, next: NextFunction): void {
  const config = loadConfig();

  const headerSecret = req.header('x-testforge-internal-secret');
  const accountId = req.header('x-atlassian-account-id');

  if (!headerSecret || !safeEqual(headerSecret, config.internalSecret)) {
    res.status(401).json({ error: 'Unauthorized: invalid or missing internal secret' });
    return;
  }
  if (!accountId || accountId.trim() === '') {
    res.status(401).json({ error: 'Unauthorized: missing x-atlassian-account-id' });
    return;
  }

  req.accountId = accountId;
  next();
}
