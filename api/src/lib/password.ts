/**
 * Password hashing for app-managed accounts. Uses Node's built-in scrypt
 * (node:crypto) — no external dependency, consistent with the repo's
 * native-fetch / minimal-deps stance.
 *
 * Stored format: "scrypt$<saltHex>$<hashHex>". Verification is constant-time.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;
const SALT_BYTES = 16;
const PREFIX = 'scrypt';

/** Hash a plaintext password for storage. */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(plain, salt, KEYLEN);
  return `${PREFIX}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored hash. Returns false for any
 * malformed/empty stored value (e.g. a not-yet-provisioned account) rather than
 * throwing, so callers can treat it as a plain auth failure.
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(plain, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
