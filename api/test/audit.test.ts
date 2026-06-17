import { describe, it, expect } from 'vitest';
import { WRITE_KEYS, SELF_AUDITED, auditEntityType, auditEntityId } from '../src/lib/audit';

describe('audit helpers', () => {
  it('auditEntityType takes the key prefix', () => {
    expect(auditEntityType('run.setStage')).toBe('run');
    expect(auditEntityType('admin.createUser')).toBe('admin');
    expect(auditEntityType('getContext')).toBe('getContext');
  });

  it('auditEntityId pulls a target id from common payload shapes', () => {
    expect(auditEntityId({ id: 'case-1' })).toBe('case-1');
    expect(auditEntityId({ accountId: 'acc-9' })).toBe('acc-9');
    expect(auditEntityId({ executionId: 'exec-2' })).toBe('exec-2');
    expect(auditEntityId({ stepResultId: 'sr-3' })).toBe('sr-3');
    expect(auditEntityId({ folderId: 'f-4' })).toBe('f-4');
    expect(auditEntityId({})).toBe('n/a');
    expect(auditEntityId({ id: 123 })).toBe('n/a'); // non-string ignored
  });

  it('classifies mutations as write keys and reads as not', () => {
    for (const key of ['repo.createCase', 'run.signOff', 'admin.setRole', 'defect.create', 'exec.complete']) {
      expect(WRITE_KEYS.has(key)).toBe(true);
    }
    for (const key of ['repo.getCase', 'run.list', 'report.dashboard', 'getContext', 'jira.check']) {
      expect(WRITE_KEYS.has(key)).toBe(false);
    }
  });

  it('self-audited keys are a subset of write keys (no orphan skips)', () => {
    for (const key of SELF_AUDITED) {
      expect(WRITE_KEYS.has(key)).toBe(true);
    }
  });
});
