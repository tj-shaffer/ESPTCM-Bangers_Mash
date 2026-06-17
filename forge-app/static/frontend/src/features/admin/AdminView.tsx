/**
 * Super Admin role-management panel. Lists known users (populated as people log
 * in via Atlassian) and lets a super admin change each user's role. Access is
 * enforced server-side; this view is only mounted for SUPER_ADMIN.
 */

import { useUsers, useSetRole, type ManagedUser } from '../../api/admin';
import { ROLE_LABELS, type Role } from '../../api/permissions';
import { useAuth } from '../../context/AuthContext';

const ROLES: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR', 'OBSERVER'];

export function AdminView() {
  const { data: users, isLoading, error } = useUsers();
  const setRole = useSetRole();
  const auth = useAuth();

  return (
    <div className="esp-view" style={{ padding: 24, maxWidth: 880 }}>
      <h2 style={{ marginTop: 0 }}>User Roles</h2>
      <p className="esp-muted" style={{ fontSize: 13, marginTop: 4 }}>
        Users appear here after their first sign-in. Assign each person a role to control what
        they can do. Changes take effect on their next action.
      </p>

      {isLoading ? <p className="esp-muted">Loading users…</p> : null}
      {error ? <p className="esp-error">Could not load users.</p> : null}

      {users && users.length > 0 ? (
        <table className="esp-table" style={{ width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Email</th>
              <th style={{ textAlign: 'left' }}>Role</th>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : !isLoading && !error ? (
        <p className="esp-muted" style={{ marginTop: 12 }}>
          No users yet — they’ll show up here once they sign in.
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
