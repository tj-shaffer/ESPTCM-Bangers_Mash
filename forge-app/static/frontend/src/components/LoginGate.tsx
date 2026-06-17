/**
 * Login gate for the deployed web app. In mock/Forge modes this is a
 * pass-through. In web mode it requires a valid session token before rendering
 * the app, and re-prompts if a request later returns 401.
 *
 * Primary login is "Log in with Atlassian" (OAuth) — the API redirects back
 * with the token in the URL fragment, captured on load. A shared-password gate
 * remains as break-glass behind a toggle.
 */

import { useEffect, useState, type ReactNode } from 'react';
import {
  WEB_MODE,
  OAUTH_ENABLED,
  hasToken,
  login,
  loginWithAtlassian,
  captureTokenFromHash,
  setUnauthorizedHandler,
} from '../api/client';
import { Logo } from './Logo';

export function LoginGate({ children }: { children: ReactNode }) {
  // Capture an OAuth redirect token before deciding whether we're authed.
  const [authed, setAuthed] = useState(() => {
    if (!WEB_MODE) return true;
    captureTokenFromHash();
    return hasToken();
  });

  useEffect(() => {
    if (!WEB_MODE) return;
    setUnauthorizedHandler(() => setAuthed(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (authed) return <>{children}</>;
  return <LoginScreen onSuccess={() => setAuthed(true)} />;
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [showPassword, setShowPassword] = useState(!OAUTH_ENABLED);
  const [authError] = useState(() => {
    try {
      return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('error');
    } catch {
      return null;
    }
  });

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
        <p className="esp-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Everstory Partners · sign in to continue.
        </p>

        {authError ? (
          <p className="esp-error" style={{ marginTop: 10 }}>
            Sign-in failed. Please try again.
          </p>
        ) : null}

        {OAUTH_ENABLED ? (
          <button
            type="button"
            className="esp-btn esp-btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={loginWithAtlassian}
          >
            Log in with Atlassian
          </button>
        ) : null}

        {OAUTH_ENABLED ? (
          <button
            type="button"
            className="esp-link"
            style={{
              marginTop: 14,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--esp-muted)',
            }}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? 'Hide access password' : 'Use access password instead'}
          </button>
        ) : null}

        {showPassword ? <PasswordForm onSuccess={onSuccess} /> : null}
      </div>
    </div>
  );
}

function PasswordForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ok = await login(password);
      if (ok) onSuccess();
      else setError('Incorrect password.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 12 }}>
      <label className="esp-label" htmlFor="tf-pw">
        Access password
      </label>
      <input
        id="tf-pw"
        className="esp-input"
        type="password"
        autoFocus
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
        disabled={busy || !password}
      >
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </form>
  );
}
