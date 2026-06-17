/** Self-service password change for the logged-in user (header → Account). */

import { useState } from 'react';
import { Modal } from './ui';
import { useChangePassword } from '../api/admin';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password.');
    }
  };

  return (
    <Modal title="Change password" onClose={onClose} maxWidth={400}>
      {done ? (
        <div>
          <p>Your password has been updated.</p>
          <button className="esp-btn esp-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="esp-label" htmlFor="cp-cur">
            Current password
          </label>
          <input
            id="cp-cur"
            className="esp-input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <label className="esp-label" htmlFor="cp-new" style={{ marginTop: 12 }}>
            New password
          </label>
          <input
            id="cp-new"
            className="esp-input"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <label className="esp-label" htmlFor="cp-confirm" style={{ marginTop: 12 }}>
            Confirm new password
          </label>
          <input
            id="cp-confirm"
            className="esp-input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error ? (
            <p className="esp-error" style={{ marginTop: 10 }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="esp-btn esp-btn-primary"
            style={{ marginTop: 16 }}
            disabled={changePassword.isPending || !current || !next || !confirm}
          >
            {changePassword.isPending ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </Modal>
  );
}
