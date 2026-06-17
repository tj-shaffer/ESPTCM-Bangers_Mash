/**
 * Role-based authorization middleware. Resolves the role for the accountId
 * populated by `requireAuth` (unknown accounts default to OBSERVER) and 403s if
 * it isn't in the allowed set.
 *
 * The single-route /api/invoke surface enforces roles via the permission map
 * instead (see repository/permissions.ts); this middleware remains for any
 * conventional per-route handlers.
 *
 *   router.post('/test-cases', requireAuth, authorize('TEST_AUTHOR', 'TEST_MANAGER', 'SUPER_ADMIN'), handler);
 */

import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { resolveRole } from '../lib/identity';

export function authorize(...allowed: Role[]) {
  return async function authorizeMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.accountId) {
      // requireAuth must run first.
      res.status(401).json({ error: 'Unauthorized: no account context' });
      return;
    }

    try {
      const role = await resolveRole(req.accountId);
      req.userRole = role;

      if (!allowed.includes(role)) {
        res.status(403).json({ error: `Forbidden: role ${role} cannot perform this action` });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
