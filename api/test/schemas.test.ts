import { describe, it, expect } from 'vitest';
import { parse, hasSchema } from '../src/repository/schemas';
import { DispatchError } from '../src/repository/errors';

describe('payload schemas (parse)', () => {
  it('accepts a valid create-case payload and strips unknown keys', () => {
    const out = parse('repo.createCase', {
      folderId: 'f1',
      title: 'Login works',
      priority: 'HIGH',
      vendors: ['PBX'],
      bogusExtraField: 'should be stripped',
    });
    expect(out.title).toBe('Login works');
    expect(out.folderId).toBe('f1');
    expect(out.priority).toBe('HIGH');
    expect(out).not.toHaveProperty('bogusExtraField');
  });

  it('throws DispatchError(400) with the original message for missing required fields', () => {
    expect(() => parse('repo.createCase', { folderId: 'f1' })).toThrow('Title is required');
    expect(() => parse('repo.createCase', { title: 'x' })).toThrow('folderId is required');
    expect(() => parse('repo.getCase', {})).toThrow('Test case id is required');
    expect(() => parse('run.create', { name: 'r', testCaseIds: [] })).toThrow('Select at least one test case');
    expect(() => parse('repo.importCases', { folderId: 'f', rows: [] })).toThrow('No rows to import');
    try {
      parse('repo.getCase', {});
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(DispatchError);
      expect((e as DispatchError).status).toBe(400);
    }
  });

  it('rejects bad enum values with the inline-style message', () => {
    expect(() => parse('run.setStage', { id: 'r1', stage: 'NONSENSE' })).toThrow('A valid run stage is required');
    expect(() => parse('run.signOff', { id: 'r1', decision: 'MAYBE', approverName: 'M' })).toThrow(
      'A valid decision (APPROVED or REJECTED) is required',
    );
    expect(() => parse('admin.setRole', { accountId: 'a', role: 'KING' })).toThrow('A valid role is required');
  });

  it('enforces password length rules with the original messages', () => {
    expect(() => parse('admin.createUser', { email: 'a@b.c', displayName: 'A', role: 'OBSERVER', password: 'short' })).toThrow(
      'Temporary password must be at least 8 characters',
    );
    expect(() => parse('account.changePassword', { currentPassword: 'x' })).toThrow(
      'Current and new passwords are required',
    );
    expect(() => parse('account.changePassword', { currentPassword: 'x', newPassword: 'short' })).toThrow(
      'New password must be at least 8 characters',
    );
  });

  it('defaults an omitted folder parentId to null', () => {
    expect(parse('repo.createFolder', { name: 'Top level' }).parentId).toBeNull();
  });

  it('hasSchema reflects which keys validate', () => {
    expect(hasSchema('repo.createCase')).toBe(true);
    expect(hasSchema('getContext')).toBe(false); // no payload schema
    expect(hasSchema('nope.nope')).toBe(false);
  });
});
