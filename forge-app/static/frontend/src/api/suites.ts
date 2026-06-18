/**
 * Suite data hooks — TanStack Query over the resolver `suite.*` endpoints.
 * A suite is a reusable, named, cross-folder set of test cases you can re-run.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type { CreateSuiteInput, SuiteDetail, SuiteSummary, UpdateSuiteInput } from '../domain/types';

const keys = {
  suites: ['suites'] as const,
  suite: (id: string) => ['suite', id] as const,
};

export function useSuites() {
  return useQuery({
    queryKey: keys.suites,
    queryFn: () => invokeResolver<SuiteSummary[]>('suite.list'),
  });
}

export function useSuite(id: string | null) {
  return useQuery({
    queryKey: keys.suite(id ?? ''),
    queryFn: () => invokeResolver<SuiteDetail | null>('suite.get', { id }),
    enabled: !!id,
  });
}

export function useCreateSuite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSuiteInput) => invokeResolver<SuiteDetail>('suite.create', { ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suites }),
  });
}

export function useUpdateSuite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateSuiteInput }) =>
      invokeResolver<SuiteDetail>('suite.update', { ...vars }),
    onSuccess: (suite) => {
      qc.setQueryData(keys.suite(suite.id), suite);
      qc.invalidateQueries({ queryKey: keys.suites });
    },
  });
}

export function useDeleteSuite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<{ deleted: boolean }>('suite.delete', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.suites }),
  });
}
