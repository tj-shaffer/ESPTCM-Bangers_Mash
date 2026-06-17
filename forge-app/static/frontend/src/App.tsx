/**
 * Bangers & Mash app shell — brand header, top nav, and the active view.
 * Repository (author) · Test Runs (execute) · Dashboard (report).
 */

import { Suspense, lazy, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { useAuth } from './context/AuthContext';
import { ROLES, ROLE_LABELS, type Role } from './api/permissions';
import { STANDALONE, WEB_MODE } from './api/client';
import { Logo } from './components/Logo';
import { ChangePasswordModal } from './components/ChangePasswordModal';
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

type View = 'repository' | 'runs' | 'review' | 'packages' | 'dashboard' | 'admin';

const NAV: { key: View; label: string; adminOnly?: boolean; managerOnly?: boolean }[] = [
  { key: 'repository', label: 'Repository' },
  { key: 'runs', label: 'Test Runs' },
  { key: 'review', label: 'Review Queue', managerOnly: true },
  { key: 'packages', label: 'Packages' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'admin', label: 'User Roles', adminOnly: true },
];

export function App() {
  const auth = useAuth();
  const [view, setView] = useState<View>('repository');
  const isAdmin = auth.hasRole('SUPER_ADMIN');
  const isManager = auth.hasRole('SUPER_ADMIN', 'TEST_MANAGER');
  const [showChangePw, setShowChangePw] = useState(false);

  return (
    <div className="esp-app">
      <header className="esp-header">
        <div className="esp-logo">
          <Logo size={24} />
          Bangers &amp; Mash
        </div>
        <nav className="esp-nav">
          {NAV.filter((n) => !n.adminOnly || isAdmin)
            .filter((n) => !n.managerOnly || isManager)
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
        {auth.isSuperAdmin ? (
          <select
            className="esp-select"
            style={{ width: 'auto', marginLeft: 8 }}
            title="View the app as another role"
            value={auth.viewAsRole ?? ''}
            onChange={(e) => auth.setViewAsRole((e.target.value || null) as Role | null)}
          >
            <option value="">View as: Yourself (Super Admin)</option>
            {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => (
              <option key={r} value={r}>
                View as: {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : null}
        {WEB_MODE ? (
          <button
            className="esp-btn esp-btn-ghost"
            style={{ marginLeft: 8 }}
            onClick={() => setShowChangePw(true)}
          >
            Change password
          </button>
        ) : null}
      </header>
      {auth.viewAsRole ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 16px',
            fontSize: 13,
            background: 'rgba(240,138,75,0.14)',
            color: 'var(--esp-orange-strong)',
            borderBottom: '1px solid var(--esp-border)',
          }}
        >
          👁 Viewing as <strong>{ROLE_LABELS[auth.viewAsRole]}</strong> — affordances and actions are limited to this
          role.
          <button className="esp-btn esp-btn-ghost" style={{ marginLeft: 10 }} onClick={() => auth.setViewAsRole(null)}>
            Exit
          </button>
        </div>
      ) : null}
      {showChangePw ? <ChangePasswordModal onClose={() => setShowChangePw(false)} /> : null}
      {view === 'repository' || (view === 'admin' && !isAdmin) || (view === 'review' && !isManager) ? (
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
          ) : view === 'review' ? (
            <RunsView initialStageFilter="AWAITING_QC" heading="Review Queue" />
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
