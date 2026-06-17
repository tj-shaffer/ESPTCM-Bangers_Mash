/**
 * Identity ↔ role plumbing — the provider-agnostic seam.
 *
 * App-managed email + password accounts live in UserRole. Every authorization
 * decision flows through `resolveRole`; account lifecycle (create, set/reset
 * password, self-change) lives here too. Keeping it all behind this seam means
 * the identity provider can change (Azure/Entra SSO later) without touching the
 * role model, the permission map, or the UI.
 */

import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { loadConfig } from './config';
import { hashPassword, verifyPassword } from './password';

/**
 * Look up a user's role by accountId. Unknown accounts default to OBSERVER
 * (read-only) so the API never silently elevates an unmapped user.
 */
export async function resolveRole(accountId: string): Promise<Role> {
  const row = await prisma.userRole.findUnique({
    where: { atlassianAccountId: accountId },
    select: { role: true },
  });
  return row?.role ?? Role.OBSERVER;
}

export interface AuthedUser {
  accountId: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

/** Verify email + password; returns the user on success, null otherwise. */
export async function authenticate(email: string, password: string): Promise<AuthedUser | null> {
  const row = await prisma.userRole.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  return {
    accountId: row.atlassianAccountId,
    displayName: row.displayName,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
  };
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  role: Role;
  password: string;
}

/** Admin-provisioned account creation. Throws if the email already exists. */
export async function createUser(input: CreateUserInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.userRole.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error('A user with that email already exists');
  return prisma.userRole.create({
    data: {
      atlassianAccountId: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      role: input.role,
      passwordHash: hashPassword(input.password),
      // New accounts get a temp password and must change it on first login.
      mustChangePassword: true,
    },
    select: { atlassianAccountId: true, displayName: true, email: true, role: true },
  });
}

/** Admin reset: set a new (temporary) password and force a change on next login. */
export async function setUserPassword(accountId: string, password: string) {
  const row = await prisma.userRole.findUnique({
    where: { atlassianAccountId: accountId },
    select: { id: true },
  });
  if (!row) return null;
  return prisma.userRole.update({
    where: { atlassianAccountId: accountId },
    data: { passwordHash: hashPassword(password), mustChangePassword: true },
    select: { atlassianAccountId: true, email: true },
  });
}

/** Self-service password change: verifies the current password first. */
export async function changeOwnPassword(
  accountId: string,
  current: string,
  next: string,
): Promise<{ ok: boolean; reason?: string }> {
  const row = await prisma.userRole.findUnique({ where: { atlassianAccountId: accountId } });
  if (!row) return { ok: false, reason: 'Account not found' };
  if (!verifyPassword(current, row.passwordHash)) {
    return { ok: false, reason: 'Current password is incorrect' };
  }
  await prisma.userRole.update({
    where: { atlassianAccountId: accountId },
    data: { passwordHash: hashPassword(next), mustChangePassword: false },
  });
  return { ok: true };
}

/**
 * Idempotently seed the first SUPER_ADMIN from BOOTSTRAP_ADMIN_* so the role
 * panel is reachable on a fresh database. Safe to call on every (cold) boot:
 * creates the row if absent (and ensures SUPER_ADMIN), never overwrites an
 * existing password.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const seed = loadConfig().bootstrapAdmin;
  if (!seed) return;
  const email = seed.email.trim().toLowerCase();
  const existing = await prisma.userRole.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== Role.SUPER_ADMIN) {
      await prisma.userRole.update({ where: { email }, data: { role: Role.SUPER_ADMIN } });
    }
    return;
  }
  await prisma.userRole.create({
    data: {
      atlassianAccountId: randomUUID(),
      email,
      displayName: 'Administrator',
      role: Role.SUPER_ADMIN,
      passwordHash: hashPassword(seed.password),
      mustChangePassword: true,
    },
  });
}
