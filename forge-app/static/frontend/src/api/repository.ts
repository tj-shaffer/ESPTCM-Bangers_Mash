/**
 * Repository data hooks — TanStack Query over the resolver `repo.*` endpoints.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type {
  CreateFolderInput,
  CreateTestCaseInput,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  JiraIssueSummary,
  TestCase,
  TestCaseSummary,
  TestFolder,
  UpdateTestCaseInput,
} from '../domain/types';

/** Search Jira issues to link to a test case (empty query → no results). */
export function searchJiraIssues(query: string): Promise<JiraIssueSummary[]> {
  return invokeResolver<JiraIssueSummary[]>('jira.search', { query });
}

const keys = {
  tree: (projectKey?: string) => ['repo', 'folderTree', projectKey ?? 'default'] as const,
  cases: (folderId?: string) => ['repo', 'cases', folderId ?? 'all'] as const,
  case: (id: string) => ['repo', 'case', id] as const,
  projects: ['meta', 'projects'] as const,
};

export function useFolderTree(projectKey?: string) {
  return useQuery({
    queryKey: keys.tree(projectKey),
    queryFn: () => invokeResolver<FolderNode[]>('repo.getFolderTree', projectKey ? { projectKey } : {}),
  });
}

/** Distinct Jira project keys (for the dashboard project filter). */
export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => invokeResolver<string[]>('meta.projects'),
    staleTime: 5 * 60_000,
  });
}

export function useCases(folderId?: string) {
  return useQuery({
    queryKey: keys.cases(folderId),
    queryFn: () => invokeResolver<TestCaseSummary[]>('repo.listCases', { folderId }),
    enabled: folderId !== undefined,
  });
}

export function useCase(id: string | null) {
  return useQuery({
    queryKey: keys.case(id ?? ''),
    queryFn: () => invokeResolver<TestCase | null>('repo.getCase', { id }),
    enabled: !!id,
  });
}

export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFolderInput) =>
      invokeResolver<TestFolder>('repo.createFolder', { ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repo', 'folderTree'] }),
  });
}

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestCaseInput) =>
      invokeResolver<TestCase>('repo.createCase', { ...input }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['repo', 'folderTree'] });
      qc.invalidateQueries({ queryKey: keys.cases(created.folderId) });
    },
  });
}

export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTestCaseInput }) =>
      invokeResolver<TestCase>('repo.updateCase', { id, patch }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: keys.case(updated.id) });
      qc.invalidateQueries({ queryKey: keys.cases(updated.folderId) });
    },
  });
}

export function useDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<{ deleted: boolean }>('repo.deleteCase', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repo', 'cases'] });
      qc.invalidateQueries({ queryKey: ['repo', 'folderTree'] });
    },
  });
}

export function useDuplicateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<TestCase>('repo.duplicateCase', { id }),
    onSuccess: (copy) => {
      qc.invalidateQueries({ queryKey: keys.cases(copy.folderId) });
      qc.invalidateQueries({ queryKey: ['repo', 'folderTree'] });
    },
  });
}

export function useImportCases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, rows }: { folderId: string; rows: ImportedCaseRow[] }) =>
      invokeResolver<ImportResult>('repo.importCases', { folderId, rows }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: keys.cases(vars.folderId) });
      qc.invalidateQueries({ queryKey: ['repo', 'folderTree'] });
    },
  });
}
