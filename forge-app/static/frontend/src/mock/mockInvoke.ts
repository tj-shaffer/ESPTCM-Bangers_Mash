/**
 * Standalone mock backend for browser-only preview (STANDALONE mode).
 *
 * When the app is opened directly (not in `web` mode against the real API), this
 * module reimplements the resolver endpoints against an in-browser store seeded
 * with sample data — so the WHOLE product (Repository, Test Runs, QC + approval,
 * Packages, Dashboard, Users & Roles) can be demoed with zero backend.
 *
 * It mirrors the prismaStore's return shapes so the same frontend works against
 * either backend unchanged.
 */

import type {
  AddAttachmentInput,
  AttachmentContent,
  AttachmentView,
  CreateDefectInput,
  CreateFolderInput,
  CreatePackageInput,
  CreateRunInput,
  CreateTestCaseInput,
  DashboardData,
  DashboardFilters,
  DefectView,
  Environment,
  ExecutionDetail,
  ExecutionStatus,
  ExecutionStepResultView,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  PackageDetail,
  PackageSummary,
  Priority,
  ReportRow,
  RunExecutionSummary,
  RunStage,
  SignOffInput,
  StepResultPatch,
  TestCase,
  TestCaseSummary,
  TestFolder,
  TestRunDetail,
  TestRunSummary,
  TestStep,
  TestStepInput,
  TestType,
  UpdateRunInput,
  UpdateTestCaseInput,
  VendorCode,
} from '../domain/types';

const uuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* crypto.randomUUID requires a secure context; fall through on http LAN IPs */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const DEFAULT_PROJECT = 'DS';
const OWNER = 'local-dev';
const nowIso = () => new Date().toISOString();
// 1x1 transparent PNG — a stand-in screenshot so the attachment view/download is demoable offline.
const DEMO_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// ---------- status rollups (mirror the backend) ----------

/** Roll a set of child statuses up to a single status. */
function rollup(statuses: ExecutionStatus[]): ExecutionStatus {
  if (statuses.length === 0) return 'NOT_STARTED';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  const active = statuses.filter((s) => s !== 'NOT_STARTED');
  if (active.length === 0) return 'NOT_STARTED';
  if (active.length < statuses.length) return 'IN_PROGRESS';
  return 'PASS'; // all done, none failed/blocked (SKIPPED/ENHANCEMENT count as done)
}

// ---------- in-memory entities ----------

interface MockAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  dataBase64: string;
  createdAt: string;
}
interface MockStepResult {
  id: string;
  testStepId: string;
  order: number;
  action: string;
  testData?: string;
  expectedResult: string;
  screenshotRequired: boolean;
  status: ExecutionStatus;
  actualResult?: string;
  notes?: string;
  attachments: MockAttachment[];
}
interface MockDefect {
  id: string;
  summary: string;
  description?: string;
  severity: Priority;
  jiraIssueKey?: string;
  jiraUrl?: string;
  createdAt: string;
}
interface MockExecution {
  id: string;
  runId: string;
  testCaseId: string;
  displayId: number;
  title: string;
  objective?: string;
  preconditions?: string;
  environment: Environment;
  steps: MockStepResult[];
  defects: MockDefect[];
}
interface MockRun {
  id: string;
  displayId: number;
  name: string;
  environment: Environment;
  createdAt: string;
  stage: RunStage;
  assigneeName?: string | null;
  packageId?: string | null;
  approverName?: string | null;
  approvalNote?: string | null;
  approvedAt?: string | null;
}
interface MockPackage {
  id: string;
  displayId: number;
  name: string;
  packageType: TestType;
  createdAt: string;
}
interface MockUser {
  subjectId: string;
  displayName: string;
  email: string | null;
  role: string;
  updatedAt: string;
}

function execStatus(e: MockExecution): ExecutionStatus {
  return rollup(e.steps.map((s) => s.status));
}
function doneSteps(e: MockExecution): number {
  return e.steps.filter((s) => s.status !== 'NOT_STARTED').length;
}
function attachmentView(a: MockAttachment): AttachmentView {
  return { id: a.id, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes, createdAt: a.createdAt };
}

class MockStore {
  private folders: TestFolder[];
  private cases: TestCase[];
  private runs: MockRun[] = [];
  private execs: MockExecution[] = [];
  private packages: MockPackage[] = [];
  private users: MockUser[] = [];
  private nextCaseId: number;
  private nextRunId = 5001;
  private nextPkgId = 7001;

  constructor() {
    const seed = buildSeed();
    this.folders = seed.folders;
    this.cases = seed.cases;
    this.nextCaseId = seed.nextDisplayId;
    this.seedRunsAndUsers();
  }

  // ---------- repository ----------

