/**
 * Per-user rate limits. Keyed on accountId so usage limits don't get shared
 * across users from the same Forge egress IP.
 *
 * In-memory store is sufficient for v1 single-instance App Service. If we
 * scale out, swap to a Redis-backed store.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

const keyByAccount = (req: Request): string => req.accountId ?? req.ip ?? 'anonymous';

const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByAccount,
};

/** Default per-user budget for normal CRUD endpoints. */
export const standardLimiter = rateLimit({
  ...baseOptions,
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 200,
  message: { error: 'Too many requests — please retry in a moment.' },
});

/** Tighter limit for Claude-backed routes. */
export const aiRateLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  message: { error: 'AI rate limit reached — please retry later.' },
});

/** Strictest: vendor impact (re-)analysis can fan out across many test cases. */
export const vendorAnalyzeLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: 'Vendor impact analysis is limited to 5/hour per user.' },
});
