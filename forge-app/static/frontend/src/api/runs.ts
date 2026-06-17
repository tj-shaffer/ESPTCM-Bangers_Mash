/** Runs / execution / reporting hooks — TanStack Query over the `run.*`,
 *  `exec.*`, and `report.*` resolver endpoints. */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeResolver } from './client';
import type {
  AddAttachmentInput,
  AttachmentContent,
  CreateDefectInput,
  CreatePackageInput,
  CreateRunInput,
  DashboardData,
  DashboardFilters,
  ExecutionDetail,
  PackageDetail,
  PackageSummary,
  ReportRow,
  RunStage,
  SignOffInput,
  StepResultPatch,
  TestRunDetail,
  TestRunSummary,
  UpdateRunInput,
} from '../domain/types';

const keys = {
  runs: ['runs'] as const,
  run: (id: string) => ['run', id] as const,
  exec: (id: string) => ['exec', id] as const,
  packages: ['packages'] as const,
  package: (id: string) => ['package', id] as const,
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

export function useUpdateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateRunInput }) =>
      invokeResolver<TestRunDetail>('run.update', { ...vars }),
    onSuccess: (run) => {
      qc.setQueryData(keys.run(run.id), run);
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.packages });
    },
  });
}

export function useDeleteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<{ deleted: boolean }>('run.delete', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.packages });
      qc.invalidateQueries({ queryKey: keys.dashboard });
    },
  });
}

export function useSetRunStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; stage: RunStage }) =>
      invokeResolver<TestRunDetail>('run.setStage', { ...vars }),
    onSuccess: (run) => {
      qc.setQueryData(keys.run(run.id), run);
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.packages });
    },
  });
}

export function useSignOffRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string } & SignOffInput) => invokeResolver<TestRunDetail>('run.signOff', { ...vars }),
    onSuccess: (run) => {
      qc.setQueryData(keys.run(run.id), run);
      qc.invalidateQueries({ queryKey: keys.runs });
      qc.invalidateQueries({ queryKey: keys.packages });
    },
  });
}

// ---------- packages ----------

export function usePackages() {
  return useQuery({
    queryKey: keys.packages,
    queryFn: () => invokeResolver<PackageSummary[]>('package.list'),
  });
}

export function usePackage(id: string | null) {
  return useQuery({
    queryKey: keys.package(id ?? ''),
    queryFn: () => invokeResolver<PackageDetail | null>('package.get', { id }),
    enabled: !!id,
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePackageInput) => invokeResolver<PackageDetail>('package.create', { ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.packages });
      qc.invalidateQueries({ queryKey: keys.runs });
    },
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<{ deleted: boolean }>('package.delete', { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.packages });
      qc.invalidateQueries({ queryKey: keys.runs });
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

export function useAddAttachment(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddAttachmentInput) => invokeResolver<ExecutionDetail>('exec.addAttachment', { ...input }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
    },
  });
}

export function useDeleteAttachment(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => invokeResolver<ExecutionDetail>('exec.deleteAttachment', { id }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
    },
  });
}

/** Fetch an attachment's content (base64) on demand — for preview/download. */
export function fetchAttachment(id: string): Promise<AttachmentContent | null> {
  return invokeResolver<AttachmentContent | null>('attachment.get', { id });
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

/** Manually link an EXISTING Jira issue key to a defect (no ticket created). */
export function useLinkDefectJiraManual(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { defectId: string; jiraIssueKey: string }) =>
      invokeResolver<ExecutionDetail>('defect.linkJira', { id: vars.defectId, jiraIssueKey: vars.jiraIssueKey }),
    onSuccess: (exec) => {
      qc.setQueryData(keys.exec(exec.id), exec);
      qc.invalidateQueries({ queryKey: keys.run(runId) });
    },
  });
}

export function useDashboard(filters: DashboardFilters = {}, projectKey?: string) {
  return useQuery({
    queryKey: [...keys.dashboard, projectKey ?? 'all', filters],
    queryFn: () => invokeResolver<DashboardData>('report.dashboard', { projectKey, filters }),
    placeholderData: keepPreviousData,
  });
}

/** Fetch the per-execution detail rows for the current filter scope (for export). */
export function fetchReport(filters: DashboardFilters = {}, projectKey?: string): Promise<ReportRow[]> {
  return invokeResolver<ReportRow[]>('report.export', { projectKey, filters });
}
