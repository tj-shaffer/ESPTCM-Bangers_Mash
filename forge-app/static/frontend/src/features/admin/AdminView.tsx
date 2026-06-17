/**
 * Super Admin user-management panel. Provision accounts (email, name, role,
 * temporary password), change roles, and reset passwords. Access is enforced
 * server-side; this view is only mounted for SUPER_ADMIN.
 */

import { useState } from 'react';
import {
  useUsers,
  useSetRole,
  useCreateUser,
  useResetPassword,
  type ManagedUser,
} from '../../api/admin';
import { ROLE_LABELS, type Role } from '../../api/permissions';
import { useAuth } from '../../context/AuthContext';

const ROLES: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR', 'OBSERVER'];

export function AdminView() {
  const { data: users, isLoading, error } = useUsers();
  const setRole = useSetRole();
  const resetPassword = useResetPassword();
  const auth = useAuth();
  const [notice, setNotice] = useState<string | null>(null);

  const onReset = async (u: ManagedUser) => {
    const pw = window.prompt(`New temporary password for ${u.displayName} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) {
      setNotice('Password must be at least 8 characters.');
      return;
    }
    try {
      await resetPassword.mutateAsync({ accountId: u.atlassianAccountId, password: pw });
      setNotice(`Password reset for ${u.displayName}. They’ll be asked to change it on next login.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not reset password.');
    }
  };

  return (
    <div className="esp-view" style={{ padding: 24, maxWidth: 880 }}>
      <h2 style={{ marginTop: 0 }}>Users &amp; Roles</h2>
      <p className="esp-muted" style={{ fontSize: 13, marginTop: 4 }}>
        Create an account for each person, set their role, and reset passwords. New users sign in
        with the temporary password you set and are prompted to change it.
      </p>

      <AddUserForm onCreated={(name) => setNotice(`Created ${name}.`)} />

      {notice ? (
        <p className="esp-muted" style={{ marginTop: 12, fontSize: 13 }}>
          {notice}
        </p>
      ) : null}

      {isLoading ? <p className="esp-muted">Loading users…</p> : null}
      {error ? <p className="esp-error">Could not load users.</p> : null}

      {users && users.length > 0 ? (
        <table className="esp-table" style={{ width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Email</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: ManagedUser) => {
              const isSelf = u.atlassianAccountId === auth.accountId;
              return (
                <tr key={u.atlassianAccountId}>
                  <td>
                    {u.displayName}
                    {isSelf ? <span className="esp-muted"> (you)</span> : null}
                  </td>
                  <td className="esp-muted">{u.email ?? '—'}</td>
                  <td>
                    <select
                      className="esp-input"
                      value={u.role}
                      disabled={setRole.isPending}
                      onChange={(e) =>
                        setRole.mutate({ accountId: u.atlassianAccountId, role: e.target.value as Role })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="esp-btn esp-btn-ghost"
                      disabled={resetPassword.isPending}
                      onClick={() => void onReset(u)}
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : !isLoading && !error ? (
        <p className="esp-muted" style={{ marginTop: 12 }}>
          No users yet — add the first one above.
        </p>
      ) : null}

      {setRole.isError ? (
        <p className="esp-error" style={{ marginTop: 12 }}>
          {setRole.error instanceof Error ? setRole.error.message : 'Could not update role.'}
        </p>
      ) : null}
    </div>
  );
}

function AddUserForm({ onCreated }: { onCreated: (name: string) => void }) {
  const createUser = useCreateUser();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('TEST_AUTHOR');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Temporary password must be at least 8 characters.');
      return;
    }
    try {
      await createUser.mutateAsync({ email, displayName, role, password });
      onCreated(displayName);
      setEmail('');
      setDisplayName('');
      setRole('TEST_AUTHOR');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user.');
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'flex-end',
        marginTop: 14,
        padding: 14,
        border: '1px solid var(--esp-border)',
        borderRadius: 'var(--esp-radius)',
        background: 'var(--esp-powder-soft)',
      }}
    >
      <div style={{ flex: '1 1 160px' }}>
        <label className="esp-label">Name</label>
        <input
          className="esp-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Jane Tester"
          required
        />
      </div>
      <div style={{ flex: '1 1 180px' }}>
        <label className="esp-label">Email</label>
        <input
          className="esp-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@everstory.com"
          required
        />
      </div>
      <div style={{ flex: '0 1 150px' }}>
        <label className="esp-label">Role</label>
        <select className="esp-input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div style={{ flex: '1 1 160px' }}>
        <label className="esp-label">Temp password</label>
        <input
          className="esp-input"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="min 8 characters"
          required
        />
      </div>
      <button
        type="submit"
        className="esp-btn esp-btn-primary"
        disabled={createUser.isPending || !email || !displayName || !password}
      >
        {createUser.isPending ? 'Adding…' : 'Add user'}
      </button>
      {error ? (
        <p className="esp-error" style={{ flexBasis: '100%', margin: 0 }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
