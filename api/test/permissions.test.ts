import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { canInvoke, PERMISSIONS } from '../src/repository/permissions';

describe('RBAC permission map (canInvoke)', () => {
  it('denies unknown keys for every role (fail closed)', () => {
    for (const role of Object.values(Role)) {
      expect(canInvoke('totally.unknown.key', role)).toBe(false);
    }
  });

  it('lets OBSERVER read but never write/execute/admin', () => {
    expect(canInvoke('repo.getCase', Role.OBSERVER)).toBe(true);
    expect(canInvoke('report.dashboard', Role.OBSERVER)).toBe(true);
    expect(canInvoke('repo.createCase', Role.OBSERVER)).toBe(false);
    expect(canInvoke('exec.setStep', Role.OBSERVER)).toBe(false);
    expect(canInvoke('admin.setRole', Role.OBSERVER)).toBe(false);
  });

  it('lets FIELD_OPERATOR execute but not author or administer', () => {
    expect(canInvoke('exec.setStep', Role.FIELD_OPERATOR)).toBe(true);
    expect(canInvoke('defect.create', Role.FIELD_OPERATOR)).toBe(true);
    expect(canInvoke('repo.createCase', Role.FIELD_OPERATOR)).toBe(false);
    expect(canInvoke('run.signOff', Role.FIELD_OPERATOR)).toBe(false);
    expect(canInvoke('admin.createUser', Role.FIELD_OPERATOR)).toBe(false);
  });

  it('lets TEST_AUTHOR author but not do QC/Jira/admin actions', () => {
    expect(canInvoke('repo.createCase', Role.TEST_AUTHOR)).toBe(true);
    expect(canInvoke('run.create', Role.TEST_AUTHOR)).toBe(true);
    expect(canInvoke('defect.toJira', Role.TEST_AUTHOR)).toBe(false);
    expect(canInvoke('run.signOff', Role.TEST_AUTHOR)).toBe(false);
    expect(canInvoke('admin.setRole', Role.TEST_AUTHOR)).toBe(false);
  });

  it('reserves admin.* for SUPER_ADMIN only', () => {
    const adminKeys = ['admin.listUsers', 'admin.setRole', 'admin.createUser', 'admin.resetPassword'];
    for (const key of adminKeys) {
      expect(canInvoke(key, Role.SUPER_ADMIN)).toBe(true);
      expect(canInvoke(key, Role.TEST_MANAGER)).toBe(false);
    }
  });

  it('lets any authenticated role change their own password', () => {
    for (const role of Object.values(Role)) {
      expect(canInvoke('account.changePassword', role)).toBe(true);
    }
  });

  it('SUPER_ADMIN can invoke every mapped key', () => {
    for (const key of Object.keys(PERMISSIONS)) {
      expect(canInvoke(key, Role.SUPER_ADMIN)).toBe(true);
    }
  });
});
