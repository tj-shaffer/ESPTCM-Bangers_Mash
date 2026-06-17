/**
 * Express Request augmentation — populated by middleware in src/middleware/.
 *
 *   accountId  — set by requireAuth after verifying the session token (the
 *                JWT subject; an Atlassian accountId, or the break-glass id).
 *   userRole   — resolved role for that accountId (defaults to OBSERVER); set
 *                by the /api/invoke handler and the authorize() middleware.
 */

import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      accountId?: string;
      userRole?: Role;
    }
  }
}

export {};
