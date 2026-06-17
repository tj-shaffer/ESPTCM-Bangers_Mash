/**
 * Session tokens for the pilot.
 *
 * Identity is acquired one of two ways and both converge here: the primary path
 * is Atlassian OAuth (the resolved account_id), and a shared-password path
 * remains as break-glass. Either way we mint our own short-lived session JWT
 * the frontend stores and sends as a Bearer token; `req.accountId` downstream
 * is the JWT subject. Swapping in Azure/Entra later is just another caller of
 * `issueToken` — the rest of the stack is identity-provider-agnostic.
 */

import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from './config';

const TTL = '7d';
// Short-lived signed value guarding the OAuth round-trip against CSRF.
const STATE_TTL = '10m';

export function passwordMatches(candidate: string): boolean {
  const expected = loadConfig().password;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Mint a session token for a resolved identity. */
export function issueToken(accountId: string, displayName?: string): string {
  return jwt.sign({ sub: accountId, name: displayName }, loadConfig().authSecret, {
    expiresIn: TTL,
  });
}

/** Returns the account id (subject) if the token is valid, else null. */
export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, loadConfig().authSecret);
    if (typeof decoded === 'object' && decoded && typeof decoded.sub === 'string') {
      return decoded.sub;
    }
    return null;
  } catch {
    return null;
  }
}

/** Sign a short-lived OAuth `state` so the callback can prove it issued it. */
export function signState(): string {
  return jwt.sign({ k: 'oauth-state' }, loadConfig().authSecret, { expiresIn: STATE_TTL });
}

/** Verify a `state` value returned by the OAuth callback. */
export function verifyState(state: string): boolean {
  try {
    const decoded = jwt.verify(state, loadConfig().authSecret);
    return typeof decoded === 'object' && decoded !== null && decoded.k === 'oauth-state';
  } catch {
    return false;
  }
}
