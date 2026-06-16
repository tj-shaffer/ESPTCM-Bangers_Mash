/**
 * Thin wrapper over `@forge/bridge` invoke().
 *
 * Inside Jira: frontend → invoke(<resolverKey>) → resolver (forge-app/src/index.ts).
 * Opened directly in a browser (no Jira iframe, so no Forge bridge): calls are
 * served by the in-browser mock store, so the whole UI can be previewed/demoed
 * with zero Jira. See src/mock/mockInvoke.ts.
 *
 * IMPORTANT: `@forge/bridge` is imported lazily (dynamic import) and ONLY when
 * embedded in Jira. Importing it at module top-level in a standalone browser
 * tab can throw during its init (it expects the Forge host frame), which would
 * crash the entire app to a blank white page. The dynamic import keeps it out
 * of the standalone code path entirely.
 */

import { mockInvoke } from '../mock/mockInvoke';

/**
 * Custom UI runs inside a Jira iframe (window.self !== window.top). When the
 * built app is opened directly in a browser tab it is top-level — that's our
 * signal that there is no Forge host and we should use the mock.
 */
function isStandalone(): boolean {
  try {
    return typeof window !== 'undefined' && window.self === window.top;
  } catch {
    // Cross-origin access to window.top throws → we ARE framed (inside Jira).
    return false;
  }
}

export const STANDALONE = isStandalone();

type InvokeFn = <T>(key: string, payload?: unknown) => Promise<T>;

let invokePromise: Promise<InvokeFn> | null = null;
function getBridgeInvoke(): Promise<InvokeFn> {
  if (!invokePromise) {
    invokePromise = import('@forge/bridge').then((m) => m.invoke as unknown as InvokeFn);
  }
  return invokePromise;
}

export async function invokeResolver<T>(key: string, payload?: Record<string, unknown>): Promise<T> {
  if (STANDALONE) return mockInvoke<T>(key, payload ?? {});
  const invoke = await getBridgeInvoke();
  return invoke<T>(key, payload ?? {});
}
