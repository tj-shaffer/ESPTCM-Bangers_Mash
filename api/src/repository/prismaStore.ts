/**
 * Neon/Postgres-backed implementation of TestCaseStore (via Prisma).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { DEFAULT_PROJECT, type DefectRecord, type StepResultGate, type TestCaseStore } from './store';
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
  ReportRow,
  DefectView,
  Environment,
  EnvironmentResult,
  ExecutionDetail,
  ExecutionStatus,
  ExecutionStepResultView,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  PackageDetail,
  PackageSummary,
  Priority,
  RunExecutionSummary,
  RunStage,
  SignOffInput,
  StepResultPatch,
  TestCase,
  TestCaseStatus,
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
  VendorResult,
} from '../domain/types';

const PILOT_PLAN_NAME = '__pilot_runs__';

function rollup(statuses: ExecutionStatus[]): ExecutionStatus {
  if (statuses.length === 0) return 'NOT_STARTED';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.every((s) => s === 'NOT_STARTED')) return 'NOT_STARTED';
  // ENHANCEMENT ("nice to have") is non-blocking — a fully-marked run of
  // passes/skips/enhancements still rolls up to PASS.
  if (statuses.every((s) => s === 'PASS' || s === 'SKIPPED' || s === 'ENHANCEMENT')) return 'PASS';
  return 'IN_PROGRESS';
}

/** Build a TestRunSummary from a cycle row that includes executions + package. */
function runSummaryOf(c: {
  id: string;
  name: string;
  environment: string;
  stage: string;
  createdAt: Date;
  assigneeName: string | null;
  packageId: string | null;
  approverName: string | null;
  approvedAt: Date | null;
  executions: { status: string }[];
  package?: { name: string } | null;
}): TestRunSummary {
  const statuses = c.executions.map((e) => e.status as ExecutionStatus);
  const count = (s: ExecutionStatus) => statuses.filter((x) => x === s).length;
  return {
    id: c.id,
    name: c.name,
    environment: c.environment as Environment,
    status: rollup(statuses),
    total: statuses.length,
    passed: count('PASS'),
    failed: count('FAIL'),
    blocked: count('BLOCKED'),
    notStarted: count('NOT_STARTED'),
    createdAt: c.createdAt.toISOString(),
    stage: c.stage as RunStage,
    assigneeName: c.assigneeName,
    packageId: c.packageId,
    packageName: c.package?.name ?? null,
    approverName: c.approverName,
    approvedAt: c.approvedAt?.toISOString() ?? null,
  };
}

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  vendorCode: string | null;
  projectKey: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

type StepRow = {
  id: string;
  order: number;
  action: string;
  testData: string | null;
  expectedResult: string;
  screenshotRequired?: boolean;
};

type CaseRow = {
  id: string;
  displayId: number;
  title: string;
  objective: string | null;
  preconditions: string | null;
  testType: string;
  priority: string;
  status: string;
  vendors: string[];
  environments: string[];
  folderId: string;
  ownerAccountId: string;
  version: number;
  labels: string[];
  estimatedDurationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  steps?: StepRow[];
};

