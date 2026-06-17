/**
 * Forge resolver — the backend for the Forge-native demo build.
 *
 * Architecture note: the original design proxied every call to an Azure API
 * (shared-secret pass-through). For the Forge-native demo we removed that hop —
 * the resolver now owns the backend logic and talks to a swappable
 * `TestCaseStore` (in-memory seed today; Forge SQL next). See the memory note
 * "forge-native-pivot" and DECISIONS.md. The frontend still calls everything
 * through `@forge/bridge` invoke(), so the production seam is preserved.
 */

import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { getStore } from './data/store';
import type {
  CreateFolderInput,
  CreateTestCaseInput,
  ImportedCaseRow,
  UpdateTestCaseInput,
} from './domain/types';

interface ForgeUserContext {
  accountId: string | null;
  displayName: string | null;
  role: string | null;
  currentIssueKey: string | null;
}

const resolver = new Resolver();

/**
 * `getContext` — invoked by the frontend on mount to bootstrap AuthContext.
 */
resolver.define('getContext', async ({ context }): Promise<ForgeUserContext> => {
  const accountId = context.accountId ?? null;
  const issueKey =
    (context.extension as { issue?: { key?: string } } | undefined)?.issue?.key ?? null;

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

  // Forge mode is a demo surface (the pilot ships on web/Vercel); grant the
  // embedded Jira user authoring access so affordances render.
  return { accountId, displayName, role: 'TEST_MANAGER', currentIssueKey: issueKey };
});

function requireAccountId(context: { accountId?: string }): string {
  const accountId = context.accountId;
  if (!accountId) throw new Error('Missing accountId in Forge context');
  return accountId;
}

// ---------- Repository: folders ----------

resolver.define('repo.getFolderTree', async ({ payload }) => {
  const { projectKey } = (payload ?? {}) as { projectKey?: string };
  return getStore().getFolderTree(projectKey);
});

resolver.define('repo.createFolder', async ({ payload }) => {
  const input = (payload ?? {}) as CreateFolderInput;
  if (!input.name || !input.name.trim()) throw new Error('Folder name is required');
  return getStore().createFolder(input);
});

// ---------- Repository: test cases ----------

resolver.define('repo.listCases', async ({ payload }) => {
  const { folderId } = (payload ?? {}) as { folderId?: string };
  return getStore().listCases(folderId);
});

resolver.define('repo.getCase', async ({ payload }) => {
  const { id } = (payload ?? {}) as { id?: string };
  if (!id) throw new Error('Test case id is required');
  return getStore().getCase(id);
});

resolver.define('repo.createCase', async ({ payload, context }) => {
  const input = (payload ?? {}) as CreateTestCaseInput;
  if (!input.folderId) throw new Error('folderId is required');
  if (!input.title || !input.title.trim()) throw new Error('Title is required');
  return getStore().createCase(input, requireAccountId(context));
});

resolver.define('repo.updateCase', async ({ payload }) => {
  const { id, patch } = (payload ?? {}) as { id?: string; patch?: UpdateTestCaseInput };
  if (!id) throw new Error('Test case id is required');
  const updated = await getStore().updateCase(id, patch ?? {});
  if (!updated) throw new Error(`Test case ${id} not found`);
  return updated;
});

resolver.define('repo.deleteCase', async ({ payload }) => {
  const { id } = (payload ?? {}) as { id?: string };
  if (!id) throw new Error('Test case id is required');
  return { deleted: await getStore().deleteCase(id) };
});

resolver.define('repo.duplicateCase', async ({ payload }) => {
  const { id } = (payload ?? {}) as { id?: string };
  if (!id) throw new Error('Test case id is required');
  const copy = await getStore().duplicateCase(id);
  if (!copy) throw new Error(`Test case ${id} not found`);
  return copy;
});

resolver.define('repo.importCases', async ({ payload, context }) => {
  const { folderId, rows } = (payload ?? {}) as { folderId?: string; rows?: ImportedCaseRow[] };
  if (!folderId) throw new Error('folderId is required');
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to import');
  return getStore().importCases(folderId, rows, requireAccountId(context));
});

export const handler = resolver.getDefinitions();
