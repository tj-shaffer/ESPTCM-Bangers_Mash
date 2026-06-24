/**
 * Front door for the deployed web app. Unauthenticated visitors land on a
 * marketing landing page (the app is a product we sell, not just an internal
 * tool): a hero + "Try the live demo" (enters runtime mock mode — see
 * api/client enterDemo) and "Sign in" (reveals the pilot login form). In mock /
 * demo modes this whole gate is a pass-through. In web mode it requires a valid
 * session token, re-prompts on a later 401, and — when the account was issued a
 * temporary password — forces a password change before the app loads.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { WEB_MODE, hasToken, login, clearToken, setUnauthorizedHandler, enterDemo } from '../api/client';
import { useChangePassword } from '../api/admin';
import { Logo } from './Logo';
import { Icon, type IconName } from './Icon';

export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !WEB_MODE || hasToken());
  const [mustChange, setMustChange] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!WEB_MODE) return;
    setUnauthorizedHandler(() => {
      setAuthed(false);
      setMustChange(false);
      // A session expiry should land on the sign-in form, not the marketing page.
      setShowLogin(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  if (!authed) {
    return showLogin ? (
      <LoginScreen
        onBack={() => setShowLogin(false)}
        onSuccess={(needsChange) => {
          setMustChange(needsChange);
          setAuthed(true);
        }}
      />
    ) : (
      <Landing onSignIn={() => setShowLogin(true)} />
    );
  }
  if (mustChange) {
    return <ForceChangeScreen onDone={() => setMustChange(false)} />;
  }
  return <>{children}</>;
}

/** The wordmark used across the front door — "Bangers & Mash, by Second 9 Labs". */
function Brand() {
  return (
    <div className="esp-logo">
      <Logo size={34} />
      <div className="esp-brand-text">
        <div className="esp-brand-name">Bangers &amp; <b>Mash</b></div>
        <div className="esp-brand-sub">by Second 9 Labs</div>
      </div>
    </div>
  );
}

/** Public marketing landing page: the consolidated front door for prospects
 *  (Try the live demo) and pilot users (Sign in), served from the same build. */
function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--esp-powder-soft)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: 1040,
          margin: '0 auto',
          padding: '18px 28px',
        }}
      >
        <Brand />
        <button className="esp-btn esp-btn-secondary" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          maxWidth: 1040,
          margin: '0 auto',
          padding: '8px 28px 48px',
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <span
            className="esp-badge"
            style={{ background: 'var(--esp-orange-tint)', color: 'var(--esp-orange-strong)' }}
          >
            Test case management
          </span>
          <h1
            style={{
              fontFamily: 'var(--esp-font-serif)',
              fontWeight: 600,
              fontSize: 40,
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
              color: 'var(--esp-blue-ink)',
              margin: '16px 0 14px',
            }}
          >
            Retire the QA spreadsheet.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--esp-muted)', margin: '0 0 24px', maxWidth: 560 }}>
            Bangers &amp; Mash turns scattered test cases, runs, and defects into one calm workspace — built for teams
            shipping real software, with defects that file straight to Jira.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="esp-btn esp-btn-primary" onClick={enterDemo}>
              <Icon name="play" /> Try the live demo
            </button>
            <a
              className="esp-btn esp-btn-secondary"
              href="mailto:second-9-labs-f83d54@thirdbrain-os.com?subject=Bangers%20%26%20Mash%20walkthrough"
            >
              Book a walkthrough
            </a>
          </div>
          <p
            className="esp-muted"
            style={{ fontSize: 12, margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="eye" size={13} /> No signup · sample data · nothing you do is saved
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginTop: 44,
          }}
        >
          <Feature
            icon="folder"
            title="Organize"
            body="Folders, test cases, and reusable cycles — no more tabs in a spreadsheet."
          />
          <Feature
            icon="play"
            title="Execute"
            body="Run cycles, log pass/fail with notes, and attach evidence as you go."
          />
          <Feature
            icon="link"
            title="Connect"
            body="File defects straight to Jira and keep the team posted in Teams."
          />
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div
      style={{
        background: 'var(--esp-surface)',
        border: '1px solid var(--esp-border)',
        borderRadius: 'var(--esp-radius)',
        boxShadow: 'var(--esp-shadow)',
        padding: '16px 18px',
      }}
    >
      <div style={{ color: 'var(--esp-blue-strong)', marginBottom: 8 }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ fontWeight: 600, color: 'var(--esp-ink)', marginBottom: 3 }}>{title}</div>
      <div className="esp-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        {body}
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--esp-powder-soft)',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--esp-surface)',
          border: '1px solid var(--esp-border)',
          borderRadius: 'var(--esp-radius)',
          boxShadow: 'var(--esp-shadow)',
          padding: '28px 26px',
          width: '100%',
          maxWidth: 360,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <Brand />
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginScreen({
  onSuccess,
  onBack,
}: {
  onSuccess: (mustChangePassword: boolean) => void;
  onBack?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.ok) onSuccess(!!res.mustChangePassword);
      else setError('Incorrect email or password.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {onBack ? (
        <button
          type="button"
          className="esp-btn esp-btn-ghost"
          style={{ padding: '2px 6px', marginBottom: 10 }}
          onClick={onBack}
        >
          <Icon name="arrowLeft" size={13} /> Back
        </button>
      ) : null}
      <form onSubmit={submit}>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Sign in to continue.
        </p>
        <label className="esp-label" htmlFor="tf-email">
          Email
        </label>
        <input
          id="tf-email"
          className="esp-input"
          type="email"
          autoFocus
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <label className="esp-label" htmlFor="tf-pw" style={{ marginTop: 12 }}>
          Password
        </label>
        <input
          id="tf-pw"
          className="esp-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
        />
        {error ? (
          <p className="esp-error" style={{ marginTop: 10, marginBottom: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="esp-btn esp-btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
          disabled={busy || !email || !password}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Card>
  );
}

function ForceChangeScreen({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const changePassword = useChangePassword();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    }
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Set a new password to continue.
        </p>
        <label className="esp-label" htmlFor="cur-pw">
          Current (temporary) password
        </label>
        <input
          id="cur-pw"
          className="esp-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <label className="esp-label" htmlFor="new-pw" style={{ marginTop: 12 }}>
          New password
        </label>
        <input
          id="new-pw"
          className="esp-input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <label className="esp-label" htmlFor="confirm-pw" style={{ marginTop: 12 }}>
          Confirm new password
        </label>
        <input
          id="confirm-pw"
          className="esp-input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error ? (
          <p className="esp-error" style={{ marginTop: 10, marginBottom: 0 }}>
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="esp-btn esp-btn-primary"
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
          disabled={changePassword.isPending || !current || !next || !confirm}
        >
          {changePassword.isPending ? 'Saving…' : 'Set password & continue'}
        </button>
        <button
          type="button"
          className="esp-btn esp-btn-ghost"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
        >
          Sign out
        </button>
      </form>
    </Card>
  );
}
