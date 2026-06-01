/**
 * Frontend → backend API client.
 *
 * All calls go through the Forge resolver via `@forge/bridge` `invoke()`:
 *   frontend  →  invoke('apiCall', {...})  →  resolver  →  Azure API
 *
 * The shared internal secret is attached IN THE RESOLVER (see
 * forge-app/src/index.ts). It must never appear in this file or anywhere
 * else in the browser bundle (DECISIONS.md ADR-002).
 */

import { invoke } from '@forge/bridge';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiCallArgs {
  path: string;
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function encodeQuery(q: ApiCallArgs['query']): string {
  if (!q) return '';
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

async function call<T>(args: ApiCallArgs): Promise<T> {
  return (await invoke('apiCall', {
    path: args.path,
    method: args.method ?? 'GET',
    body: args.body,
    query: encodeQuery(args.query),
  })) as T;
}

export const apiClient = {
  get<T>(path: string, query?: ApiCallArgs['query']): Promise<T> {
    return call<T>({ path, method: 'GET', query });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return call<T>({ path, method: 'POST', body });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return call<T>({ path, method: 'PUT', body });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return call<T>({ path, method: 'PATCH', body });
  },
  del<T = void>(path: string): Promise<T> {
    return call<T>({ path, method: 'DELETE' });
  },
};
