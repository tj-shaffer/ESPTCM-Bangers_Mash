/**
 * Role-based authorization. Looks up the UserRole record by the accountId
 * populated by `requireInternalAuth`; unknown accounts default to OBSERVER
 * (read-only) so the API never silently elevates an unmapped user.
 *
 * Usage:
 *   router.post('/test-cases', requireInternalAuth, authorize('TEST_AUTHOR', 'TEST_MANAGER', 'SUPER_ADMIN'), handler);
 */

import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';

export function authorize(...allowed: Role[]) {
  return async function authorizeMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.accountId) {
      // requireInternalAuth must run first.
      res.status(401).json({ error: 'Unauthorized: no account context' });
      return;
    }

    try {
      const userRole = await prisma.userRole.findUnique({
        where: { atlassianAccountId: req.accountId },
        select: { role: true },
      });
      const role: Role = userRole?.role ?? Role.OBSERVER;
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
