import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { issueToken, verifyToken } from '../src/lib/auth';

describe('session tokens', () => {
  it('round-trips: a freshly issued token verifies back to its subject', () => {
    const token = issueToken('account-123', 'Ada Lovelace');
    expect(verifyToken(token)).toBe('account-123');
  });

  it('returns null for a garbage token', () => {
    expect(verifyToken('not.a.jwt')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('returns null for a token signed with the wrong secret (tamper/forgery)', () => {
    const forged = jwt.sign({ sub: 'attacker' }, 'some-other-secret', { expiresIn: '7d' });
    expect(verifyToken(forged)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const expired = jwt.sign({ sub: 'account-123' }, process.env.TESTFORGE_INTERNAL_SECRET as string, {
      expiresIn: -10,
    });
    expect(verifyToken(expired)).toBeNull();
  });

  it('returns null when there is no string subject claim', () => {
    const noSub = jwt.sign({ name: 'nobody' }, process.env.TESTFORGE_INTERNAL_SECRET as string, {
      expiresIn: '7d',
    });
    expect(verifyToken(noSub)).toBeNull();
  });
});
