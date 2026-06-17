/**
 * Identity ↔ role plumbing — the provider-agnostic seam.
 *
 * Whatever proves who a user is (Atlassian OAuth today, Azure/Entra OIDC later)
 * converges on `upsertUserRole`: record the user and resolve their role. Every
 * authorization decision then flows through `resolveRole`. Keeping both here
 * means the identity provider can change without touching the role model, the
 * permission map, or the UI.
 */

import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { loadConfig } from './config';

/**
 * Look up a user's role by accountId. Unknown accounts default to OBSERVER
 * (read-only) so the API never silently elevates an unmapped user. accountIds
 * in SUPER_ADMIN_ACCOUNT_IDS always resolve to SUPER_ADMIN as a safety net even
 * if the row is missing or stale.
 */
export async function resolveRole(accountId: string): Promise<Role> {
  if (loadConfig().superAdminAccountIds.includes(accountId)) return Role.SUPER_ADMIN;
  const row = await prisma.userRole.findUnique({
    where: { atlassianAccountId: accountId },
    select: { role: true },
  });
  return row?.role ?? Role.OBSERVER;
}

export interface ResolvedIdentity {
  accountId: string;
  displayName: string;
  email: string | null;
}

/**
 * Upsert a freshly-authenticated user into UserRole and return their role.
 * Existing rows keep their assigned role (only profile fields refresh); a brand
 * new account is created as OBSERVER, or SUPER_ADMIN if it is in the seed list.
 */
export async function upsertUserRole(identity: ResolvedIdentity): Promise<Role> {
  const isSeededAdmin = loadConfig().superAdminAccountIds.includes(identity.accountId);
  const row = await prisma.userRole.upsert({
    where: { atlassianAccountId: identity.accountId },
    update: {
      displayName: identity.displayName,
      email: identity.email,
      // Repair seeded admins on every login; otherwise leave the assigned role.
      ...(isSeededAdmin ? { role: Role.SUPER_ADMIN } : {}),
    },
    create: {
      atlassianAccountId: identity.accountId,
      displayName: identity.displayName,
      email: identity.email,
      role: isSeededAdmin ? Role.SUPER_ADMIN : Role.OBSERVER,
    },
    select: { role: true },
  });
  return row.role;
}
