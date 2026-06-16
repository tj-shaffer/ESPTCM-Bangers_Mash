/**
 * AuthContext — bootstraps the Forge user context on mount and exposes a
 * `useAuth()` hook to the rest of the app. Until context is loaded we render
 * an ADS Spinner so feature views can assume `accountId` is non-null.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Spinner from '@atlaskit/spinner';
import { invokeResolver } from '../api/client';

export interface ForgeUserContext {
  accountId: string | null;
  displayName: string | null;
  currentIssueKey: string | null;
}

interface AuthState extends ForgeUserContext {
  loading: boolean;
  error: string | null;
}

const initial: AuthState = {
  accountId: null,
  displayName: null,
  currentIssueKey: null,
  loading: true,
  error: null,
};

const AuthCtx = createContext<AuthState>(initial);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let cancelled = false;
    invokeResolver<ForgeUserContext>('getContext')
      .then((ctx) => {
        if (cancelled) return;
        setState({ ...ctx, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          ...initial,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load Forge context',
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
        Failed to initialize TestForge: {state.error}
      </div>
    );
  }

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
