/**
 * Backend client with two interchangeable modes (same invokeResolver API):
 *
 *   - WEB (VITE_API_MODE=web): HTTP to the Express/Neon API at /api/invoke,
 *     Bearer-token auth (the Vercel deployment). This is the pilot.
 *   - STANDALONE (anything else, e.g. `npm run dev`): the in-browser mock store
 *     — an offline UI preview with no backend. Note: the mock only implements
 *     the repository (`repo.*`) keys, so standalone mode surfaces just the
 *     Repository view (see App.tsx nav gating + mock/mockInvoke.ts).
 *
 * The legacy Forge-bridge mode was removed with the rest of the Forge layer
 * (DECISIONS.md ADR-009); the app is a standalone web app, not a Forge app.
 */

import { mockInvoke } from '../mock/mockInvoke';

const WEB = import.meta.env.VITE_API_MODE === 'web';
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const STANDALONE = !WEB;
export const WEB_MODE = WEB;

// ---------- token + auth (web mode) ----------

const TOKEN_KEY = 'tf_token';

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

export interface LoginResult {
  ok: boolean;
  mustChangePassword?: boolean;
}

/** POST email + password; on success stores the token. */
export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return { ok: false };
  const data = (await res.json()) as { token?: string; mustChangePassword?: boolean };
  if (!data.token) return { ok: false };
  setToken(data.token);
  return { ok: true, mustChangePassword: !!data.mustChangePassword };
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

export async function invokeResolver<T>(key: string, payload?: Record<string, unknown>): Promise<T> {
  if (WEB) return httpInvoke<T>(key, payload ?? {});
  return mockInvoke<T>(key, payload ?? {});
}
