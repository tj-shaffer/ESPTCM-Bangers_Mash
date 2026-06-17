/**
 * Backend client with three interchangeable modes (same invokeResolver API):
 *
 *   - WEB (VITE_API_MODE=web): HTTP to the Express/Neon API at /api/invoke,
 *     Bearer-token auth (the Vercel deployment). This is the pilot.
 *   - STANDALONE (opened directly in a browser tab, no Jira, not web): the
 *     in-browser mock store — UI demo with no backend.
 *   - FORGE (inside a Jira iframe): @forge/bridge invoke() → resolver.
 *
 * @forge/bridge is imported lazily and only in FORGE mode (importing it in a
 * plain tab can crash the app).
 */

import { mockInvoke } from '../mock/mockInvoke';

const WEB = import.meta.env.VITE_API_MODE === 'web';
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

function isStandalone(): boolean {
  try {
    return typeof window !== 'undefined' && window.self === window.top;
  } catch {
    return false;
  }
}

export const STANDALONE = isStandalone() && !WEB;
export const WEB_MODE = WEB;
// OAuth ("Log in with Atlassian") is the default in web mode; set
// VITE_OAUTH_ENABLED=false to hide the button and use only the password gate.
export const OAUTH_ENABLED = WEB && import.meta.env.VITE_OAUTH_ENABLED !== 'false';

// ---------- token + auth (web mode) ----------

const TOKEN_KEY = 'tf_token';

/**
 * After an Atlassian OAuth round-trip the API redirects back with the session
 * token in the URL fragment (`#token=…`). Capture it once on load, persist it,
 * and scrub the fragment so it isn't left in history. Returns true if a token
 * was captured this load.
 */
export function captureTokenFromHash(): boolean {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    if (token) {
      setToken(token);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Send the browser to the Atlassian consent screen. */
export function loginWithAtlassian(): void {
  window.location.href = `${API_BASE}/api/auth/login`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
export function hasToken(): boolean {
  return !!getToken();
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/** POST the shared password; on success stores the token and returns true. */
export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { token?: string };
  if (!data.token) return false;
  setToken(data.token);
  return true;
}

async function httpInvoke<T>(key: string, payload: Record<string, unknown>): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/invoke`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ key, payload }),
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new UnauthorizedError();
  }
  const text = await res.text();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- Forge bridge (lazy) ----------

type InvokeFn = <T>(key: string, payload?: unknown) => Promise<T>;
let invokePromise: Promise<InvokeFn> | null = null;
function getBridgeInvoke(): Promise<InvokeFn> {
  if (!invokePromise) {
    invokePromise = import('@forge/bridge').then((m) => m.invoke as unknown as InvokeFn);
  }
  return invokePromise;
}

export async function invokeResolver<T>(key: string, payload?: Record<string, unknown>): Promise<T> {
  if (WEB) return httpInvoke<T>(key, payload ?? {});
  if (STANDALONE) return mockInvoke<T>(key, payload ?? {});
  const invoke = await getBridgeInvoke();
  return invoke<T>(key, payload ?? {});
}
