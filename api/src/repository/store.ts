/**
 * Data-service interface for the Repository (folders + test cases).
 * The HTTP layer depends only on this interface; `PrismaStore` is the
 * Neon-backed implementation. Mirrors the Forge resolver's TestCaseStore so
 * the same dispatch logic works on either side.
 */

import type {
  AddAttachmentInput,
  AttachmentContent,
  CreateDefectInput,
  CreateFolderInput,
  CreatePackageInput,
  CreateRunInput,
  CreateTestCaseInput,
  DashboardData,
  DashboardFilters,
  ExecutionDetail,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  PackageDetail,
  PackageSummary,
  Priority,
  ReportRow,
  RunStage,
  SignOffInput,
  StepResultPatch,
  TestCase,
  TestCaseSummary,
  TestFolder,
  TestRunDetail,
  TestRunSummary,
  UpdateRunInput,
  UpdateTestCaseInput,
} from '../domain/types';

/** Screenshot-gate state for a single step result. */
export interface StepResultGate {
  executionId: string;
  screenshotRequired: boolean;
  hasAttachment: boolean;
}

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
  updateRun(id: string, patch: UpdateRunInput): Promise<TestRunDetail | null>;
  setRunStage(id: string, stage: RunStage): Promise<TestRunDetail | null>;
  signOffRun(id: string, input: SignOffInput): Promise<TestRunDetail | null>;
  deleteRun(id: string): Promise<boolean>;

  // packages (group runs for end-to-end review)
  listPackages(projectKey?: string): Promise<PackageSummary[]>;
  createPackage(input: CreatePackageInput, ownerAccountId: string, projectKey?: string): Promise<PackageDetail>;
  getPackage(id: string): Promise<PackageDetail | null>;
  deletePackage(id: string): Promise<boolean>;
  signOffPackage(id: string, input: SignOffInput): Promise<PackageDetail | null>;
  getExecution(id: string): Promise<ExecutionDetail | null>;
  getStepResultGate(stepResultId: string): Promise<StepResultGate | null>;
  setStepResult(executionId: string, stepResultId: string, patch: StepResultPatch): Promise<ExecutionDetail | null>;
  addAttachment(input: AddAttachmentInput, uploadedByAccountId: string): Promise<ExecutionDetail | null>;
  deleteAttachment(attachmentId: string): Promise<ExecutionDetail | null>;
  getAttachment(id: string): Promise<AttachmentContent | null>;
  completeExecution(executionId: string, ownerAccountId: string): Promise<ExecutionDetail | null>;
  createDefect(executionId: string, input: CreateDefectInput, ownerAccountId: string): Promise<ExecutionDetail | null>;
  getDefect(id: string): Promise<DefectRecord | null>;
  attachJiraKey(defectId: string, jiraIssueKey: string, payload?: Record<string, string>): Promise<ExecutionDetail | null>;
  getDashboard(projectKey?: string, filters?: DashboardFilters): Promise<DashboardData>;
  getReport(projectKey?: string, filters?: DashboardFilters): Promise<ReportRow[]>;
}

export const DEFAULT_PROJECT = 'DS';
