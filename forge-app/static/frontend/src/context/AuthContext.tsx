/**
 * AuthContext — bootstraps the user context on mount and exposes a `useAuth()`
 * hook. Beyond identity it carries the resolved role plus `can()` / `hasRole()`
 * helpers so feature views can gate affordances. Until context is loaded we
 * render an ADS Spinner so views can assume `accountId` is non-null.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Spinner from '@atlaskit/spinner';
import { invokeResolver } from '../api/client';
import { canInvoke, type Role } from '../api/permissions';

export interface ForgeUserContext {
  accountId: string | null;
  displayName: string | null;
  role: Role | null;
  currentIssueKey: string | null;
}

interface AuthState extends ForgeUserContext {
  loading: boolean;
  error: string | null;
  /** True if the current role may invoke the given dispatch key. */
  can: (key: string) => boolean;
  /** True if the current role is one of the given roles. */
  hasRole: (...roles: Role[]) => boolean;
}

const initial: AuthState = {
  accountId: null,
  displayName: null,
  role: null,
  currentIssueKey: null,
  loading: true,
  error: null,
  can: () => false,
  hasRole: () => false,
};

const AuthCtx = createContext<AuthState>(initial);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let cancelled = false;
    invokeResolver<ForgeUserContext>('getContext')
      .then((ctx) => {
        if (cancelled) return;
        const role = ctx.role ?? null;
        setState({
          ...ctx,
          role,
          loading: false,
          error: null,
          can: (key: string) => canInvoke(key, role),
          hasRole: (...roles: Role[]) => role !== null && roles.includes(role),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          ...initial,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load user context',
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
        <Spinner size="large" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ padding: 16, color: '#DE350B' }}>
        Failed to initialize Bangers &amp; Mash: {state.error}
      </div>
    );
  }

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
