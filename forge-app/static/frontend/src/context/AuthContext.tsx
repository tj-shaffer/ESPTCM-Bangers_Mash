/**
 * AuthContext — bootstraps the user context on mount and exposes a `useAuth()`
 * hook. Beyond identity it carries the resolved role plus `can()` / `hasRole()`
 * helpers so feature views can gate affordances.
 *
 * Super admins can "view as" another role: `setViewAsRole` sets an *effective*
 * role that drives all UI gating (and is sent to the server as a downgrade so
 * actions are gated faithfully — see api/src/routes/invoke.ts). The real role is
 * preserved as `actualRole` so the view-as control itself stays available.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Spinner from '@atlaskit/spinner';
import { invokeResolver, setClientViewAs } from '../api/client';
import { canInvoke, type Role } from '../api/permissions';

export interface ForgeUserContext {
  accountId: string | null;
  displayName: string | null;
  role: Role | null;
  mustChangePassword?: boolean;
  currentIssueKey: string | null;
}

interface AuthState extends ForgeUserContext {
  loading: boolean;
  error: string | null;
  /** The user's real role (never affected by view-as). */
  actualRole: Role | null;
  /** The role being previewed via view-as, or null. Super-admin only. */
  viewAsRole: Role | null;
  /** True if the real role is SUPER_ADMIN (gates the view-as control itself). */
  isSuperAdmin: boolean;
  /** Set/clear the view-as role (no-op unless the real role is SUPER_ADMIN). */
  setViewAsRole: (role: Role | null) => void;
  /** True if the *effective* role may invoke the given dispatch key. */
  can: (key: string) => boolean;
  /** True if the *effective* role is one of the given roles. */
  hasRole: (...roles: Role[]) => boolean;
}

const noop = () => {};
const initial: AuthState = {
  accountId: null,
  displayName: null,
  role: null,
  currentIssueKey: null,
  loading: true,
  error: null,
  actualRole: null,
  viewAsRole: null,
  isSuperAdmin: false,
  setViewAsRole: noop,
  can: () => false,
  hasRole: () => false,
};

const AuthCtx = createContext<AuthState>(initial);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<ForgeUserContext>({
    accountId: null,
    displayName: null,
    role: null,
    currentIssueKey: null,
  });
  const [status, setStatus] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });
  const [viewAsRole, setViewAsRoleState] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    invokeResolver<ForgeUserContext>('getContext')
      .then((loaded) => {
        if (cancelled) return;
        setCtx(loaded);
        setStatus({ loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({ loading: false, error: err instanceof Error ? err.message : 'Failed to load user context' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const actualRole = ctx.role ?? null;
    const isSuperAdmin = actualRole === 'SUPER_ADMIN';
    const effectiveRole = isSuperAdmin && viewAsRole ? viewAsRole : actualRole;
    const setViewAsRole = (role: Role | null) => {
      if (!isSuperAdmin) return;
      setViewAsRoleState(role);
      setClientViewAs(role); // attach as a request header so the server gates faithfully
    };
    return {
      ...ctx,
      role: effectiveRole,
      actualRole,
      viewAsRole: isSuperAdmin ? viewAsRole : null,
      isSuperAdmin,
      setViewAsRole,
      loading: status.loading,
      error: status.error,
      can: (key: string) => canInvoke(key, effectiveRole),
      hasRole: (...roles: Role[]) => effectiveRole !== null && roles.includes(effectiveRole),
    };
  }, [ctx, viewAsRole, status]);

  if (status.loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
        <Spinner size="large" />
      </div>
    );
  }

  if (status.error) {
    return (
      <div style={{ padding: 16, color: 'var(--esp-bad)' }}>
        Failed to initialize Bangers &amp; Mash: {status.error}
      </div>
    );
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
