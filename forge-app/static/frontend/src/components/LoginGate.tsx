/**
 * Login gate for the deployed web app. In mock/Forge modes this is a
 * pass-through. In web mode it requires a valid session token before rendering
 * the app, re-prompts on a later 401, and — when the account was issued a
 * temporary password — forces a password change before the app loads.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { WEB_MODE, hasToken, login, clearToken, setUnauthorizedHandler } from '../api/client';
import { useChangePassword } from '../api/admin';
import { Logo } from './Logo';

export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !WEB_MODE || hasToken());
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    if (!WEB_MODE) return;
    setUnauthorizedHandler(() => {
      setAuthed(false);
      setMustChange(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  if (!authed) {
    return (
      <LoginScreen
        onSuccess={(needsChange) => {
          setMustChange(needsChange);
          setAuthed(true);
        }}
      />
    );
  }
  if (mustChange) {
    return <ForceChangeScreen onDone={() => setMustChange(false)} />;
  }
  return <>{children}</>;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Logo size={34} />
          <h2 style={{ fontSize: 20 }}>Bangers &amp; Mash</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (mustChangePassword: boolean) => void }) {
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
      <form onSubmit={submit}>
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Everstory Partners · sign in to continue.
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
          placeholder="you@everstory.com"
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
