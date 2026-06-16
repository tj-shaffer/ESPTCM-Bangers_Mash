/**
 * Resolver-style dispatch: maps an invoke `key` + `payload` to a store call.
 * The frontend posts {key, payload} to /api/invoke; this mirrors the keys the
 * Forge resolver and the in-browser mock handle, so all three backends are
 * interchangeable behind the same frontend.
 */

import type { TestCaseStore } from './store';
import { jiraCheck } from '../services/jira';
import type {
  CreateDefectInput,
  CreateFolderInput,
  CreateRunInput,
  CreateTestCaseInput,
  ImportedCaseRow,
  StepResultPatch,
  UpdateTestCaseInput,
} from '../domain/types';

export class DispatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}

export async function dispatch(
  store: TestCaseStore,
  key: string,
  payload: Record<string, unknown>,
  accountId: string,
): Promise<unknown> {
  switch (key) {
    case 'getContext':
      return { accountId, displayName: 'Pilot User', currentIssueKey: null };

    case 'repo.getFolderTree':
      return store.getFolderTree(payload.projectKey as string | undefined);

    case 'repo.createFolder': {
      const input = payload as unknown as CreateFolderInput;
      if (!input.name || !input.name.trim()) throw new DispatchError('Folder name is required');
      return store.createFolder(input);
    }

    case 'repo.listCases':
      return store.listCases(payload.folderId as string | undefined);

    case 'repo.getCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      return store.getCase(id);
    }

    case 'repo.createCase': {
      const input = payload as unknown as CreateTestCaseInput;
      if (!input.folderId) throw new DispatchError('folderId is required');
      if (!input.title || !input.title.trim()) throw new DispatchError('Title is required');
      return store.createCase(input, accountId);
    }

    case 'repo.updateCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      const updated = await store.updateCase(id, (payload.patch ?? {}) as UpdateTestCaseInput);
      if (!updated) throw new DispatchError(`Test case ${id} not found`, 404);
      return updated;
    }

    case 'repo.deleteCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      return { deleted: await store.deleteCase(id) };
    }

    case 'repo.duplicateCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      const copy = await store.duplicateCase(id);
      if (!copy) throw new DispatchError(`Test case ${id} not found`, 404);
      return copy;
    }

    case 'repo.importCases': {
      const folderId = payload.folderId as string | undefined;
      const rows = payload.rows as ImportedCaseRow[] | undefined;
      if (!folderId) throw new DispatchError('folderId is required');
      if (!Array.isArray(rows) || rows.length === 0) throw new DispatchError('No rows to import');
      return store.importCases(folderId, rows, accountId);
    }

    // ---------- runs / execution / reporting ----------

    case 'run.list':
      return store.listRuns(payload.projectKey as string | undefined);

    case 'run.create': {
      const input = payload as unknown as CreateRunInput;
      if (!input.name || !input.name.trim()) throw new DispatchError('Run name is required');
      if (!Array.isArray(input.testCaseIds) || input.testCaseIds.length === 0) {
        throw new DispatchError('Select at least one test case');
      }
      return store.createRun(input, accountId);
    }

    case 'run.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Run id is required');
      return store.getRun(id);
    }

    case 'run.delete': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Run id is required');
      return { deleted: await store.deleteRun(id) };
    }

    case 'exec.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Execution id is required');
      return store.getExecution(id);
    }

    case 'exec.setStep': {
      const { executionId, stepResultId, patch } = payload as {
        executionId?: string;
        stepResultId?: string;
        patch?: StepResultPatch;
      };
      if (!executionId || !stepResultId) throw new DispatchError('executionId and stepResultId are required');
      const updated = await store.setStepResult(executionId, stepResultId, patch ?? {});
      if (!updated) throw new DispatchError('Execution not found', 404);
      return updated;
    }

    case 'exec.complete': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Execution id is required');
      const done = await store.completeExecution(id, accountId);
      if (!done) throw new DispatchError('Execution not found', 404);
      return done;
    }

    case 'defect.create': {
      const { executionId, input } = payload as { executionId?: string; input?: CreateDefectInput };
      if (!executionId) throw new DispatchError('executionId is required');
      if (!input?.summary || !input.summary.trim()) throw new DispatchError('Defect summary is required');
      const res = await store.createDefect(executionId, input, accountId);
      if (!res) throw new DispatchError('Execution not found', 404);
      return res;
    }

    case 'jira.check':
      return jiraCheck();

    case 'report.dashboard':
      return store.getDashboard(payload.projectKey as string | undefined);

    default:
      throw new DispatchError(`Unknown invoke key "${key}"`, 404);
  }
}
