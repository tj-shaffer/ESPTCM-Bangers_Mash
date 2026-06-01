/**
 * Global error handler. Never leak stack traces to clients in production;
 * always log the full error server-side.
 */

import type { Request, Response, NextFunction } from 'express';

export interface HttpError extends Error {
  status?: number;
  expose?: boolean;
}

export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  // The 4-arg signature is what marks this as Express's error handler — keep
  // `next` even though we don't call it.
  _next: NextFunction,
): void {
  const status = typeof err.status === 'number' ? err.status : 500;

  // eslint-disable-next-line no-console
  console.error('[error]', req.method, req.originalUrl, err);

  const isProd = process.env.NODE_ENV === 'production';
  const message =
    err.expose && err.message ? err.message : isProd ? 'Internal Server Error' : err.message;

  res.status(status).json({ error: message });
}
