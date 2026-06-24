/**
 * Backend client with two interchangeable modes (same invokeResolver API):
 *
 *   - WEB (VITE_API_MODE=web): HTTP to the Express/Neon API at /api/invoke,
 *     Bearer-token auth (the Vercel deployment). This is the pilot.
 *   - STANDALONE (anything else, e.g. `npm run dev`): the in-browser mock store
 *     — a full offline build of the product (Repository, Pipeline, Dashboard,
 *     Users & Roles) with no backend (see mock/mockInvoke.ts).
 *
 * DEMO mode (see below) forces STANDALONE at runtime even in a `web` build, so
 * one deployment can serve the marketing landing, a live demo, and real sign-in.
 *
 * The legacy Forge-bridge mode was removed with the rest of the Forge layer
 * (DECISIONS.md ADR-009); the app is a standalone web app, not a Forge app.
 */

import { mockInvoke } from '../mock/mockInvoke';

const BUILD_WEB = import.meta.env.VITE_API_MODE === 'web';
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// ---------- demo mode (runtime mock toggle) ----------
// A `web` build normally talks to the real API. The public marketing site needs
// a no-signup "live demo" from that SAME deployment, so a runtime flag forces
// the in-browser mock even in a web build. It's set by the landing page's
// "Try the live demo" button (enterDemo) or a ?demo=1 / #demo link, and kept for
// the browser session.
const DEMO_FLAG_KEY = 'tf_demo';

function readDemoFlag(): boolean {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const wantsDemo = new URLSearchParams(window.location.search).get('demo') === '1' || hash === 'demo';
    if (wantsDemo) sessionStorage.setItem(DEMO_FLAG_KEY, '1');
    return sessionStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

const DEMO = readDemoFlag();
const WEB = BUILD_WEB && !DEMO;

export const STANDALONE = !WEB;
export const WEB_MODE = WEB;
export const DEMO_MODE = DEMO;

/** Enter the live demo: force mock mode for this session and reload into the app. */
export function enterDemo(): void {
  try {
    sessionStorage.setItem(DEMO_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
  window.location.hash = '';
  window.location.reload();
}

/** Leave the demo and return to the marketing landing / sign-in. */
export function exitDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_FLAG_KEY);
  } catch {
    /* ignore */
  }
  window.location.hash = '';
  window.location.reload();
}

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

// Super-admin "view as" — sent as a header so the server gates as that role
// (downgrade-only; the backend honors it only when the real role is SUPER_ADMIN).
let clientViewAs: string | null = null;
export function setClientViewAs(role: string | null): void {
  clientViewAs = role;
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
      ...(clientViewAs ? { 'x-testforge-view-as': clientViewAs } : {}),
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
