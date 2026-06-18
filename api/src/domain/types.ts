/**
 * TestForge domain types (API side) — the HTTP contract shared with the
 * frontend. Mirrors forge-app/static/frontend/src/domain/types.ts. Enums are
 * string-literal unions whose values match the Prisma enums exactly.
 */

export type TestType = 'REGRESSION' | 'UAT' | 'MANUAL_FUNCTIONAL' | 'SMOKE' | 'EXPLORATORY';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TestCaseStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
export type VendorCode = 'PBX' | 'LWS' | 'CPA' | 'HG';
export type Environment = 'DEV' | 'TEST' | 'STAGING' | 'PROD';

export interface TestStep {
  id: string;
  order: number;
  action: string;
  testData?: string;
  expectedResult: string;
  /** When true, executing this step requires a screenshot attachment. */
  screenshotRequired?: boolean;
}

export interface TestFolder {
  id: string;
  name: string;
  parentId: string | null;
  vendorCode?: VendorCode;
  projectKey: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderNode extends TestFolder {
  children: FolderNode[];
  testCaseCount: number;
}

export interface TestCase {
  id: string;
  displayId: number;
  title: string;
  objective?: string;
  preconditions?: string;
  testType: TestType;
  priority: Priority;
  status: TestCaseStatus;
  vendors: VendorCode[];
  environments: Environment[];
  folderId: string;
  ownerAccountId: string;
  version: number;
  labels: string[];
  estimatedDurationMinutes?: number;
  /** Linked Jira story keys (e.g. PLOT-1234) this case verifies. */
  jiraStoryKeys: string[];
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseSummary {
  id: string;
  displayId: number;
  title: string;
  testType: TestType;
  priority: Priority;
  status: TestCaseStatus;
  vendors: VendorCode[];
  folderId: string;
  stepCount: number;
  updatedAt: string;
}

export interface TestStepInput {
  action: string;
  testData?: string;
  expectedResult: string;
  screenshotRequired?: boolean;
}

export interface CreateFolderInput {
  name: string;
  parentId: string | null;
  vendorCode?: VendorCode;
  projectKey?: string;
}

export interface CreateTestCaseInput {
  title: string;
  objective?: string;
  preconditions?: string;
  testType?: TestType;
  priority?: Priority;
  status?: TestCaseStatus;
  vendors?: VendorCode[];
  environments?: Environment[];
  folderId: string;
  labels?: string[];
  estimatedDurationMinutes?: number;
  jiraStoryKeys?: string[];
  steps?: TestStepInput[];
}

export type UpdateTestCaseInput = Partial<Omit<CreateTestCaseInput, 'folderId'>> & {
  folderId?: string;
};

export interface ImportedCaseRow {
  title: string;
  objective?: string;
  preconditions?: string;
  testType?: TestType;
  priority?: Priority;
  vendors?: VendorCode[];
  steps?: TestStepInput[];
}

export interface ImportResult {
  created: number;
  caseIds: string[];
}

// ---------- execution / runs / reporting ----------

export type ExecutionStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'ENHANCEMENT';

/** Run workflow position (QC review pipeline), independent of pass/fail health. */
export type RunStage =
  | 'IN_PROGRESS'
  | 'COMPLETED_BY_TESTER'
  | 'IN_QC_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED';

export interface CreateRunInput {
  name: string;
  environment?: Environment;
  testCaseIds: string[];
  /** Identity-light run assignee (free text / seeded name). */
  assigneeName?: string;
  /** Optional parent package to create this run inside. */
  packageId?: string | null;
}

/** Editable run fields (assignee, package membership, name). */
export interface UpdateRunInput {
  name?: string;
  assigneeName?: string | null;
  packageId?: string | null;
}

export interface TestRunSummary {
  id: string;
  name: string;
  environment: Environment;
  status: ExecutionStatus;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notStarted: number;
  createdAt: string;
  stage: RunStage;
  assigneeName?: string | null;
  packageId?: string | null;
  packageName?: string | null;
  approverName?: string | null;
  approvedAt?: string | null;
}

/** Approver decision recorded at sign-off. */
export type SignOffDecision = 'APPROVED' | 'REJECTED';

export interface SignOffInput {
  decision: SignOffDecision;
  approverName: string;
  note?: string;
}

// ---------- packages (group runs for end-to-end review) ----------

export interface CreatePackageInput {
  name: string;
  packageType?: TestType;
  /** Runs to attach to the new package. */
  runIds?: string[];
}

export interface PackageSummary {
  id: string;
  displayId: number;
  name: string;
  packageType: TestType;
  status: ExecutionStatus;
  runCount: number;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notStarted: number;
  approverName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export interface PackageDetail {
  id: string;
  displayId: number;
  name: string;
  packageType: TestType;
  status: ExecutionStatus;
  approverName?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  runs: TestRunSummary[];
}

/** Render helper: PKG-1042 from displayId 1042. */
export function pkgId(displayId: number): string {
  return `PKG-${displayId}`;
}

// ---------- suites (reusable, runnable case sets) ----------

export interface CreateSuiteInput {
  name: string;
  description?: string;
  /** Ordered test case ids that make up the suite. */
  caseIds: string[];
}

export type UpdateSuiteInput = Partial<CreateSuiteInput>;

export interface SuiteSummary {
  id: string;
  displayId: number;
  name: string;
  description?: string;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SuiteDetail extends SuiteSummary {
  cases: TestCaseSummary[];
}

export interface RunExecutionSummary {
  id: string;
  testCaseId: string;
  displayId: number;
  title: string;
  status: ExecutionStatus;
  stepCount: number;
  doneSteps: number;
}

export interface TestRunDetail {
  id: string;
  name: string;
  environment: Environment;
  status: ExecutionStatus;
  createdAt: string;
  stage: RunStage;
  assigneeName?: string | null;
  packageId?: string | null;
  packageName?: string | null;
  approverName?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
  executions: RunExecutionSummary[];
}

export interface AttachmentView {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AttachmentContent {
  id: string;
  filename: string;
  contentType: string;
  /** Base64 (no data: prefix). */
  dataBase64: string;
}

export interface AddAttachmentInput {
  stepResultId: string;
  filename: string;
  contentType: string;
  dataBase64: string;
}

export interface ExecutionStepResultView {
  id: string;
  order: number;
  action: string;
  testData?: string;
  expectedResult: string;
  status: ExecutionStatus;
  actualResult?: string;
  notes?: string;
  /** Builder set this step to require a screenshot before it can be marked. */
  screenshotRequired: boolean;
  attachments: AttachmentView[];
}

export interface ExecutionDetail {
  id: string;
  runId: string;
  runName: string;
  testCaseDisplayId: number;
  title: string;
  objective?: string;
  preconditions?: string;
  environment: Environment;
  status: ExecutionStatus;
  notes?: string;
  steps: ExecutionStepResultView[];
  defects: DefectView[];
}

export interface DefectView {
  id: string;
  summary: string;
  description?: string;
  severity: Priority;
  jiraIssueKey?: string;
  jiraUrl?: string;
  createdAt: string;
}

export interface CreateDefectInput {
  summary: string;
  description?: string;
  severity?: Priority;
}

export interface StepResultPatch {
  status?: ExecutionStatus;
  actualResult?: string;
  notes?: string;
}

export interface VendorResult {
  vendor: VendorCode;
  pass: number;
  fail: number;
  other: number;
}

export interface EnvironmentResult {
  environment: Environment;
  pass: number;
  fail: number;
  other: number;
}

export interface DashboardData {
  totalCases: number;
  totalRuns: number;
  defectCount: number;
  byStatus: Record<ExecutionStatus, number>;
  passRate: number;
  coverage: { executed: number; total: number };
  byVendor: VendorResult[];
  byEnvironment: EnvironmentResult[];
  recent: { id: string; title: string; status: ExecutionStatus; runName: string; at: string }[];
}

/** Scope filters for the dashboard + export (package / run / test type). */
export interface DashboardFilters {
  packageId?: string;
  runId?: string;
  testType?: TestType;
  /** Scope to a top-level application folder (and its descendants). */
  folderId?: string;
}

/** One per-execution detail row for the exported results artifact. */
export interface ReportRow {
  displayId: number;
  title: string;
  runName: string;
  packageName?: string | null;
  vendors: VendorCode[];
  environment: Environment;
  status: ExecutionStatus;
  stepsDone: number;
  stepsTotal: number;
  defectCount: number;
  jiraKeys: string[];
  assigneeName?: string | null;
  stage: RunStage;
  updatedAt: string;
}
