/**
 * Atlassian OAuth (3LO) login routes — "Log in with Atlassian".
 *
 *   GET /api/auth/login     -> 302 to Atlassian consent (signed `state`)
 *   GET /api/auth/callback  -> verify state, exchange code, upsert user,
 *                              mint a session JWT, 302 back to the app with
 *                              `#token=<jwt>` in the fragment.
 *
 * Mounted only when Atlassian OAuth is configured; otherwise the app stays on
 * the shared-password gate. See DECISIONS.md ADR-007.
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../lib/config';
import { issueToken, signState, verifyState } from '../lib/auth';
import { authorizeUrl, exchangeCode, fetchMe } from '../lib/oauth';
import { upsertUserRole } from '../lib/identity';

export const authRouter = Router();

authRouter.get('/login', (_req: Request, res: Response) => {
  res.redirect(authorizeUrl(signState()));
});

authRouter.get('/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const appBaseUrl = loadConfig().appBaseUrl;

  if (!code || !state || !verifyState(state)) {
    res.redirect(`${appBaseUrl}/#error=auth_failed`);
    return;
  }

  try {
    const accessToken = await exchangeCode(code);
    const me = await fetchMe(accessToken);
    await upsertUserRole({ accountId: me.accountId, displayName: me.name, email: me.email });
    const token = issueToken(me.accountId, me.name);
    res.redirect(`${appBaseUrl}/#token=${encodeURIComponent(token)}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/callback] error', err);
    res.redirect(`${appBaseUrl}/#error=auth_failed`);
  }
});
