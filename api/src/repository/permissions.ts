/**
 * Dispatch-key → allowed-roles map. The pilot funnels everything through one
 * route (/api/invoke → dispatch), so authorization is enforced per invoke key
 * rather than per Express route. The frontend mirrors these tiers to gate the
 * UI, but THIS is the source of truth — the server always re-checks.
 *
 * Keys absent from the map are denied by default (fail closed).
 */

import { Role } from '@prisma/client';

const ALL: Role[] = [
  Role.SUPER_ADMIN,
  Role.TEST_MANAGER,
  Role.TEST_AUTHOR,
  Role.FIELD_OPERATOR,
  Role.OBSERVER,
];
const EXECUTE: Role[] = [Role.SUPER_ADMIN, Role.TEST_MANAGER, Role.TEST_AUTHOR, Role.FIELD_OPERATOR];
const AUTHOR: Role[] = [Role.SUPER_ADMIN, Role.TEST_MANAGER, Role.TEST_AUTHOR];
// QC / defect-ticket control — managers (and super admins) only. Mohammad: "we
// control the bug tickets" and QC before anything reaches an approver.
const MANAGE: Role[] = [Role.SUPER_ADMIN, Role.TEST_MANAGER];
const ADMIN: Role[] = [Role.SUPER_ADMIN];

export const PERMISSIONS: Record<string, Role[]> = {
  // ---------- read (everyone, incl. OBSERVER) ----------
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

  // ---------- execution (field operators and up) ----------
  'exec.setStep': EXECUTE,
  'exec.addAttachment': EXECUTE,
  'exec.deleteAttachment': EXECUTE,
  'exec.complete': EXECUTE,
  'defect.create': EXECUTE,
  // A tester can submit a run for QC; the rest of the stage machine is
  // manager-gated inside dispatch.
  'run.setStage': EXECUTE,

  // ---------- QC / defect tickets / approval (managers + super admins) ----------
  'defect.toJira': MANAGE,
  'defect.linkJira': MANAGE,
  'run.signOff': MANAGE,

  // ---------- authoring (authors, managers, super admins) ----------
  'repo.createFolder': AUTHOR,
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

  // ---------- account (any authenticated user, incl. OBSERVER) ----------
  'account.changePassword': ALL,

  // ---------- administration (super admin only) ----------
  'admin.listUsers': ADMIN,
  'admin.setRole': ADMIN,
  'admin.createUser': ADMIN,
  'admin.resetPassword': ADMIN,
  'admin.deleteUser': ADMIN,
};

/** True if `role` may invoke `key`. Unknown keys fail closed. */
export function canInvoke(key: string, role: Role): boolean {
  const allowed = PERMISSIONS[key];
  return allowed !== undefined && allowed.includes(role);
}

/**
 * The QC / approval tier — super admins and test managers. The single source of
 * truth for "is this user a manager", so per-key stage logic in dispatch can't
 * drift from the MANAGE permission tier above.
 */
export function isManager(role: Role): boolean {
  return MANAGE.includes(role);
}
