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
const PipelineView = lazy(() =>
  import('./features/runs/PipelineView').then((m) => ({ default: m.PipelineView })),
);
const DashboardView = lazy(() =>
  import('./features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const AdminView = lazy(() =>
  import('./features/admin/AdminView').then((m) => ({ default: m.AdminView })),
);

type View = 'repository' | 'runs' | 'dashboard' | 'admin';

const NAV: { key: View; label: string; adminOnly?: boolean }[] = [
  { key: 'repository', label: 'Repository' },
  { key: 'runs', label: 'Pipeline' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'admin', label: 'User Roles', adminOnly: true },
];

const VIEWS: View[] = ['repository', 'runs', 'dashboard', 'admin'];

/** Parse the URL hash into a view + optional entity id (e.g. "#repository/<caseId>"
 *  or "#dashboard"), so tabs AND specific test cases are linkable and survive a
 *  refresh. Falls back to Repository for an empty/unknown hash. */
function parseHash(): { view: View; entityId: string | null } {
  if (typeof window === 'undefined') return { view: 'repository', entityId: null };
  const raw = window.location.hash.replace(/^#\/?/, '');
  const slash = raw.indexOf('/');
  const v = (slash === -1 ? raw : raw.slice(0, slash)) as View;
  const entityId = slash === -1 ? null : raw.slice(slash + 1) || null;
  return { view: VIEWS.includes(v) ? v : 'repository', entityId };
}

export function App() {
  const auth = useAuth();
  const [route, setRoute] = useState(parseHash);
  const { view, entityId } = route;
  const isAdmin = auth.hasRole('SUPER_ADMIN');
  const [showChangePw, setShowChangePw] = useState(false);

  // Keep the hash and the route in sync (covers nav clicks + back/forward).
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const setView = (v: View) => {
    if (parseHash().view !== v || parseHash().entityId) window.location.hash = v;
    setRoute({ view: v, entityId: null });
  };

  return (
    <div className="esp-app">
      <header className="esp-header">
        <div className="esp-logo">
          <Logo size={34} />
          <div className="esp-brand-text">
            <div className="esp-brand-name">Ever<b>story</b></div>
            <div className="esp-brand-sub">Bangers &amp; Mash</div>
          </div>
        </div>
        <nav className="esp-nav">
          {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
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
          <span className="esp-badge" style={{ background: 'var(--esp-orange-tint)', color: 'var(--esp-orange-strong)' }}>
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
            background: 'var(--esp-orange-tint)',
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
      {view === 'repository' || (view === 'admin' && !isAdmin) ? (
        <RepositoryView deepCaseId={view === 'repository' ? entityId : null} />
      ) : (
        <Suspense
          fallback={
            <div className="esp-spinner-wrap">
              <Spinner size="large" />
            </div>
          }
        >
          {view === 'runs' ? (
            <PipelineView deepRunId={entityId} />
          ) : view === 'admin' ? (
            <AdminView />
          ) : (
            <DashboardView deepRunId={entityId} />
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
