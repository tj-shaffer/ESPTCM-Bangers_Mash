/**
 * Data-service interface for the Repository (folders + test cases).
 * The HTTP layer depends only on this interface; `PrismaStore` is the
 * Neon-backed implementation. Mirrors the Forge resolver's TestCaseStore so
 * the same dispatch logic works on either side.
 */

import type {
  CreateDefectInput,
  CreateFolderInput,
  CreateRunInput,
  CreateTestCaseInput,
  DashboardData,
  ExecutionDetail,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  Priority,
  StepResultPatch,
  TestCase,
  TestCaseSummary,
  TestFolder,
  TestRunDetail,
  TestRunSummary,
  UpdateTestCaseInput,
} from '../domain/types';

export interface DefectRecord {
  id: string;
  executionId: string;
  summary: string;
  description?: string;
  severity: Priority;
  jiraIssueKey?: string;
}

export interface TestCaseStore {
  getFolderTree(projectKey?: string): Promise<FolderNode[]>;
  createFolder(input: CreateFolderInput): Promise<TestFolder>;
  listCases(folderId?: string): Promise<TestCaseSummary[]>;
  getCase(id: string): Promise<TestCase | null>;
  createCase(input: CreateTestCaseInput, ownerAccountId: string): Promise<TestCase>;
  updateCase(id: string, patch: UpdateTestCaseInput): Promise<TestCase | null>;
  deleteCase(id: string): Promise<boolean>;
  duplicateCase(id: string): Promise<TestCase | null>;
  importCases(folderId: string, rows: ImportedCaseRow[], ownerAccountId: string): Promise<ImportResult>;

  // runs / execution / reporting
  listRuns(projectKey?: string): Promise<TestRunSummary[]>;
  createRun(input: CreateRunInput, ownerAccountId: string, projectKey?: string): Promise<TestRunDetail>;
  getRun(id: string): Promise<TestRunDetail | null>;
  deleteRun(id: string): Promise<boolean>;
  getExecution(id: string): Promise<ExecutionDetail | null>;
  setStepResult(executionId: string, stepResultId: string, patch: StepResultPatch): Promise<ExecutionDetail | null>;
  completeExecution(executionId: string, ownerAccountId: string): Promise<ExecutionDetail | null>;
  createDefect(executionId: string, input: CreateDefectInput, ownerAccountId: string): Promise<ExecutionDetail | null>;
  getDefect(id: string): Promise<DefectRecord | null>;
  attachJiraKey(defectId: string, jiraIssueKey: string, payload?: Record<string, string>): Promise<ExecutionDetail | null>;
  getDashboard(projectKey?: string): Promise<DashboardData>;
}

export const DEFAULT_PROJECT = 'DS';