  getFolderTree(projectKey = DEFAULT_PROJECT): FolderNode[] {
    const scoped = this.folders.filter((f) => f.projectKey === projectKey);
    const counts = new Map<string, number>();
    for (const c of this.cases) counts.set(c.folderId, (counts.get(c.folderId) ?? 0) + 1);
    const nodeById = new Map<string, FolderNode>();
    for (const f of scoped) nodeById.set(f.id, { ...f, children: [], testCaseCount: counts.get(f.id) ?? 0 });
    const roots: FolderNode[] = [];
    for (const node of nodeById.values()) {
      const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const sortRec = (nodes: FolderNode[]) => {
      nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }

  createFolder(input: CreateFolderInput): TestFolder {
    const now = nowIso();
    const siblings = this.folders.filter((f) => f.parentId === (input.parentId ?? null));
    const folder: TestFolder = {
      id: uuid(),
      name: input.name.trim() || 'Untitled folder',
      parentId: input.parentId ?? null,
      vendorCode: input.vendorCode,
      projectKey: input.projectKey ?? DEFAULT_PROJECT,
      order: siblings.length,
      createdAt: now,
      updatedAt: now,
    };
    this.folders.push(folder);
    return folder;
  }

  listCases(folderId?: string): TestCaseSummary[] {
    return this.cases
      .filter((c) => (folderId ? c.folderId === folderId : true))
      .map(toSummary)
      .sort((a, b) => a.displayId - b.displayId);
  }

  getCase(id: string): TestCase | null {
    return this.cases.find((c) => c.id === id) ?? null;
  }

  createCase(input: CreateTestCaseInput, owner = OWNER): TestCase {
    const now = nowIso();
    const created: TestCase = {
      id: uuid(),
      displayId: this.nextCaseId++,
      title: input.title.trim() || 'Untitled test case',
      objective: input.objective,
      preconditions: input.preconditions,
      testType: input.testType ?? 'MANUAL_FUNCTIONAL',
      priority: input.priority ?? 'MEDIUM',
      status: input.status ?? 'DRAFT',
      vendors: input.vendors ?? [],
      environments: input.environments ?? ['TEST'],
      folderId: input.folderId,
      ownerAccountId: owner,
      version: 1,
      labels: input.labels ?? [],
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      steps: normalizeSteps(input.steps ?? []),
      createdAt: now,
      updatedAt: now,
    };
    this.cases.push(created);
    return created;
  }

  updateCase(id: string, patch: UpdateTestCaseInput): TestCase | null {
    const c = this.cases.find((x) => x.id === id);
    if (!c) return null;
    if (patch.title !== undefined) c.title = patch.title.trim() || c.title;
    if (patch.objective !== undefined) c.objective = patch.objective;
    if (patch.preconditions !== undefined) c.preconditions = patch.preconditions;
    if (patch.testType !== undefined) c.testType = patch.testType;
    if (patch.priority !== undefined) c.priority = patch.priority;
    if (patch.status !== undefined) c.status = patch.status;
    if (patch.vendors !== undefined) c.vendors = patch.vendors;
    if (patch.environments !== undefined) c.environments = patch.environments;
    if (patch.folderId !== undefined) c.folderId = patch.folderId;
    if (patch.labels !== undefined) c.labels = patch.labels;
    if (patch.estimatedDurationMinutes !== undefined) c.estimatedDurationMinutes = patch.estimatedDurationMinutes;
    if (patch.steps !== undefined) c.steps = normalizeSteps(patch.steps);
    c.version += 1;
    c.updatedAt = nowIso();
    return c;
  }

  deleteCase(id: string): boolean {
    const before = this.cases.length;
    this.cases = this.cases.filter((c) => c.id !== id);
    // Mirror the backend: a deleted case is removed from any runs too.
    this.execs = this.execs.filter((e) => e.testCaseId !== id);
    return this.cases.length < before;
  }

  duplicateCase(id: string): TestCase | null {
    const src = this.cases.find((c) => c.id === id);
    if (!src) return null;
    const now = nowIso();
    const copy: TestCase = {
      ...src,
      id: uuid(),
      displayId: this.nextCaseId++,
      title: `${src.title} (copy)`,
      status: 'DRAFT',
      version: 1,
      steps: src.steps.map((s) => ({ ...s, id: uuid() })),
      createdAt: now,
      updatedAt: now,
    };
    this.cases.push(copy);
    return copy;
  }

  importCases(folderId: string, rows: ImportedCaseRow[], owner = OWNER): ImportResult {
    const caseIds: string[] = [];
    for (const row of rows) {
      if (!row.title || !row.title.trim()) continue;
      const created = this.createCase(
        {
          title: row.title,
          objective: row.objective,
          preconditions: row.preconditions,
          testType: row.testType,
          priority: row.priority,
          vendors: row.vendors,
          folderId,
          steps: row.steps,
        },
        owner,
      );
      caseIds.push(created.id);
    }
    return { created: caseIds.length, caseIds };
  }

  // ---------- runs / executions ----------

  private execsForRun(runId: string): MockExecution[] {
    return this.execs.filter((e) => e.runId === runId);
  }
  private packageName(packageId?: string | null): string | null {
    if (!packageId) return null;
    return this.packages.find((p) => p.id === packageId)?.name ?? null;
  }

  private runSummary(r: MockRun): TestRunSummary {
    const execs = this.execsForRun(r.id);
    const statuses = execs.map(execStatus);
    return {
      id: r.id,
      name: r.name,
      environment: r.environment,
      status: rollup(statuses),
      total: execs.length,
      passed: statuses.filter((s) => s === 'PASS').length,
      failed: statuses.filter((s) => s === 'FAIL').length,
      blocked: statuses.filter((s) => s === 'BLOCKED').length,
      notStarted: statuses.filter((s) => s === 'NOT_STARTED').length,
      createdAt: r.createdAt,
      stage: r.stage,
      assigneeName: r.assigneeName ?? null,
      packageId: r.packageId ?? null,
      packageName: this.packageName(r.packageId),
      approverName: r.approverName ?? null,
      approvedAt: r.approvedAt ?? null,
    };
  }

  private runDetail(r: MockRun): TestRunDetail {
    const execs = this.execsForRun(r.id);
    const executions: RunExecutionSummary[] = execs.map((e) => ({
      id: e.id,
      testCaseId: e.testCaseId,
      displayId: e.displayId,
      title: e.title,
      status: execStatus(e),
      stepCount: e.steps.length,
      doneSteps: doneSteps(e),
    }));
    return {
      id: r.id,
      name: r.name,
      environment: r.environment,
      status: rollup(execs.map(execStatus)),
      createdAt: r.createdAt,
      stage: r.stage,
      assigneeName: r.assigneeName ?? null,
      packageId: r.packageId ?? null,
      packageName: this.packageName(r.packageId),
      approverName: r.approverName ?? null,
      approvalNote: r.approvalNote ?? null,
      approvedAt: r.approvedAt ?? null,
      executions,
    };
  }

  listRuns(): TestRunSummary[] {
    return this.runs.map((r) => this.runSummary(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  getRun(id: string): TestRunDetail | null {
    const r = this.runs.find((x) => x.id === id);
    return r ? this.runDetail(r) : null;
  }

  createRun(input: CreateRunInput, _owner = OWNER): TestRunDetail {
    const env = input.environment ?? 'TEST';
    const run: MockRun = {
      id: uuid(),
      displayId: this.nextRunId++,
      name: input.name.trim(),
      environment: env,
      createdAt: nowIso(),
      stage: 'IN_PROGRESS',
      assigneeName: input.assigneeName ?? null,
      packageId: input.packageId ?? null,
    };
    this.runs.push(run);
    for (const caseId of input.testCaseIds) {
      const c = this.cases.find((x) => x.id === caseId);
      if (!c) continue;
      this.execs.push({
        id: uuid(),
        runId: run.id,
        testCaseId: c.id,
        displayId: c.displayId,
        title: c.title,
        objective: c.objective,
        preconditions: c.preconditions,
        environment: env,
        defects: [],
        steps: c.steps.map((s, i) => ({
          id: uuid(),
          testStepId: s.id,
          order: s.order ?? i + 1,
          action: s.action,
          testData: s.testData,
          expectedResult: s.expectedResult,
          screenshotRequired: !!s.screenshotRequired,
          status: 'NOT_STARTED',
          attachments: [],
        })),
      });
    }
    return this.runDetail(run);
  }

  updateRun(id: string, patch: UpdateRunInput): TestRunDetail | null {
    const r = this.runs.find((x) => x.id === id);
    if (!r) return null;
    if (patch.name !== undefined) r.name = patch.name.trim() || r.name;
    if (patch.assigneeName !== undefined) r.assigneeName = patch.assigneeName;
    if (patch.packageId !== undefined) r.packageId = patch.packageId;
    return this.runDetail(r);
  }

  setRunStage(id: string, stage: RunStage): TestRunDetail | null {
    const r = this.runs.find((x) => x.id === id);
    if (!r) return null;
    r.stage = stage;
    if (stage !== 'APPROVED') {
      r.approverName = null;
      r.approvalNote = null;
      r.approvedAt = null;
    }
    return this.runDetail(r);
  }

  signOffRun(id: string, input: SignOffInput): TestRunDetail | null {
    const r = this.runs.find((x) => x.id === id);
    if (!r) return null;
    if (input.decision === 'APPROVED') {
      r.stage = 'APPROVED';
      r.approverName = input.approverName;
      r.approvalNote = input.note ?? null;
      r.approvedAt = nowIso();
    } else {
      r.stage = 'IN_PROGRESS';
      r.approverName = null;
      r.approvalNote = input.note ?? null;
      r.approvedAt = null;
    }
    return this.runDetail(r);
  }

  deleteRun(id: string): boolean {
    const before = this.runs.length;
    this.runs = this.runs.filter((r) => r.id !== id);
    this.execs = this.execs.filter((e) => e.runId !== id);
    return this.runs.length < before;
  }

  // ---------- execution detail / steps / attachments / defects ----------

  private execDetail(e: MockExecution): ExecutionDetail {
    const run = this.runs.find((r) => r.id === e.runId);
    const steps: ExecutionStepResultView[] = e.steps.map((s) => ({
      id: s.id,
      order: s.order,
      action: s.action,
      testData: s.testData,
      expectedResult: s.expectedResult,
      status: s.status,
      actualResult: s.actualResult,
      notes: s.notes,
      screenshotRequired: s.screenshotRequired,
      attachments: s.attachments.map(attachmentView),
    }));
    const defects: DefectView[] = e.defects.map((d) => ({
      id: d.id,
      summary: d.summary,
      description: d.description,
      severity: d.severity,
      jiraIssueKey: d.jiraIssueKey,
      jiraUrl: d.jiraUrl,
      createdAt: d.createdAt,
    }));
    return {
      id: e.id,
      runId: e.runId,
      runName: run?.name ?? '',
      testCaseDisplayId: e.displayId,
      title: e.title,
      objective: e.objective,
      preconditions: e.preconditions,
      environment: e.environment,
      status: execStatus(e),
      steps,
      defects,
    };
  }

  getExecution(id: string): ExecutionDetail | null {
    const e = this.execs.find((x) => x.id === id);
    return e ? this.execDetail(e) : null;
  }

  setStepResult(executionId: string, stepResultId: string, patch: StepResultPatch): ExecutionDetail | null {
    const e = this.execs.find((x) => x.id === executionId);
    if (!e) return null;
    const s = e.steps.find((x) => x.id === stepResultId);
    if (!s) return null;
    if (patch.status !== undefined) s.status = patch.status;
    if (patch.actualResult !== undefined) s.actualResult = patch.actualResult;
    if (patch.notes !== undefined) s.notes = patch.notes;
    return this.execDetail(e);
  }

  /** Screenshot gate lookup (mirrors store.getStepResultGate). */
  stepGate(stepResultId: string): { screenshotRequired: boolean; hasAttachment: boolean } | null {
    for (const e of this.execs) {
      const s = e.steps.find((x) => x.id === stepResultId);
      if (s) return { screenshotRequired: s.screenshotRequired, hasAttachment: s.attachments.length > 0 };
    }
    return null;
  }

  addAttachment(input: AddAttachmentInput): ExecutionDetail | null {
    for (const e of this.execs) {
      const s = e.steps.find((x) => x.id === input.stepResultId);
      if (s) {
        s.attachments.push({
          id: uuid(),
          filename: input.filename || 'screenshot.png',
          contentType: input.contentType || 'image/png',
          sizeBytes: Math.floor((input.dataBase64.length * 3) / 4),
          dataBase64: input.dataBase64,
          createdAt: nowIso(),
        });
        return this.execDetail(e);
      }
    }
    return null;
  }

  deleteAttachment(id: string): ExecutionDetail | null {
    for (const e of this.execs) {
      for (const s of e.steps) {
        const before = s.attachments.length;
        s.attachments = s.attachments.filter((a) => a.id !== id);
        if (s.attachments.length < before) return this.execDetail(e);
      }
    }
    return null;
  }

  getAttachment(id: string): AttachmentContent | null {
    for (const e of this.execs) {
      for (const s of e.steps) {
        const a = s.attachments.find((x) => x.id === id);
        if (a) return { id: a.id, filename: a.filename, contentType: a.contentType, dataBase64: a.dataBase64 };
      }
    }
    return null;
  }

  completeExecution(id: string): ExecutionDetail | null {
    const e = this.execs.find((x) => x.id === id);
    if (!e) return null;
    // Any step left NOT_STARTED is marked SKIPPED on completion (demo convenience).
    for (const s of e.steps) if (s.status === 'NOT_STARTED') s.status = 'SKIPPED';
    return this.execDetail(e);
  }

  createDefect(executionId: string, input: CreateDefectInput): ExecutionDetail | null {
    const e = this.execs.find((x) => x.id === executionId);
    if (!e) return null;
    e.defects.push({
      id: uuid(),
      summary: input.summary.trim(),
      description: input.description,
      severity: input.severity ?? 'MEDIUM',
      createdAt: nowIso(),
    });
    return this.execDetail(e);
  }

  linkDefectJira(defectId: string, key: string): ExecutionDetail | null {
    for (const e of this.execs) {
      const d = e.defects.find((x) => x.id === defectId);
      if (d) {
        d.jiraIssueKey = key;
        return this.execDetail(e);
      }
    }
    return null;
  }

  // ---------- packages ----------

  private packageSummary(p: MockPackage): PackageSummary {
    const memberRuns = this.runs.filter((r) => r.packageId === p.id).map((r) => this.runSummary(r));
    const sum = (k: 'total' | 'passed' | 'failed' | 'blocked' | 'notStarted') =>
      memberRuns.reduce((acc, r) => acc + r[k], 0);
    return {
      id: p.id,
      displayId: p.displayId,
      name: p.name,
      packageType: p.packageType,
      status: rollup(memberRuns.map((r) => r.status)),
      runCount: memberRuns.length,
      total: sum('total'),
      passed: sum('passed'),
      failed: sum('failed'),
      blocked: sum('blocked'),
      notStarted: sum('notStarted'),
      createdAt: p.createdAt,
    };
  }

  listPackages(): PackageSummary[] {
    return this.packages.map((p) => this.packageSummary(p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getPackage(id: string): PackageDetail | null {
    const p = this.packages.find((x) => x.id === id);
    if (!p) return null;
    const runs = this.runs.filter((r) => r.packageId === p.id).map((r) => this.runSummary(r));
    return {
      id: p.id,
      displayId: p.displayId,
      name: p.name,
      packageType: p.packageType,
      status: rollup(runs.map((r) => r.status)),
      createdAt: p.createdAt,
      runs,
    };
  }

  createPackage(input: CreatePackageInput): PackageDetail {
    const p: MockPackage = {
      id: uuid(),
      displayId: this.nextPkgId++,
      name: input.name.trim(),
      packageType: input.packageType ?? 'REGRESSION',
      createdAt: nowIso(),
    };
    this.packages.push(p);
    for (const runId of input.runIds ?? []) {
      const r = this.runs.find((x) => x.id === runId);
      if (r) r.packageId = p.id;
    }
    return this.getPackage(p.id)!;
  }

  deletePackage(id: string): boolean {
    const before = this.packages.length;
    this.packages = this.packages.filter((p) => p.id !== id);
    for (const r of this.runs) if (r.packageId === id) r.packageId = null;
    return this.packages.length < before;
  }

  // ---------- dashboard / report ----------

  /** A folder id plus all of its descendants (for the application filter). */
  private descendantFolderIds(folderId: string): string[] {
    const childMap = new Map<string, string[]>();
    for (const f of this.folders) {
      if (f.parentId) {
        const kids = childMap.get(f.parentId) ?? [];
        kids.push(f.id);
        childMap.set(f.parentId, kids);
      }
    }
    const out = [folderId];
    const stack = [folderId];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const child of childMap.get(cur) ?? []) {
        out.push(child);
        stack.push(child);
      }
    }
    return out;
  }

  private scopedExecs(filters: DashboardFilters): MockExecution[] {
    let runs = this.runs;
    if (filters.packageId) runs = runs.filter((r) => r.packageId === filters.packageId);
    if (filters.runId) runs = runs.filter((r) => r.id === filters.runId);
    const runIds = new Set(runs.map((r) => r.id));
    let execs = this.execs.filter((e) => runIds.has(e.runId));
    if (filters.testType) {
      const ok = new Set(this.cases.filter((c) => c.testType === filters.testType).map((c) => c.id));
      execs = execs.filter((e) => ok.has(e.testCaseId));
    }
    if (filters.folderId) {
      const folderIds = new Set(this.descendantFolderIds(filters.folderId));
      const ok = new Set(this.cases.filter((c) => folderIds.has(c.folderId)).map((c) => c.id));
      execs = execs.filter((e) => ok.has(e.testCaseId));
    }
    return execs;
  }

  /** Distinct project keys — single-project ('DS') in the mock. */
  projects(): string[] {
    return [...new Set(this.folders.map((f) => f.projectKey))].sort();
  }

  getDashboard(filters: DashboardFilters = {}): DashboardData {
    const execs = this.scopedExecs(filters);
    const runIds = new Set(execs.map((e) => e.runId));
    const byStatus: Record<ExecutionStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      PASS: 0,
      FAIL: 0,
      BLOCKED: 0,
      SKIPPED: 0,
      ENHANCEMENT: 0,
    };
    for (const e of execs) byStatus[execStatus(e)] += 1;
    const executed = execs.filter((e) => execStatus(e) !== 'NOT_STARTED').length;
    const passed = byStatus.PASS;
    const defectCount = execs.reduce((acc, e) => acc + e.defects.length, 0);

    const vendorMap = new Map<VendorCode, { pass: number; fail: number; other: number }>();
    const envMap = new Map<Environment, { pass: number; fail: number; other: number }>();
    for (const e of execs) {
      const st = execStatus(e);
      const bucket = st === 'PASS' ? 'pass' : st === 'FAIL' ? 'fail' : 'other';
      const c = this.cases.find((x) => x.id === e.testCaseId);
      for (const v of c?.vendors ?? []) {
        const row = vendorMap.get(v) ?? { pass: 0, fail: 0, other: 0 };
        row[bucket] += 1;
        vendorMap.set(v, row);
      }
      const er = envMap.get(e.environment) ?? { pass: 0, fail: 0, other: 0 };
      er[bucket] += 1;
      envMap.set(e.environment, er);
    }

    const recent = [...execs]
      .reverse()
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.title,
        status: execStatus(e),
        runName: this.runs.find((r) => r.id === e.runId)?.name ?? '',
        at: nowIso(),
      }));

    return {
      totalCases: this.cases.length,
      totalRuns: runIds.size,
      defectCount,
      byStatus,
      passRate: executed > 0 ? Math.round((passed / executed) * 100) : 0,
      coverage: { executed: new Set(execs.filter((e) => execStatus(e) !== 'NOT_STARTED').map((e) => e.testCaseId)).size, total: this.cases.length },
      byVendor: [...vendorMap.entries()].map(([vendor, v]) => ({ vendor, ...v })),
      byEnvironment: [...envMap.entries()].map(([environment, v]) => ({ environment, ...v })),
      recent,
    };
  }

  getReport(filters: DashboardFilters = {}): ReportRow[] {
    return this.scopedExecs(filters).map((e) => {
      const run = this.runs.find((r) => r.id === e.runId);
      const c = this.cases.find((x) => x.id === e.testCaseId);
      return {
        displayId: e.displayId,
        title: e.title,
        runName: run?.name ?? '',
        packageName: this.packageName(run?.packageId),
        vendors: c?.vendors ?? [],
        environment: e.environment,
        status: execStatus(e),
        stepsDone: doneSteps(e),
        stepsTotal: e.steps.length,
        defectCount: e.defects.length,
        jiraKeys: e.defects.map((d) => d.jiraIssueKey).filter((k): k is string => !!k),
        assigneeName: run?.assigneeName ?? null,
        stage: run?.stage ?? 'IN_PROGRESS',
        updatedAt: run?.createdAt ?? nowIso(),
      };
    });
  }

  // ---------- admin / users ----------

  listUsers(): MockUser[] {
    return [...this.users].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  setUserRole(subjectId: string, role: string): MockUser | null {
    const u = this.users.find((x) => x.subjectId === subjectId);
    if (!u) return null;
    u.role = role;
    u.updatedAt = nowIso();
    return u;
  }
  createUser(email: string, displayName: string, role: string): MockUser {
    const u: MockUser = { subjectId: uuid(), email: email.trim().toLowerCase(), displayName: displayName.trim(), role, updatedAt: nowIso() };
    this.users.push(u);
    return u;
  }
  resetUserPassword(subjectId: string): { subjectId: string; email: string | null } | null {
    const u = this.users.find((x) => x.subjectId === subjectId);
    return u ? { subjectId: u.subjectId, email: u.email } : null;
  }
  deleteUser(subjectId: string): { deleted: boolean } {
    const before = this.users.length;
    this.users = this.users.filter((u) => u.subjectId !== subjectId);
    return { deleted: this.users.length < before };
  }

  // ---------- seed runs/executions/packages/users ----------

  private seedRunsAndUsers() {
    this.users = [
      { subjectId: 'local-dev', displayName: 'Local Dev (mock)', email: 'dev@everstory.example', role: 'SUPER_ADMIN', updatedAt: '2026-06-01T09:00:00.000Z' },
      { subjectId: uuid(), displayName: 'Mariah Khan', email: 'mkhan@everstory.example', role: 'TEST_MANAGER', updatedAt: '2026-06-01T09:00:00.000Z' },
      { subjectId: uuid(), displayName: 'Dave Brodecki', email: 'dbrod@everstory.example', role: 'TEST_AUTHOR', updatedAt: '2026-06-01T09:00:00.000Z' },
      { subjectId: uuid(), displayName: 'Vince Lizardi', email: 'vliza@everstory.example', role: 'FIELD_OPERATOR', updatedAt: '2026-06-01T09:00:00.000Z' },
    ];

    // Run 1 — in progress regression, one failure with a defect.
    const r1 = this.createRun(
      { name: 'Regression — June release', environment: 'TEST', assigneeName: 'Dave Brodecki', testCaseIds: this.cases.slice(0, 3).map((c) => c.id) },
      OWNER,
    );
    const run1Execs = this.execsForRun(r1.id);
    if (run1Execs[0]) run1Execs[0].steps.forEach((s) => (s.status = 'PASS'));
    // Seed one attachment so the screenshot view/download is demoable offline.
    if (run1Execs[0]?.steps[0]) {
      run1Execs[0].steps[0].attachments.push({
        id: uuid(),
        filename: 'reserve-plot-confirmation.png',
        contentType: 'image/png',
        sizeBytes: 70,
        dataBase64: DEMO_PNG,
        createdAt: nowIso(),
      });
    }
    if (run1Execs[1]) {
      run1Execs[1].steps.forEach((s, i) => (s.status = i === run1Execs[1]!.steps.length - 1 ? 'FAIL' : 'PASS'));
      run1Execs[1].defects.push({ id: uuid(), summary: 'Interment double-booking not blocked', description: 'Overlapping service was allowed.', severity: 'HIGH', createdAt: nowIso() });
    }
    if (run1Execs[2]) run1Execs[2].steps.forEach((s, i) => (s.status = i === 0 ? 'PASS' : 'NOT_STARTED'));

    // Run 2 — UAT, all passed, ready for approval, in a package.
    const e2eCase = this.cases.find((c) => c.testType === 'UAT') ?? this.cases[this.cases.length - 1];
    const r2 = this.createRun(
      { name: 'UAT — go-live sign-off', environment: 'STAGING', assigneeName: 'Mariah Khan', testCaseIds: e2eCase ? [e2eCase.id] : [] },
      OWNER,
    );
    this.execsForRun(r2.id).forEach((e) => e.steps.forEach((s) => (s.status = 'PASS')));
    const run2 = this.runs.find((r) => r.id === r2.id)!;
    run2.stage = 'READY_FOR_APPROVAL';

    // Package grouping the UAT run.
    const pkg = this.createPackage({ name: 'June Release — End-to-end', packageType: 'UAT', runIds: [r2.id] });
    void pkg;
  }
}

function toSummary(c: TestCase): TestCaseSummary {
  return {
    id: c.id,
    displayId: c.displayId,
    title: c.title,
    testType: c.testType,
    priority: c.priority,
    status: c.status,
    vendors: c.vendors,
    folderId: c.folderId,
    stepCount: c.steps.length,
    updatedAt: c.updatedAt,
  };
}

function normalizeSteps(steps: TestStepInput[]): TestStep[] {
  return steps
    .filter((s) => (s.action ?? '').trim() || (s.expectedResult ?? '').trim())
    .map((s, i) => ({
      id: uuid(),
      order: i + 1,
      action: s.action ?? '',
      testData: s.testData,
      expectedResult: s.expectedResult ?? '',
      screenshotRequired: s.screenshotRequired,
    }));
}

function buildSeed(): { folders: TestFolder[]; cases: TestCase[]; nextDisplayId: number } {
  const now = '2026-06-01T09:00:00.000Z';
  const f = (name: string, parentId: string | null, extra: Partial<TestFolder>): TestFolder => ({
    id: uuid(),
    name,
    parentId,
    projectKey: DEFAULT_PROJECT,
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });

  const fPlotbox = f('PlotBox (PBX)', null, { vendorCode: 'PBX', order: 0 });
  const fInterment = f('Plot & Interment', fPlotbox.id, { vendorCode: 'PBX', order: 0 });
  const fPayments = f('Payments', fPlotbox.id, { vendorCode: 'PBX', order: 1 });
  const fLawson = f('Lawson (LWS)', null, { vendorCode: 'LWS', order: 1 });
  const fFinancials = f('Financials', fLawson.id, { vendorCode: 'LWS', order: 0 });
  const fUat = f('Cross-vendor UAT', null, { order: 2 });
  const folders = [fPlotbox, fInterment, fPayments, fLawson, fFinancials, fUat];

  let displayId = 1041;
  const mk = (
    folderId: string,
    title: string,
    rest: Partial<TestCase> & Pick<TestCase, 'testType' | 'priority' | 'status'>,
  ): TestCase => ({
    id: uuid(),
    displayId: ++displayId,
    title,
    vendors: [],
    environments: ['TEST'],
    folderId,
    ownerAccountId: OWNER,
    version: 1,
    labels: [],
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...rest,
  });

  const step = (order: number, action: string, expectedResult: string, testData?: string): TestStep => ({
    id: uuid(),
    order,
    action,
    expectedResult,
    testData,
  });

  const cases: TestCase[] = [
    mk(fInterment.id, 'Reserve an available plot for a pre-need customer', {
      objective: 'Confirm a sales agent can reserve an unoccupied plot and the status flips to Reserved.',
      preconditions: 'Agent logged in with sales permissions; at least one Available plot exists.',
      testType: 'MANUAL_FUNCTIONAL',
      priority: 'HIGH',
      status: 'ACTIVE',
      vendors: ['PBX'],
      labels: ['plot', 'sales'],
      steps: [
        step(1, 'Search for an Available plot in the target cemetery and section.', 'Matching available plots are listed with map locations.'),
        step(2, 'Select a plot and choose "Reserve".', 'Reservation form opens pre-filled with the plot identifier.', 'Customer: Jane Doe (pre-need)'),
        step(3, 'Assign the customer and confirm the reservation.', 'Plot status changes to Reserved and appears under the customer record.'),
      ],
    }),
    mk(fInterment.id, 'Schedule an interment service for an occupied plot', {
      objective: 'Verify interment scheduling blocks double-booking of the same plot/time.',
      testType: 'REGRESSION',
      priority: 'CRITICAL',
      status: 'ACTIVE',
      vendors: ['PBX'],
      labels: ['interment', 'scheduling'],
      steps: [
        step(1, 'Open an occupied plot with an existing reservation.', 'Plot detail shows the linked customer and contract.'),
        step(2, 'Create an interment service overlapping an existing service.', 'System blocks the booking and shows a conflict warning.', 'Same plot, overlapping window'),
      ],
    }),
    mk(fPayments.id, 'Apply a deposit payment to a plot contract', {
      objective: 'Ensure a partial deposit updates the contract balance correctly.',
      testType: 'MANUAL_FUNCTIONAL',
      priority: 'MEDIUM',
      status: 'ACTIVE',
      vendors: ['PBX', 'CPA'],
      labels: ['payments'],
      steps: [
        step(1, 'Open a contract with an outstanding balance.', 'Balance and payment schedule are shown.'),
        step(2, 'Record a deposit payment.', 'Balance decreases by the deposit; receipt is generated.', 'Amount: $500.00'),
      ],
    }),
    mk(fFinancials.id, 'Post a daily revenue batch to the GL', {
      objective: 'Confirm the nightly revenue batch posts to the correct Lawson GL accounts.',
      testType: 'REGRESSION',
      priority: 'HIGH',
      status: 'DRAFT',
      vendors: ['LWS'],
      labels: ['gl', 'finance'],
      steps: [
        step(1, 'Trigger the daily revenue batch export.', 'Batch file is produced with the day’s transactions.'),
        step(2, 'Import the batch into Lawson and review the GL posting.', 'Totals reconcile and post to the expected accounts.'),
      ],
    }),
    mk(fUat.id, 'End-to-end: sale → payment → interment scheduling', {
      objective: 'Full happy-path across PlotBox and Lawson for a single customer.',
      testType: 'UAT',
      priority: 'CRITICAL',
      status: 'ACTIVE',
      vendors: ['PBX', 'LWS', 'CPA'],
      environments: ['STAGING'],
      labels: ['e2e', 'uat'],
      estimatedDurationMinutes: 45,
      steps: [
        step(1, 'Create a new pre-need sale for a customer.', 'Contract is created in PlotBox.'),
        step(2, 'Take a deposit and confirm it flows to Lawson financials.', 'Payment posts in both systems and reconciles.'),
        step(3, 'Schedule the interment service.', 'Service is booked with no conflicts and notifications send.'),
      ],
    }),
  ];

  return { folders, cases, nextDisplayId: displayId + 1 };
}

let storeSingleton: MockStore | null = null;
function getMockStore(): MockStore {
  if (!storeSingleton) storeSingleton = new MockStore();
  return storeSingleton;
}

/** Dispatch a resolver-style invoke against the in-browser mock store. */
export async function mockInvoke<T>(key: string, payload: Record<string, unknown>): Promise<T> {
  const store = getMockStore();
  const p = payload as Record<string, any>;
  switch (key) {
    case 'getContext':
      return { accountId: 'local-dev', displayName: 'Local Dev (mock)', role: 'SUPER_ADMIN', mustChangePassword: false, currentIssueKey: null } as T;

    // repository
    case 'repo.getFolderTree':
      return store.getFolderTree(p.projectKey) as T;
    case 'repo.createFolder':
      return store.createFolder(p as unknown as CreateFolderInput) as T;
    case 'repo.listCases':
      return store.listCases(p.folderId) as T;
    case 'repo.getCase':
      return store.getCase(p.id) as T;
    case 'repo.createCase':
      return store.createCase(p as unknown as CreateTestCaseInput) as T;
    case 'repo.updateCase':
      return store.updateCase(p.id, (p.patch ?? {}) as UpdateTestCaseInput) as T;
    case 'repo.deleteCase':
      return { deleted: store.deleteCase(p.id) } as T;
    case 'repo.duplicateCase':
      return store.duplicateCase(p.id) as T;
    case 'repo.importCases':
      return store.importCases(p.folderId, (p.rows ?? []) as ImportedCaseRow[]) as T;

    // runs
    case 'run.list':
      return store.listRuns() as T;
    case 'run.get':
      return store.getRun(p.id) as T;
    case 'run.create':
      return store.createRun(p as unknown as CreateRunInput) as T;
    case 'run.update':
      return store.updateRun(p.id, (p.patch ?? {}) as UpdateRunInput) as T;
    case 'run.setStage':
      return store.setRunStage(p.id, p.stage as RunStage) as T;
    case 'run.signOff':
      return store.signOffRun(p.id, { decision: p.decision, approverName: p.approverName, note: p.note }) as T;
    case 'run.delete':
      return { deleted: store.deleteRun(p.id) } as T;

    // packages
    case 'package.list':
      return store.listPackages() as T;
    case 'package.get':
      return store.getPackage(p.id) as T;
    case 'package.create':
      return store.createPackage(p as unknown as CreatePackageInput) as T;
    case 'package.delete':
      return { deleted: store.deletePackage(p.id) } as T;

    // execution
    case 'exec.get':
      return store.getExecution(p.id) as T;
    case 'exec.setStep': {
      const patch = (p.patch ?? {}) as StepResultPatch;
      const terminal: ExecutionStatus[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'ENHANCEMENT'];
      if (patch.status && terminal.includes(patch.status)) {
        const gate = store.stepGate(p.stepResultId);
        if (gate?.screenshotRequired && !gate.hasAttachment) {
          throw new Error('This step requires a screenshot before it can be marked.');
        }
      }
      return store.setStepResult(p.executionId, p.stepResultId, patch) as T;
    }
    case 'exec.addAttachment':
      return store.addAttachment(p as unknown as AddAttachmentInput) as T;
    case 'exec.deleteAttachment':
      return store.deleteAttachment(p.id) as T;
    case 'attachment.get':
      return store.getAttachment(p.id) as T;
    case 'exec.complete':
      return store.completeExecution(p.id) as T;
    case 'defect.create':
      return store.createDefect(p.executionId, p.input as CreateDefectInput) as T;
    case 'defect.linkJira':
      return store.linkDefectJira(p.id, String(p.jiraIssueKey ?? '').trim().toUpperCase()) as T;
    case 'defect.toJira':
      throw new Error('Jira is not configured in the preview.');

    // jira (not configured in mock)
    case 'jira.options':
      return { configured: false, issueTypes: [] } as T;
    case 'jira.check':
      return { configured: false, ok: false, status: 0, projectKey: 'DS', projectFound: false, issueTypes: [], issueTypeExists: false, requiredFields: [], message: 'Jira is not configured in the preview.' } as T;

    // reporting
    case 'meta.projects':
      return store.projects() as T;
    case 'report.dashboard':
      return store.getDashboard((p.filters ?? {}) as DashboardFilters) as T;
    case 'report.export':
      return store.getReport((p.filters ?? {}) as DashboardFilters) as T;

    // admin
    case 'admin.listUsers':
      return store.listUsers() as T;
    case 'admin.setRole':
      return store.setUserRole(p.accountId, p.role) as T;
    case 'admin.createUser':
      return store.createUser(p.email, p.displayName, p.role) as T;
    case 'admin.resetPassword':
      return store.resetUserPassword(p.accountId) as T;
    case 'admin.deleteUser':
      return store.deleteUser(p.accountId) as T;
    case 'account.changePassword':
      return { ok: true } as T;

    default:
      throw new Error(`mockInvoke: unhandled resolver key "${key}"`);
  }
}
