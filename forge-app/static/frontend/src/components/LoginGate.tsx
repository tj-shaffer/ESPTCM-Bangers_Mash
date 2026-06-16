/**
 * Password gate for the deployed web app. In mock/Forge modes this is a
 * pass-through. In web mode it requires a valid token before rendering the app,
 * and re-prompts if a request later returns 401.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { WEB_MODE, hasToken, login, setUnauthorizedHandler } from '../api/client';
import { Logo } from './Logo';

export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => !WEB_MODE || hasToken());

  useEffect(() => {
    if (!WEB_MODE) return;
    setUnauthorizedHandler(() => setAuthed(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (authed) return <>{children}</>;
  return <LoginScreen onSuccess={() => setAuthed(true)} />;
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
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
      <form
        onSubmit={submit}
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
          Everstory Partners · enter the access password to continue.
        </p>
        <label className="esp-label" htmlFor="tf-pw">
          Password
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
    </div>
  );
}
