/**
 * Bangers & Mash app shell — brand header, top nav, and the active view.
 * Repository (author) · Test Runs (execute) · Dashboard (report).
 */

import { Suspense, lazy, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { useAuth } from './context/AuthContext';
import { STANDALONE } from './api/client';
import { Logo } from './components/Logo';
import { RepositoryView } from './features/repository/RepositoryView';

// Lazy — keeps recharts (Dashboard) out of the initial bundle; each feature
// view loads on first navigation.
const RunsView = lazy(() => import('./features/runs/RunsView').then((m) => ({ default: m.RunsView })));
const PackagesView = lazy(() =>
  import('./features/runs/PackagesView').then((m) => ({ default: m.PackagesView })),
);
const DashboardView = lazy(() =>
  import('./features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const AdminView = lazy(() =>
  import('./features/admin/AdminView').then((m) => ({ default: m.AdminView })),
);

type View = 'repository' | 'runs' | 'packages' | 'dashboard' | 'admin';

const NAV: { key: View; label: string; adminOnly?: boolean }[] = [
  { key: 'repository', label: 'Repository' },
  { key: 'runs', label: 'Test Runs' },
  { key: 'packages', label: 'Packages' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'admin', label: 'User Roles', adminOnly: true },
];

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('repository');
  const isAdmin = auth.hasRole('SUPER_ADMIN');

  return (
    <div className="esp-app">
      <header className="esp-header">
        <div className="esp-logo">
          <Logo size={24} />
          Bangers &amp; Mash
        </div>
        <nav className="esp-nav">
          {NAV.filter((n) => n.key === 'repository' || !STANDALONE)
            .filter((n) => !n.adminOnly || isAdmin)
            .map((n) => (
            <button
              key={n.key}
              className={`esp-nav-item${view === n.key ? ' active' : ''}`}
              onClick={() => setView(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="esp-header-spacer" />
        <span className="esp-badge esp-badge-soft">Everstory Partners</span>
        {STANDALONE ? (
          <span className="esp-badge" style={{ background: 'rgba(240,138,75,0.16)', color: 'var(--esp-orange-strong)' }}>
            Preview · mock data
          </span>
        ) : null}
        <span className="esp-user">{auth.displayName ?? auth.accountId ?? 'Unknown user'}</span>
      </header>
      {view === 'repository' || (view === 'admin' && !isAdmin) ? (
        <RepositoryView />
      ) : (
        <Suspense
          fallback={
            <div className="esp-spinner-wrap">
              <Spinner size="large" />
            </div>
          }
        >
          {view === 'runs' ? (
            <RunsView />
          ) : view === 'packages' ? (
            <PackagesView />
          ) : view === 'admin' ? (
            <AdminView />
          ) : (
            <DashboardView />
          )}
        </Suspense>
      )}
    </div>
  );
}