function mapFolder(f: FolderRow): TestFolder {
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    vendorCode: (f.vendorCode as VendorCode | null) ?? undefined,
    projectKey: f.projectKey,
    order: f.order,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

function mapStep(s: StepRow): TestStep {
  return {
    id: s.id,
    order: s.order,
    action: s.action,
    testData: s.testData ?? undefined,
    expectedResult: s.expectedResult,
    screenshotRequired: s.screenshotRequired ?? false,
  };
}

function mapCase(c: CaseRow): TestCase {
  return {
    id: c.id,
    displayId: c.displayId,
    title: c.title,
    objective: c.objective ?? undefined,
    preconditions: c.preconditions ?? undefined,
    testType: c.testType as TestType,
    priority: c.priority as Priority,
    status: c.status as TestCaseStatus,
    vendors: c.vendors as VendorCode[],
    environments: c.environments as Environment[],
    folderId: c.folderId,
    ownerAccountId: c.ownerAccountId,
    version: c.version,
    labels: c.labels,
    estimatedDurationMinutes: c.estimatedDurationMinutes ?? undefined,
    steps: (c.steps ?? []).map(mapStep),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function stepCreateData(steps: TestStepInput[] | undefined) {
  return (steps ?? [])
    .filter((s) => (s.action ?? '').trim() || (s.expectedResult ?? '').trim())
    .map((s, i) => ({
      order: i + 1,
      action: s.action ?? '',
      testData: s.testData?.trim() ? s.testData : null,
      expectedResult: s.expectedResult ?? '',
      screenshotRequired: !!s.screenshotRequired,
    }));
}

export class PrismaStore implements TestCaseStore {
  async getFolderTree(projectKey = DEFAULT_PROJECT): Promise<FolderNode[]> {
    const folders = await prisma.testFolder.findMany({
      where: { projectKey },
      include: { _count: { select: { testCases: true } } },
    });

    const nodeById = new Map<string, FolderNode>();
    for (const f of folders) {
      nodeById.set(f.id, {
        ...mapFolder(f as unknown as FolderRow),
        children: [],
        testCaseCount: (f as unknown as { _count: { testCases: number } })._count.testCases,
      });
    }

    const roots: FolderNode[] = [];
    for (const node of nodeById.values()) {
      const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    const sortRec = (nodes: FolderNode[]): void => {
      nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }

  async createFolder(input: CreateFolderInput): Promise<TestFolder> {
    const projectKey = input.projectKey ?? DEFAULT_PROJECT;
    const siblingCount = await prisma.testFolder.count({
      where: { projectKey, parentId: input.parentId ?? null },
    });
    const created = await prisma.testFolder.create({
      data: {
        name: input.name.trim() || 'Untitled folder',
        parentId: input.parentId ?? null,
        vendorCode: input.vendorCode ?? null,
        projectKey,
        order: siblingCount,
      },
    });
    return mapFolder(created as unknown as FolderRow);
  }

  async listCases(folderId?: string): Promise<TestCaseSummary[]> {
    const cases = await prisma.testCase.findMany({
      where: folderId ? { folderId } : undefined,
      include: { _count: { select: { steps: true } } },
      orderBy: { displayId: 'asc' },
    });
    return cases.map((c) => {
      const row = c as unknown as CaseRow & { _count: { steps: number } };
      return {
        id: row.id,
        displayId: row.displayId,
        title: row.title,
        testType: row.testType as TestType,
        priority: row.priority as Priority,
        status: row.status as TestCaseStatus,
        vendors: row.vendors as VendorCode[],
        folderId: row.folderId,
        stepCount: row._count.steps,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  async getCase(id: string): Promise<TestCase | null> {
    const found = await prisma.testCase.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    return found ? mapCase(found as unknown as CaseRow) : null;
  }

  async createCase(input: CreateTestCaseInput, ownerAccountId: string): Promise<TestCase> {
    const created = await prisma.testCase.create({
      data: {
        title: input.title.trim() || 'Untitled test case',
        objective: input.objective?.trim() ? input.objective : null,
        preconditions: input.preconditions?.trim() ? input.preconditions : null,
        testType: (input.testType ?? 'MANUAL_FUNCTIONAL') as TestType,
        priority: (input.priority ?? 'MEDIUM') as Priority,
        status: (input.status ?? 'DRAFT') as TestCaseStatus,
        vendors: input.vendors ?? [],
        environments: input.environments ?? ['TEST'],
        folderId: input.folderId,
        ownerAccountId,
        labels: input.labels ?? [],
        estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
        steps: { create: stepCreateData(input.steps) },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    return mapCase(created as unknown as CaseRow);
  }

  async updateCase(id: string, patch: UpdateTestCaseInput): Promise<TestCase | null> {
    const existing = await prisma.testCase.findUnique({ where: { id } });
    if (!existing) return null;

    const data: Record<string, unknown> = { version: { increment: 1 } };
    if (patch.title !== undefined) data.title = patch.title.trim() || existing.title;
    if (patch.objective !== undefined) data.objective = patch.objective?.trim() ? patch.objective : null;
    if (patch.preconditions !== undefined)
      data.preconditions = patch.preconditions?.trim() ? patch.preconditions : null;
    if (patch.testType !== undefined) data.testType = patch.testType;
    if (patch.priority !== undefined) data.priority = patch.priority;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.vendors !== undefined) data.vendors = patch.vendors;
    if (patch.environments !== undefined) data.environments = patch.environments;
    if (patch.folderId !== undefined) data.folderId = patch.folderId;
    if (patch.labels !== undefined) data.labels = patch.labels;
    if (patch.estimatedDurationMinutes !== undefined)
      data.estimatedDurationMinutes = patch.estimatedDurationMinutes ?? null;
    if (patch.steps !== undefined) {
      data.steps = { deleteMany: {}, create: stepCreateData(patch.steps) };
    }

    const updated = await prisma.testCase.update({
      where: { id },
      data,
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    return mapCase(updated as unknown as CaseRow);
  }

  async deleteCase(id: string): Promise<boolean> {
    try {
      await prisma.testCase.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async duplicateCase(id: string): Promise<TestCase | null> {
    const src = await prisma.testCase.findUnique({
      where: { id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!src) return null;
    const srcCase = src as unknown as CaseRow;
    const copy = await prisma.testCase.create({
      data: {
        title: `${srcCase.title} (copy)`,
        objective: srcCase.objective,
        preconditions: srcCase.preconditions,
        testType: srcCase.testType as TestType,
        priority: srcCase.priority as Priority,
        status: 'DRAFT' as TestCaseStatus,
        vendors: srcCase.vendors as VendorCode[],
        environments: srcCase.environments as Environment[],
        folderId: srcCase.folderId,
        ownerAccountId: srcCase.ownerAccountId,
        labels: srcCase.labels,
        estimatedDurationMinutes: srcCase.estimatedDurationMinutes,
        steps: {
          create: (srcCase.steps ?? []).map((s) => ({
            order: s.order,
            action: s.action,
            testData: s.testData,
            expectedResult: s.expectedResult,
          })),
        },
      },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    return mapCase(copy as unknown as CaseRow);
  }

  async importCases(
    folderId: string,
    rows: ImportedCaseRow[],
    ownerAccountId: string,
  ): Promise<ImportResult> {
    const caseIds: string[] = [];
    for (const row of rows) {
      if (!row.title || !row.title.trim()) continue;
      const created = await this.createCase(
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
        ownerAccountId,
      );
      caseIds.push(created.id);
    }
    return { created: caseIds.length, caseIds };
  }

  // ---------- runs / execution / reporting ----------

  private async defaultPlanId(projectKey: string, owner: string): Promise<string> {
    const existing = await prisma.testPlan.findFirst({
      where: { projectKey, name: PILOT_PLAN_NAME },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.testPlan.create({
      data: {
        name: PILOT_PLAN_NAME,
        planType: 'FULL_CYCLE',
        status: 'ACTIVE',
        targetEnvironment: 'TEST',
        ownerAccountId: owner,
        projectKey,
      },
    });
    return created.id;
  }

  async listRuns(projectKey = DEFAULT_PROJECT): Promise<TestRunSummary[]> {
    const cycles = await prisma.testCycle.findMany({
      where: { testPlan: { projectKey } },
      include: { executions: { select: { status: true } }, package: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return cycles.map((c) => runSummaryOf(c));
  }

  async createRun(input: CreateRunInput, owner: string, projectKey = DEFAULT_PROJECT): Promise<TestRunDetail> {
    const planId = await this.defaultPlanId(projectKey, owner);
    const env = (input.environment ?? 'TEST') as Environment;
    const cycle = await prisma.testCycle.create({
      data: {
        testPlanId: planId,
        name: input.name.trim() || 'Untitled run',
        environment: env,
        status: 'NOT_STARTED',
        assigneeName: input.assigneeName?.trim() || null,
        packageId: input.packageId ?? null,
      },
    });
    for (const caseId of input.testCaseIds) {
      const tc = await prisma.testCase.findUnique({
        where: { id: caseId },
        include: { steps: { orderBy: { order: 'asc' } } },
      });
      if (!tc) continue;
      await prisma.testExecution.create({
        data: {
          testCycleId: cycle.id,
          testCaseId: tc.id,
          testCaseVersion: tc.version,
          assignedToAccountId: owner,
          status: 'NOT_STARTED',
          environment: env,
          stepResults: {
            create: tc.steps.map((s) => ({ testStepId: s.id, stepOrder: s.order, status: 'NOT_STARTED' as const })),
          },
        },
      });
    }
    return (await this.getRun(cycle.id)) as TestRunDetail;
  }

  async getRun(id: string): Promise<TestRunDetail | null> {
    const cycle = await prisma.testCycle.findUnique({
      where: { id },
      include: {
        package: { select: { name: true } },
        executions: {
          include: {
            testCase: { select: { displayId: true, title: true } },
            stepResults: { select: { status: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!cycle) return null;
    const executions: RunExecutionSummary[] = cycle.executions.map((e) => {
      const stepStatuses = e.stepResults.map((r) => r.status as ExecutionStatus);
      return {
        id: e.id,
        testCaseId: e.testCaseId,
        displayId: e.testCase.displayId,
        title: e.testCase.title,
        status: e.status as ExecutionStatus,
        stepCount: stepStatuses.length,
        doneSteps: stepStatuses.filter((s) => s !== 'NOT_STARTED').length,
      };
    });
    return {
      id: cycle.id,
      name: cycle.name,
      environment: cycle.environment as Environment,
      status: rollup(executions.map((e) => e.status)),
      createdAt: cycle.createdAt.toISOString(),
      stage: cycle.stage as RunStage,
      assigneeName: cycle.assigneeName,
      packageId: cycle.packageId,
      packageName: cycle.package?.name ?? null,
      approverName: cycle.approverName,
      approvalNote: cycle.approvalNote,
      approvedAt: cycle.approvedAt?.toISOString() ?? null,
      executions,
    };
  }

  async setRunStage(id: string, stage: RunStage): Promise<TestRunDetail | null> {
    const existing = await prisma.testCycle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;
    await prisma.testCycle.update({ where: { id }, data: { stage } });
    return this.getRun(id);
  }

  async signOffRun(id: string, input: SignOffInput): Promise<TestRunDetail | null> {
    const existing = await prisma.testCycle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;
    const approved = input.decision === 'APPROVED';
    await prisma.testCycle.update({
      where: { id },
      data: {
        // Approve advances to APPROVED; a rejection sends the run back to the
        // testers, but the reviewer + note are recorded either way.
        stage: approved ? 'APPROVED' : 'IN_PROGRESS',
        approverName: input.approverName.trim() || null,
        approvalNote: input.note?.trim() || null,
        approvedAt: new Date(),
      },
    });
    return this.getRun(id);
  }

  async updateRun(id: string, patch: UpdateRunInput): Promise<TestRunDetail | null> {
    const existing = await prisma.testCycle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;
    await prisma.testCycle.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() || 'Untitled run' } : {}),
        ...(patch.assigneeName !== undefined ? { assigneeName: patch.assigneeName?.trim() || null } : {}),
        ...(patch.packageId !== undefined ? { packageId: patch.packageId } : {}),
      },
    });
    return this.getRun(id);
  }

  async deleteRun(id: string): Promise<boolean> {
    try {
      await prisma.testCycle.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ---------- packages ----------

  async listPackages(projectKey = DEFAULT_PROJECT): Promise<PackageSummary[]> {
    const pkgs = await prisma.package.findMany({
      where: { projectKey },
      include: { cycles: { include: { executions: { select: { status: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return pkgs.map((p) => {
      // Roll a package up from every execution status across its member runs.
      const statuses = p.cycles.flatMap((c) => c.executions.map((e) => e.status as ExecutionStatus));
      const count = (s: ExecutionStatus) => statuses.filter((x) => x === s).length;
      return {
        id: p.id,
        displayId: p.displayId,
        name: p.name,
        packageType: p.packageType as TestType,
        status: rollup(statuses),
        runCount: p.cycles.length,
        total: statuses.length,
        passed: count('PASS'),
        failed: count('FAIL'),
        blocked: count('BLOCKED'),
        notStarted: count('NOT_STARTED'),
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  async createPackage(
    input: CreatePackageInput,
    owner: string,
    projectKey = DEFAULT_PROJECT,
  ): Promise<PackageDetail> {
    const pkg = await prisma.package.create({
      data: {
        name: input.name.trim() || 'Untitled package',
        packageType: (input.packageType ?? 'REGRESSION') as TestType,
        ownerAccountId: owner,
        projectKey,
      },
    });
    if (input.runIds && input.runIds.length > 0) {
      await prisma.testCycle.updateMany({
        where: { id: { in: input.runIds } },
        data: { packageId: pkg.id },
      });
    }
    return (await this.getPackage(pkg.id)) as PackageDetail;
  }

  async getPackage(id: string): Promise<PackageDetail | null> {
    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        cycles: {
          include: { executions: { select: { status: true } }, package: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!pkg) return null;
    const runs = pkg.cycles.map((c) => runSummaryOf(c));
    const statuses = pkg.cycles.flatMap((c) => c.executions.map((e) => e.status as ExecutionStatus));
    return {
      id: pkg.id,
      displayId: pkg.displayId,
      name: pkg.name,
      packageType: pkg.packageType as TestType,
      status: rollup(statuses),
      createdAt: pkg.createdAt.toISOString(),
      runs,
    };
  }

  async deletePackage(id: string): Promise<boolean> {
    try {
      // Member runs survive — their packageId is set null by the relation.
      await prisma.package.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async getExecution(id: string): Promise<ExecutionDetail | null> {
    const e = await prisma.testExecution.findUnique({
      where: { id },
      include: {
        testCase: { select: { displayId: true, title: true, objective: true, preconditions: true } },
        testCycle: { select: { id: true, name: true } },
        stepResults: {
          orderBy: { stepOrder: 'asc' },
          include: {
            attachments: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, filename: true, contentType: true, sizeBytes: true, createdAt: true },
            },
          },
        },
        defects: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!e) return null;
    const stepIds = e.stepResults.map((r) => r.testStepId);
    const steps = await prisma.testStep.findMany({ where: { id: { in: stepIds } } });
    const byId = new Map(steps.map((s) => [s.id, s]));
    const stepViews: ExecutionStepResultView[] = e.stepResults.map((r) => {
      const ts = byId.get(r.testStepId);
      return {
        id: r.id,
        order: r.stepOrder,
        action: ts?.action ?? '(step removed)',
        testData: ts?.testData ?? undefined,
        expectedResult: ts?.expectedResult ?? '',
        status: r.status as ExecutionStatus,
        actualResult: r.actualResult ?? undefined,
        notes: r.notes ?? undefined,
        screenshotRequired: ts?.screenshotRequired ?? false,
        attachments: r.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    });
    return {
      id: e.id,
      runId: e.testCycle.id,
      runName: e.testCycle.name,
      testCaseDisplayId: e.testCase.displayId,
      title: e.testCase.title,
      objective: e.testCase.objective ?? undefined,
      preconditions: e.testCase.preconditions ?? undefined,
      environment: e.environment as Environment,
      status: e.status as ExecutionStatus,
      notes: e.notes ?? undefined,
      steps: stepViews,
      defects: e.defects.map(
        (df): DefectView => ({
          id: df.id,
          summary: df.summary,
          description: df.description ?? undefined,
          severity: df.severity as DefectView['severity'],
          jiraIssueKey: df.jiraIssueKey ?? undefined,
          jiraUrl: (df.jiraCreationPayload as { url?: string } | null)?.url ?? undefined,
          createdAt: df.createdAt.toISOString(),
        }),
      ),
    };
  }

  async createDefect(executionId: string, input: CreateDefectInput, owner: string): Promise<ExecutionDetail | null> {
    const exists = await prisma.testExecution.findUnique({ where: { id: executionId }, select: { id: true } });
    if (!exists) return null;
    await prisma.defect.create({
      data: {
        executionId,
        summary: input.summary.trim() || 'Untitled defect',
        description: input.description?.trim() ? input.description : null,
        severity: (input.severity ?? 'MEDIUM') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
        reportedByAccountId: owner,
      },
    });
    return this.getExecution(executionId);
  }

  async getDefect(id: string): Promise<DefectRecord | null> {
    const d = await prisma.defect.findUnique({
      where: { id },
      select: { id: true, executionId: true, summary: true, description: true, severity: true, jiraIssueKey: true },
    });
    if (!d) return null;
    return {
      id: d.id,
      executionId: d.executionId,
      summary: d.summary,
      description: d.description ?? undefined,
      severity: d.severity as Priority,
      jiraIssueKey: d.jiraIssueKey ?? undefined,
    };
  }

  async attachJiraKey(
    defectId: string,
    jiraIssueKey: string,
    payload?: Record<string, string>,
  ): Promise<ExecutionDetail | null> {
    const updated = await prisma.defect.update({
      where: { id: defectId },
      data: { jiraIssueKey, jiraCreationPayload: payload ?? undefined },
      select: { executionId: true },
    });
    return this.getExecution(updated.executionId);
  }

  async setStepResult(
    executionId: string,
    stepResultId: string,
    patch: StepResultPatch,
  ): Promise<ExecutionDetail | null> {
    const data: Record<string, unknown> = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.actualResult !== undefined) data.actualResult = patch.actualResult || null;
    if (patch.notes !== undefined) data.notes = patch.notes || null;
    await prisma.executionStepResult.update({ where: { id: stepResultId }, data });

    const results = await prisma.executionStepResult.findMany({ where: { executionId }, select: { status: true } });
    const status = rollup(results.map((r) => r.status as ExecutionStatus));
    const exec = await prisma.testExecution.findUnique({ where: { id: executionId }, select: { startedAt: true } });
    await prisma.testExecution.update({
      where: { id: executionId },
      data: { status, startedAt: exec?.startedAt ?? new Date() },
    });
    return this.getExecution(executionId);
  }

  async getStepResultGate(stepResultId: string): Promise<StepResultGate | null> {
    const r = await prisma.executionStepResult.findUnique({
      where: { id: stepResultId },
      select: { executionId: true, testStepId: true, _count: { select: { attachments: true } } },
    });
    if (!r) return null;
    const ts = await prisma.testStep.findUnique({
      where: { id: r.testStepId },
      select: { screenshotRequired: true },
    });
    return {
      executionId: r.executionId,
      screenshotRequired: ts?.screenshotRequired ?? false,
      hasAttachment: r._count.attachments > 0,
    };
  }

  async addAttachment(input: AddAttachmentInput, owner: string): Promise<ExecutionDetail | null> {
    const sr = await prisma.executionStepResult.findUnique({
      where: { id: input.stepResultId },
      select: { executionId: true },
    });
    if (!sr) return null;
    await prisma.attachment.create({
      data: {
        stepResultId: input.stepResultId,
        filename: input.filename.slice(0, 260) || 'attachment',
        contentType: input.contentType || 'application/octet-stream',
        sizeBytes: Math.ceil((input.dataBase64.length * 3) / 4),
        dataBase64: input.dataBase64,
        uploadedByAccountId: owner,
      },
    });
    return this.getExecution(sr.executionId);
  }

  async deleteAttachment(attachmentId: string): Promise<ExecutionDetail | null> {
    const a = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { stepResult: { select: { executionId: true } } },
    });
    if (!a) return null;
    await prisma.attachment.delete({ where: { id: attachmentId } });
    return this.getExecution(a.stepResult.executionId);
  }

  async getAttachment(id: string): Promise<AttachmentContent | null> {
    const a = await prisma.attachment.findUnique({
      where: { id },
      select: { id: true, filename: true, contentType: true, dataBase64: true },
    });
    return a ?? null;
  }

  async completeExecution(executionId: string, owner: string): Promise<ExecutionDetail | null> {
    const results = await prisma.executionStepResult.findMany({ where: { executionId }, select: { status: true } });
    const status = rollup(results.map((r) => r.status as ExecutionStatus));
    await prisma.testExecution.update({
      where: { id: executionId },
      data: { status, completedAt: new Date(), executedByAccountId: owner },
    });
    return this.getExecution(executionId);
  }

  /** Resolve the in-scope cycle ids + an execution `where` for the given filters. */
  private async scope(
    projectKey: string,
    filters: DashboardFilters,
  ): Promise<{ cycleIds: string[]; execWhere: Prisma.TestExecutionWhereInput }> {
    const cycleWhere: Prisma.TestCycleWhereInput = { testPlan: { projectKey } };
    if (filters.runId) cycleWhere.id = filters.runId;
    else if (filters.packageId) cycleWhere.packageId = filters.packageId;
    const cycles = await prisma.testCycle.findMany({ where: cycleWhere, select: { id: true } });
    const cycleIds = cycles.map((c) => c.id);
    const execWhere: Prisma.TestExecutionWhereInput = { testCycleId: { in: cycleIds } };
    if (filters.testType) execWhere.testCase = { testType: filters.testType };
    return { cycleIds, execWhere };
  }

  async getDashboard(projectKey = DEFAULT_PROJECT, filters: DashboardFilters = {}): Promise<DashboardData> {
    const totalCases = await prisma.testCase.count();
    const { cycleIds, execWhere } = await this.scope(projectKey, filters);
    const defectCount = await prisma.defect.count({ where: { execution: execWhere } });
    const executions = await prisma.testExecution.findMany({
      where: execWhere,
      include: {
        testCase: { select: { title: true, vendors: true } },
        testCycle: { select: { name: true } },
      },
    });

    const byStatus: Record<ExecutionStatus, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      PASS: 0,
      FAIL: 0,
      BLOCKED: 0,
      SKIPPED: 0,
      ENHANCEMENT: 0,
    };
    for (const e of executions) byStatus[e.status as ExecutionStatus]++;

    const denom = byStatus.PASS + byStatus.FAIL + byStatus.BLOCKED;
    const passRate = denom > 0 ? Math.round((byStatus.PASS / denom) * 100) : 0;
    const executedCaseIds = new Set(executions.map((e) => e.testCaseId));

    const vendors: VendorCode[] = ['PBX', 'LWS', 'CPA', 'HG'];
    const byVendor: VendorResult[] = vendors
      .map((v) => {
        const subset = executions.filter((e) => (e.testCase.vendors as string[]).includes(v));
        return {
          vendor: v,
          pass: subset.filter((e) => e.status === 'PASS').length,
          fail: subset.filter((e) => e.status === 'FAIL').length,
          other: subset.filter((e) => e.status !== 'PASS' && e.status !== 'FAIL').length,
        };
      })
      .filter((r) => r.pass + r.fail + r.other > 0);

    const envs: Environment[] = ['DEV', 'TEST', 'STAGING', 'PROD'];
    const byEnvironment: EnvironmentResult[] = envs
      .map((env) => {
        const subset = executions.filter((e) => e.environment === env);
        return {
          environment: env,
          pass: subset.filter((e) => e.status === 'PASS').length,
          fail: subset.filter((e) => e.status === 'FAIL').length,
          other: subset.filter((e) => e.status !== 'PASS' && e.status !== 'FAIL').length,
        };
      })
      .filter((r) => r.pass + r.fail + r.other > 0);

    const recent = [...executions]
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 8)
      .map((e) => ({
        id: e.id,
        title: e.testCase.title,
        status: e.status as ExecutionStatus,
        runName: e.testCycle.name,
        at: e.updatedAt.toISOString(),
      }));

    return {
      totalCases,
      totalRuns: cycleIds.length,
      defectCount,
      byStatus,
      passRate,
      coverage: { executed: executedCaseIds.size, total: totalCases },
      byVendor,
      byEnvironment,
      recent,
    };
  }

  async getReport(projectKey = DEFAULT_PROJECT, filters: DashboardFilters = {}): Promise<ReportRow[]> {
    const { execWhere } = await this.scope(projectKey, filters);
    const execs = await prisma.testExecution.findMany({
      where: execWhere,
      include: {
        testCase: { select: { displayId: true, title: true, vendors: true } },
        testCycle: {
          select: { name: true, stage: true, assigneeName: true, package: { select: { name: true } } },
        },
        stepResults: { select: { status: true } },
        defects: { select: { jiraIssueKey: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return execs.map((e) => ({
      displayId: e.testCase.displayId,
      title: e.testCase.title,
      runName: e.testCycle.name,
      packageName: e.testCycle.package?.name ?? null,
      vendors: e.testCase.vendors as VendorCode[],
      environment: e.environment as Environment,
      status: e.status as ExecutionStatus,
      stepsTotal: e.stepResults.length,
      stepsDone: e.stepResults.filter((r) => r.status !== 'NOT_STARTED').length,
      defectCount: e.defects.length,
      jiraKeys: e.defects.map((d) => d.jiraIssueKey).filter((k): k is string => !!k),
      assigneeName: e.testCycle.assigneeName,
      stage: e.testCycle.stage as RunStage,
      updatedAt: e.updatedAt.toISOString(),
    }));
  }
}

let storeSingleton: TestCaseStore | null = null;
export function getStore(): TestCaseStore {
  if (!storeSingleton) storeSingleton = new PrismaStore();
  return storeSingleton;
}
