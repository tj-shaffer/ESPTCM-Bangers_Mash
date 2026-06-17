/**
 * Pilot API routes:
 *   POST /api/login   { email, password } -> { token, mustChangePassword }
 *   POST /api/invoke  { key, payload }     -> dispatch result   (requires Bearer)
 *
 * /api/invoke mirrors the Forge resolver: the frontend's invokeResolver(key,
 * payload) maps 1:1 onto this endpoint. Roles are enforced here, per invoke
 * key, against the PERMISSIONS map before the call reaches dispatch.
 */

import { Router, type Request, type Response } from 'express';
import { issueToken } from '../lib/auth';
import { authenticate, resolveRole } from '../lib/identity';
import { canInvoke } from '../repository/permissions';
import { requireAuth } from '../middleware/requireAuth';
import { getStore } from '../repository/prismaStore';
import { dispatch, DispatchError } from '../repository/dispatch';

export const apiRouter = Router();

apiRouter.post('/login', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  const user = await authenticate(body.email, body.password);
  if (!user) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }
  res.json({
    token: issueToken(user.accountId, user.displayName),
    mustChangePassword: user.mustChangePassword,
  });
});

apiRouter.post('/invoke', requireAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { key?: unknown; payload?: unknown };
  if (typeof body.key !== 'string') {
    res.status(400).json({ error: '`key` is required' });
    return;
  }
  const accountId = req.accountId ?? 'pilot-user';
  const role = await resolveRole(accountId);
  req.userRole = role;

  if (!canInvoke(body.key, role)) {
    res.status(403).json({ error: `Forbidden: role ${role} cannot perform this action` });
    return;
  }

  const payload = (body.payload ?? {}) as Record<string, unknown>;
  try {
    const result = await dispatch(getStore(), body.key, payload, accountId, role);
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
