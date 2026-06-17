/**
 * Bangers & Mash app shell — brand header, top nav, and the active view.
 * Repository (author) · Test Runs (execute) · Dashboard (report).
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { useAuth } from './context/AuthContext';
import { ROLE_LABELS } from './api/permissions';
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

const VIEWS: View[] = ['repository', 'runs', 'review', 'packages', 'dashboard', 'admin'];

/** Active view from the URL hash (e.g. "#dashboard"), so tabs are linkable and
 *  survive a refresh. Falls back to Repository for an empty/unknown hash. */
function viewFromHash(): View {
  if (typeof window === 'undefined') return 'repository';
  const h = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.includes(h) ? h : 'repository';
}

export function App() {
  const auth = useAuth();
  const [view, setViewState] = useState<View>(viewFromHash);
  const isAdmin = auth.hasRole('SUPER_ADMIN');
  const isManager = auth.hasRole('SUPER_ADMIN', 'TEST_MANAGER');
  const [showChangePw, setShowChangePw] = useState(false);

  // Keep the hash and the active view in sync (covers nav clicks + back/forward).
  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setView = (v: View) => {
    if (window.location.hash.replace(/^#\/?/, '') !== v) window.location.hash = v;
    setViewState(v);
  };

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
        {STANDALONE ? (
          <span className="esp-badge" style={{ background: 'rgba(240,138,75,0.16)', color: 'var(--esp-orange-strong)' }}>
            Preview · mock data
          </span>
        ) : null}
        <AccountMenu onChangePassword={() => setShowChangePw(true)} />
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

/** Compact account control on the right of the header — keeps the bar clean.
 *  Shows the signed-in name and (web mode) a "Change password" action behind a
 *  click, instead of crowding the nav. */
function AccountMenu({ onChangePassword }: { onChangePassword: () => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const name = auth.displayName ?? auth.accountId ?? 'Account';
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="esp-btn esp-btn-ghost"
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        👤 ▾
      </button>
      {open ? (
        <>
          {/* click-away backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 6,
              zIndex: 41,
              minWidth: 200,
              background: 'var(--esp-surface)',
              border: '1px solid var(--esp-border)',
              borderRadius: 'var(--esp-radius)',
              boxShadow: 'var(--esp-shadow)',
              padding: 6,
            }}
          >
            <div className="esp-muted" style={{ padding: '4px 8px 8px', fontSize: 12, borderBottom: '1px solid var(--esp-border)' }}>
              Signed in as<br />
              <strong style={{ color: 'var(--esp-ink)' }}>{name}</strong>
            </div>
            {WEB_MODE ? (
              <button
                className="esp-btn esp-btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4 }}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onChangePassword();
                }}
              >
                Change password
              </button>
            ) : (
              <div className="esp-muted" style={{ padding: '8px', fontSize: 12 }}>Preview — no account actions.</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
