/**
 * Pilot API routes:
 *   POST /api/login   { password }        -> { token }   (break-glass)
 *   POST /api/invoke  { key, payload }     -> dispatch result   (requires Bearer)
 *
 * /api/invoke mirrors the Forge resolver: the frontend's invokeResolver(key,
 * payload) maps 1:1 onto this endpoint. Roles are enforced here, per invoke
 * key, against the PERMISSIONS map before the call reaches dispatch.
 */

import { Router, type Request, type Response } from 'express';
import { issueToken, passwordMatches } from '../lib/auth';
import { loadConfig } from '../lib/config';
import { resolveRole } from '../lib/identity';
import { canInvoke } from '../repository/permissions';
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
  // Break-glass: log in as the first configured super admin so the session has
  // full access; falls back to an unmapped id (resolves to OBSERVER) if none.
  const accountId = loadConfig().superAdminAccountIds[0] ?? 'pilot-user';
  res.json({ token: issueToken(accountId, 'Break-glass admin') });
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
