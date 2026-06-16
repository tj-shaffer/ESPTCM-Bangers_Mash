/** Runs / execution / reporting hooks — TanStack Query over the `run.*`,
 *  `exec.*`, and `report.*` resolver endpoints. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type {
  CreateDefectInput,
  CreateRunInput,
  DashboardData,
  ExecutionDetail,
  StepResultPatch,
  TestRunDetail,
  TestRunSummary,
} from '../domain/types';

const keys = {
  runs: ['runs'] as const,
  run: (id: string) => ['run', id] as const,
  exec: (id: string) => ['exec', id] as const,
  dashboard: ['dashboard'] as const,
};

export function useRuns() {
  return useQuery({
    queryKey: keys.runs,
    queryFn: () => invokeResolver<TestRunSummary[]>('run.list'),
  });
}

export function useRun(id: string | null) {
  return useQuery({
    queryKey: keys.run(id ?? ''),
    queryFn: () => invokeResolver<TestRunDetail | null>('run.get', { id }),
    enabled: !!id,
  });
}

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) => invokeResolver<TestRunDetail>('run.create', { ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<{ deleted: boolean }>('run.delete', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useExecution(id: string | null) {
  return useQuery({
    queryKey: keys.exec(id ?? ''),
    queryFn: () => invokeResolver<ExecutionDetail | null>('exec.get', { id }),
    enabled: !!id,
  });
}

export function useSetStepResult(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { executionId: string; stepResultId: string; patch: StepResultPatch }) =>
      invokeResolver<ExecutionDetail>('exec.setStep', { ...vars }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useCompleteExecution(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<ExecutionDetail>('exec.complete', { id }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useCreateDefect(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { executionId: string; input: CreateDefectInput }) =>
      invokeResolver<ExecutionDetail>('defect.create', { ...vars }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useJiraOptions() {
  return useQuery({
    queryKey: ['jiraOptions'],
    queryFn: () => invokeResolver<{ configured: boolean; issueTypes: string[] }>('jira.options'),
    staleTime: 5 * 60_000,
  });
}

export function useLinkDefectToJira(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { defectId: string; issueType?: string }) =>
      invokeResolver<ExecutionDetail>('defect.toJira', { id: vars.defectId, issueType: vars.issueType }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => invokeResolver<DashboardData>('report.dashboard'),
  });
}
