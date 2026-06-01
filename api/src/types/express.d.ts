/**
 * Express Request augmentation — populated by middleware in src/middleware/.
 *
 *   accountId  — set by auth.ts after the shared-secret check.
 *   userRole   — set by authorize.ts after role lookup (defaults to OBSERVER).
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
