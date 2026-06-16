/**
 * Bearer-token gate for the pilot. Reads `Authorization: Bearer <jwt>`,
 * verifies it, and sets req.accountId. 401 otherwise.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/auth';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1];
  const accountId = token ? verifyToken(token) : null;

  if (!accountId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.accountId = accountId;
  next();
}
