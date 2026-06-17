import { describe, it, expect } from 'vitest';
import { Role } from '@prisma/client';
import { effectiveRole } from '../src/routes/invoke';

describe('view-as effective role (downgrade-only)', () => {
  it('lets a SUPER_ADMIN view as any lesser role', () => {
    expect(effectiveRole(Role.SUPER_ADMIN, 'TEST_MANAGER')).toBe(Role.TEST_MANAGER);
    expect(effectiveRole(Role.SUPER_ADMIN, 'TEST_AUTHOR')).toBe(Role.TEST_AUTHOR);
    expect(effectiveRole(Role.SUPER_ADMIN, 'FIELD_OPERATOR')).toBe(Role.FIELD_OPERATOR);
    expect(effectiveRole(Role.SUPER_ADMIN, 'OBSERVER')).toBe(Role.OBSERVER);
  });

  it('ignores the header when absent or invalid', () => {
    expect(effectiveRole(Role.SUPER_ADMIN, undefined)).toBe(Role.SUPER_ADMIN);
    expect(effectiveRole(Role.SUPER_ADMIN, '')).toBe(Role.SUPER_ADMIN);
    expect(effectiveRole(Role.SUPER_ADMIN, 'KING')).toBe(Role.SUPER_ADMIN);
  });

  it('NEVER escalates — a non-super-admin cannot use the header to gain a higher role', () => {
    expect(effectiveRole(Role.TEST_AUTHOR, 'SUPER_ADMIN')).toBe(Role.TEST_AUTHOR);
    expect(effectiveRole(Role.OBSERVER, 'TEST_MANAGER')).toBe(Role.OBSERVER);
    expect(effectiveRole(Role.FIELD_OPERATOR, 'SUPER_ADMIN')).toBe(Role.FIELD_OPERATOR);
    expect(effectiveRole(Role.TEST_MANAGER, 'SUPER_ADMIN')).toBe(Role.TEST_MANAGER);
  });
});
