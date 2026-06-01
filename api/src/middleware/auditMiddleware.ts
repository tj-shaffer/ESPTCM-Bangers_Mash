/**
 * Audit log writer.
 *
 * NOTE (v1 limitation, per DECISIONS.md follow-up): a fire-and-forget
 * post-response middleware cannot populate `before` (the entity's prior state).
 * In v1 this middleware records only the action + actor + URL; real before/after
 * diffs are written from inside route handlers via `writeAuditEntry()` once the
 * service layer has both reads in hand. Sprint 2 hardens this end-to-end.
 */

import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }

  res.on('finish', () => {
    // Fire-and-forget. Failures must not impact the response.
    void prisma.auditLog
      .create({
        data: {
          actorAccountId: req.accountId ?? 'anonymous',
          action: `${req.method} ${req.originalUrl}`,
          entityType: 'request',
          entityId: 'n/a',
          ipAddress: req.ip ?? null,
        },
      })
      .catch((err: unknown) => {
        console.error('[audit] failed to write entry', err);
      });
  });

  next();
}

/**
 * Service-layer helper for proper before/after audit entries. Call from inside
 * a route handler that has already read the prior entity state.
 */
export async function writeAuditEntry(input: {
  actorAccountId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorAccountId: input.actorAccountId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? undefined) as never,
      after: (input.after ?? undefined) as never,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
