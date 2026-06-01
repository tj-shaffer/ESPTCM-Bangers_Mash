/**
 * Phase 1 shell — confirms the Forge context loads and the resolver↔API path
 * works. Feature views (Repository, Plans, Execution, Vendor Tracker,
 * Dashboard) replace the inner panel in later phases.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './context/AuthContext';
import { apiClient } from './api/client';

interface FoundationPing {
  ok: boolean;
  message: string;
}

export function App() {
  const auth = useAuth();
  const ping = useQuery<FoundationPing>({
    queryKey: ['foundation-ping'],
    queryFn: () => apiClient.get<FoundationPing>('/'),
  });

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', lineHeight: 1.5 }}>
      <h2 style={{ marginTop: 0 }}>TestForge</h2>
      <p>
        Signed in as <strong>{auth.displayName ?? auth.accountId ?? 'unknown user'}</strong>
        {auth.currentIssueKey ? <> on issue <code>{auth.currentIssueKey}</code></> : null}
      </p>
      <h3>Backend status</h3>
      {ping.isLoading ? (
        <p>Pinging API…</p>
      ) : ping.isError ? (
        <p style={{ color: '#DE350B' }}>API unreachable: {(ping.error as Error).message}</p>
      ) : (
        <p style={{ color: '#006644' }}>{ping.data?.message}</p>
      )}
      <hr />
      <small>
        Phase 1 shell — Repository, Plans, Execution, Vendor Tracker, and Dashboard land in
        subsequent phases. See <code>CLAUDE.md</code>.
      </small>
    </div>
  );
}
