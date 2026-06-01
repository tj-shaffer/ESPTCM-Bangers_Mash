/**
 * Forge resolver — the only place that bridges the Custom UI iframe and the
 * Azure backend. The shared internal secret is attached HERE, never in the
 * browser (see CLAUDE.md / DECISIONS.md ADR-002).
 *
 * The frontend calls these via `@forge/bridge` `invoke(<key>, payload)`.
 */

import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';

interface ApiCallPayload {
  /** e.g. "/test-cases", "/health". The "/api/v1" prefix is added here. */
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Optional query string already encoded (e.g. "?status=ACTIVE&page=1"). */
  query?: string;
}

interface ForgeUserContext {
  accountId: string | null;
  displayName: string | null;
  currentIssueKey: string | null;
}

const resolver = new Resolver();

/**
 * `getContext` — invoked by the frontend on mount to bootstrap AuthContext.
 * Returns the Atlassian accountId, displayName, and (if rendered inside a
 * jira:issuePanel) the current issue key.
 */
resolver.define('getContext', async ({ context }): Promise<ForgeUserContext> => {
  const accountId = context.accountId ?? null;
  const issueKey = (context.extension as { issue?: { key?: string } } | undefined)?.issue?.key ?? null;

  let displayName: string | null = null;
  if (accountId) {
    try {
      const resp = await api
        .asApp()
        .requestJira(route`/rest/api/3/user?accountId=${accountId}`, {
          headers: { Accept: 'application/json' },
        });
      if (resp.ok) {
        const user = (await resp.json()) as { displayName?: string };
        displayName = user.displayName ?? null;
      }
    } catch (err) {
      console.warn('[resolver:getContext] failed to resolve displayName', err);
    }
  }

  return { accountId, displayName, currentIssueKey: issueKey };
});

/**
 * `apiCall` — generic pass-through to the Azure backend. The shared secret
 * and accountId are attached here. The frontend never sees the secret.
 */
resolver.define('apiCall', async ({ payload, context }): Promise<unknown> => {
  const { path, method = 'GET', body, query = '' } = (payload ?? {}) as ApiCallPayload;
  if (!path || !path.startsWith('/')) {
    throw new Error('apiCall: `path` must start with "/"');
  }

  const backend = process.env.TESTFORGE_API_BASE_URL;
  const secret = process.env.TESTFORGE_INTERNAL_SECRET;
  if (!backend || !secret) {
    throw new Error(
      'Resolver misconfigured: TESTFORGE_API_BASE_URL and TESTFORGE_INTERNAL_SECRET must be set ' +
        '(use `forge variables set` to provision them).',
    );
  }

  const accountId = context.accountId;
  if (!accountId) {
    throw new Error('apiCall: missing accountId in Forge context');
  }

  const url = `${backend.replace(/\/$/, '')}/api/v1${path}${query}`;
  const resp = await api.fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-testforge-internal-secret': secret,
      'x-atlassian-account-id': accountId,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Backend ${method} ${path} failed: ${resp.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
});

export const handler = resolver.getDefinitions();
