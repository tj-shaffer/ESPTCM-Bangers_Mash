/**
 * Pilot API routes:
 *   POST /api/login   { password }        -> { token }
 *   POST /api/invoke  { key, payload }     -> dispatch result   (requires Bearer)
 *
 * /api/invoke mirrors the Forge resolver: the frontend's invokeResolver(key,
 * payload) maps 1:1 onto this endpoint.
 */

import { Router, type Request, type Response } from 'express';
import { issueToken, passwordMatches } from '../lib/auth';
import { requireAuth } from '../middleware/requireAuth';
import { getStore } from '../repository/prismaStore';
import { dispatch, DispatchError } from '../repository/dispatch';

export const apiRouter = Router();

apiRouter.post('/login', (req: Request, res: Response) => {
  const password = (req.body as { password?: unknown })?.password;
  if (typeof password !== 'string' || !passwordMatches(password)) {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }
  res.json({ token: issueToken() });
});

apiRouter.post('/invoke', requireAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { key?: unknown; payload?: unknown };
  if (typeof body.key !== 'string') {
    res.status(400).json({ error: '`key` is required' });
    return;
  }
  const payload = (body.payload ?? {}) as Record<string, unknown>;
  try {
    const result = await dispatch(getStore(), body.key, payload, req.accountId ?? 'pilot-user');
    res.json(result ?? null);
  } catch (err) {
    if (err instanceof DispatchError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[invoke] error', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
