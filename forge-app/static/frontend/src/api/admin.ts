/**
 * Admin data hooks — TanStack Query over the `admin.*` dispatch endpoints.
 * These are SUPER_ADMIN-only (enforced server-side).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type { Role } from './permissions';

export interface ManagedUser {
  subjectId: string;
  displayName: string;
  email: string | null;
  role: Role;
  updatedAt?: string;
}

const usersKey = ['admin', 'users'] as const;

export function useUsers() {
  return useQuery({
    queryKey: usersKey,
    queryFn: () => invokeResolver<ManagedUser[]>('admin.listUsers'),
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, role }: { accountId: string; role: Role }) =>
      invokeResolver<ManagedUser>('admin.setRole', { accountId, role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; displayName: string; role: Role; password: string }) =>
      invokeResolver<ManagedUser>('admin.createUser', { ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ accountId, password }: { accountId: string; password: string }) =>
      invokeResolver<{ subjectId: string; email: string }>('admin.resetPassword', {
        accountId,
        password,
      }),
  });
}

/** Completely delete a user account (revokes their access). */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => invokeResolver<{ deleted: boolean }>('admin.deleteUser', { accountId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
  });
}

/** Self-service password change for the logged-in user. */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      invokeResolver<{ ok: boolean }>('account.changePassword', { currentPassword, newPassword }),
  });
}
