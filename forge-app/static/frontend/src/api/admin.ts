/**
 * Admin data hooks — TanStack Query over the `admin.*` dispatch endpoints.
 * These are SUPER_ADMIN-only (enforced server-side).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type { Role } from './permissions';

export interface ManagedUser {
  atlassianAccountId: string;
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
