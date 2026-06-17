import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password';

describe('password hashing', () => {
  it('verifies a correct password against its own hash', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects an incorrect password', () => {
    const hash = hashPassword('s3cret-pw');
    expect(verifyPassword('wrong-pw', hash)).toBe(false);
  });

  it('produces a salted scrypt$salt$hash format with a unique salt per call', () => {
    const a = hashPassword('same-input');
    const b = hashPassword('same-input');
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(a.split('$')).toHaveLength(3);
    // Salting means identical inputs hash differently, but both still verify.
    expect(a).not.toBe(b);
    expect(verifyPassword('same-input', a)).toBe(true);
    expect(verifyPassword('same-input', b)).toBe(true);
  });

  it('returns false (never throws) for null/empty/malformed stored values', () => {
    expect(verifyPassword('x', null)).toBe(false);
    expect(verifyPassword('x', undefined)).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false);
    expect(verifyPassword('x', 'bcrypt$salt$hash')).toBe(false); // wrong prefix
    expect(verifyPassword('x', 'scrypt$onlytwo')).toBe(false);
  });
});
