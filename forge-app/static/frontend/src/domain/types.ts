/**
 * TestForge domain types (frontend mirror).
 * Keep in sync with forge-app/src/domain/types.ts.
 */

export type TestType = 'REGRESSION' | 'UAT' | 'MANUAL_FUNCTIONAL' | 'SMOKE' | 'EXPLORATORY';
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TestCaseStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
export type VendorCode = 'PBX' | 'LWS' | 'CPA' | 'HG';
export type Environment = 'DEV' | 'TEST' | 'STAGING' | 'PROD';

export const TEST_TYPES: TestType[] = ['REGRESSION', 'UAT', 'MANUAL_FUNCTIONAL', 'SMOKE', 'EXPLORATORY'];
export const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const STATUSES: TestCaseStatus[] = ['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'];
export const VENDOR_CODES: VendorCode[] = ['PBX', 'LWS', 'CPA', 'HG'];
export const ENVIRONMENTS: Environment[] = ['DEV', 'TEST', 'STAGING', 'PROD'];

/**
 * Seeded team members for identity-light run assignment (pre-SSO). A free-text
 * name is still allowed; this just powers the picker. Real per-user identity is
 * deferred to the Azure AD / SSO state — see ENHANCEMENTS #5.
 */
export const TEAM_MEMBERS = ['Mohammad Khan', 'Vileyka Lizardo', 'David Brodecki', 'TJ Shaffer', 'Alex'];

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  REGRESSION: 'Regression',
  UAT: 'UAT',
  MANUAL_FUNCTIONAL: 'Manual / Functional',
  SMOKE: 'Smoke',
  EXPLORATORY: 'Exploratory',
};

export const VENDOR_LABELS: Record<VendorCode, string> = {
  PBX: 'PlotBox',
  LWS: 'Lawson',
  CPA: 'Coupa',
  HG: 'Homegrown',
};

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

/** A Jira issue returned from the link-a-story search. */
export interface JiraIssueSummary {
  key: string;
  summary: string;
  url: string;
  issueType?: string;
  status?: string;
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

export interface UpdateFolderInput {
  name?: string;
  vendorCode?: VendorCode | null;
}

/** Counts returned by a cascading folder delete, for the confirmation toast. */
export interface DeleteFolderResult {
  deletedFolders: number;
  deletedCases: number;
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

/** Render helper: TC-1042 from displayId 1042. */
export function tcId(displayId: number): string {
  return `TC-${displayId}`;
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

export const EXEC_STATUS_LABEL: Record<ExecutionStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  PASS: 'Pass',
  FAIL: 'Fail',
  BLOCKED: 'Blocked',
  SKIPPED: 'Skipped',
  ENHANCEMENT: 'Nice to have',
};

/** Run workflow position (QC review pipeline), independent of pass/fail health.
 *  A tester's hand-off lands straight in IN_QC_REVIEW — the old COMPLETED_BY_TESTER
 *  ("Submitted for QC") stage was collapsed into review per stakeholder feedback
 *  (2026-06-23). Legacy rows are normalized to IN_QC_REVIEW server-side. */
export type RunStage =
  | 'IN_PROGRESS'
  | 'IN_QC_REVIEW'
  | 'READY_FOR_APPROVAL'
  | 'APPROVED';

export const RUN_STAGES: RunStage[] = [
  'IN_PROGRESS',
  'IN_QC_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
];

export const RUN_STAGE_LABEL: Record<RunStage, string> = {
  IN_PROGRESS: 'In progress',
  IN_QC_REVIEW: 'In QC review',
  READY_FOR_APPROVAL: 'Ready for approval',
  APPROVED: 'Approved',
};

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
  /** Count of ENHANCEMENT ("Nice to have") items — non-blocking known issues
   *  deferred to a later iteration. Surfaced as a badge on the run card. */
  enhancement: number;
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

/**
 * Create a cycle in one action: a thematic Package + one duplicated run per tester
 * (same cases). Alex signs off the package once; distinctive arms join later via a
 * run's packageId.
 */
export interface CreateCycleInput {
  name: string;
  packageType?: TestType;
  testCaseIds: string[];
  /** One run is created per tester (same cases). */
  assignees: string[];
  environment?: Environment;
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
// Renders a Cycle's human id, e.g. CY-7001. (The underlying entity/table is still
// named "Package"; "Cycle" is the user-facing term — 2026-06-23.)
export function pkgId(displayId: number): string {
  return `CY-${displayId}`;
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

/** Render helper: SUITE-1042 from displayId 1042. */
export function suiteId(displayId: number): string {
  return `SUITE-${displayId}`;
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

/** Pass/fail rollup for one tester (run assignee) — drives the "Results by tester" view. */
export interface AssigneeResult {
  assignee: string;
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
  byAssignee: AssigneeResult[];
  recent: { id: string; title: string; status: ExecutionStatus; runName: string; at: string }[];
}

/** Scope filters for the dashboard + export (package / run / test type). */
export interface DashboardFilters {
  packageId?: string;
  runId?: string;
  testType?: TestType;
  /** Scope to a top-level application folder (and its descendants). */
  folderId?: string;
  /** Scope to a single tester (a run's assigneeName) — Vileyka's "by test user". */
  assigneeName?: string;
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
