/**
 * Session tokens for the pilot.
 *
 * Authentication is app-managed email + password (see lib/identity.ts and
 * routes/invoke.ts). On a successful login we mint our own short-lived session
 * JWT the frontend stores and sends as a Bearer token; `req.accountId`
 * downstream is the JWT subject. Swapping in Azure/Entra later is just another
 * caller of `issueToken` — the rest of the stack is identity-provider-agnostic.
 */

import jwt from 'jsonwebtoken';
import { loadConfig } from './config';

const TTL = '7d';

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
