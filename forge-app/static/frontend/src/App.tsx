/**
 * TestForge app shell — brand header + Repository view.
 * Plans, Execution, Vendor Tracker, and Dashboard mount alongside Repository
 * in later phases (a left/top nav lands when the second view does).
 */

import { useAuth } from './context/AuthContext';
import { STANDALONE } from './api/client';
import { RepositoryView } from './features/repository/RepositoryView';

export function App() {
  const auth = useAuth();

  return (
    <div className="esp-app">
      <header className="esp-header">
        <div className="esp-logo">
          <span className="esp-logo-mark" aria-hidden />
          TestForge
        </div>
        <span className="esp-badge esp-badge-soft">Everstory Partners</span>
        {STANDALONE ? (
          <span className="esp-badge" style={{ background: 'rgba(240,138,75,0.16)', color: 'var(--esp-orange-strong)' }}>
            Preview · mock data
          </span>
        ) : null}
        <div className="esp-header-spacer" />
        <span className="esp-user">{auth.displayName ?? auth.accountId ?? 'Unknown user'}</span>
      </header>
      <RepositoryView />
    </div>
  );
}
