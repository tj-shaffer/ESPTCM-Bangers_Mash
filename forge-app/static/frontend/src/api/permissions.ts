/**
 * Frontend mirror of the server PERMISSIONS map (api/src/repository/permissions.ts).
 * Used to gate UI affordances so users aren't shown actions that would 403.
 * The server remains the source of truth — this is cosmetic.
 */

export type Role = 'SUPER_ADMIN' | 'TEST_MANAGER' | 'TEST_AUTHOR' | 'FIELD_OPERATOR' | 'OBSERVER';

const ALL: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR', 'OBSERVER'];
const EXECUTE: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR'];
const AUTHOR: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR'];
const MANAGE: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER'];
const ADMIN: Role[] = ['SUPER_ADMIN'];

export const PERMISSIONS: Record<string, Role[]> = {
  getContext: ALL,
  'repo.getFolderTree': ALL,
  'repo.listCases': ALL,
  'repo.getCase': ALL,
  'run.list': ALL,
  'run.get': ALL,
  'package.list': ALL,
  'package.get': ALL,
  'exec.get': ALL,
  'attachment.get': ALL,
  'report.dashboard': ALL,
  'report.export': ALL,
  'meta.projects': ALL,
  'jira.check': ALL,
  'jira.options': ALL,
  'jira.search': ALL,
  'suite.list': ALL,
  'suite.get': ALL,

  'exec.setStep': EXECUTE,
  'exec.addAttachment': EXECUTE,
  'exec.deleteAttachment': EXECUTE,
  'exec.complete': EXECUTE,
  'defect.create': EXECUTE,
  'run.setStage': EXECUTE,

  'defect.toJira': MANAGE,
  'defect.linkJira': MANAGE,
  'run.signOff': MANAGE,
  'package.signOff': MANAGE,

  'repo.createFolder': AUTHOR,
  'repo.updateFolder': AUTHOR,
  'repo.deleteFolder': AUTHOR,
  'repo.createCase': AUTHOR,
  'repo.updateCase': AUTHOR,
  'repo.deleteCase': AUTHOR,
  'repo.duplicateCase': AUTHOR,
  'repo.importCases': AUTHOR,
  'run.create': AUTHOR,
  'run.update': AUTHOR,
  'run.delete': AUTHOR,
  'package.create': AUTHOR,
  'package.delete': AUTHOR,
  'suite.create': AUTHOR,
  'suite.update': AUTHOR,
  'suite.delete': AUTHOR,

  'account.changePassword': ALL,

  'admin.listUsers': ADMIN,
  'admin.setRole': ADMIN,
  'admin.createUser': ADMIN,
  'admin.resetPassword': ADMIN,
  'admin.deleteUser': ADMIN,
};

export function canInvoke(key: string, role: Role | null): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[key];
  return allowed !== undefined && allowed.includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  TEST_MANAGER: 'Test Manager',
  TEST_AUTHOR: 'Test Author',
  FIELD_OPERATOR: 'Field Operator',
  OBSERVER: 'Observer',
};

export const ROLES: Role[] = ['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR', 'OBSERVER'];
