/**
 * Atlassian OAuth 2.0 (3LO) — "Log in with Atlassian".
 *
 * Thin wrappers over the Atlassian identity endpoints using Node 20's global
 * `fetch` (no SDK, per CLAUDE.md). The flow:
 *   1. authorizeUrl(state)  -> redirect the browser to Atlassian's consent page
 *   2. exchangeCode(code)   -> swap the returned code for an access token
 *   3. fetchMe(accessToken) -> read the user's account_id / email / name
 *
 * `account_id` is the stable Atlassian account id — the same value Jira uses —
 * so it slots directly into UserRole.atlassianAccountId. See DECISIONS.md
 * ADR-007.
 */

import { loadConfig } from './config';

const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const ME_URL = 'https://api.atlassian.com/me';

// Minimal scope: identify the user. No Jira data is read with this token.
const SCOPE = 'read:me';

function oauthCfg() {
  const cfg = loadConfig().atlassianOAuth;
  if (!cfg) throw new Error('Atlassian OAuth is not configured');
  return cfg;
}

/** True when the developer-console app credentials are present. */
export function oauthConfigured(): boolean {
  return loadConfig().atlassianOAuth !== undefined;
}

/** Build the consent-screen URL the browser is redirected to. */
export function authorizeUrl(state: string): string {
  const cfg = oauthCfg();
  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: cfg.clientId,
    scope: SCOPE,
    redirect_uri: cfg.redirectUri,
    state,
    response_type: 'code',
    prompt: 'consent',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCode(code: string): Promise<string> {
  const cfg = oauthCfg();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(`Atlassian token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Atlassian token exchange returned no access_token');
  return data.access_token;
}

export interface AtlassianMe {
  accountId: string;
  email: string | null;
  name: string;
}

/** Read the authenticated user's profile. */
export async function fetchMe(accessToken: string): Promise<AtlassianMe> {
  const res = await fetch(ME_URL, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Atlassian /me failed (${res.status})`);
  }
  const data = (await res.json()) as { account_id?: string; email?: string; name?: string };
  if (!data.account_id) throw new Error('Atlassian /me returned no account_id');
  return {
    accountId: data.account_id,
    email: data.email ?? null,
    name: data.name ?? data.email ?? data.account_id,
  };
}
