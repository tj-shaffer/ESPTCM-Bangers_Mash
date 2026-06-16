/**
 * Pilot auth: a single shared password unlocks the app. On success the server
 * issues a short-lived JWT the frontend stores and sends as a Bearer token.
 * Not per-user auth — that comes with the production build.
 */

import { timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { loadConfig } from './config';

const SUBJECT = 'pilot-user';
const TTL = '7d';

export function passwordMatches(candidate: string): boolean {
  const expected = loadConfig().password;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function issueToken(): string {
  return jwt.sign({ sub: SUBJECT }, loadConfig().authSecret, { expiresIn: TTL });
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
