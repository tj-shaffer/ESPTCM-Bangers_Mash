/**
 * Standalone mock backend for browser-only preview.
 *
 * When the app is opened directly at http://localhost:3000 (NOT embedded in a
 * Jira iframe), there is no Forge bridge, so resolver calls can't work. This
 * module reimplements the resolver `repo.*` endpoints against an in-browser
 * store seeded with the same sample data — letting the whole UI be demoed with
 * zero Jira, zero tunnel, zero install. It is only used when `isStandalone()`
 * is true (see api/client.ts); inside Jira the real bridge is used.
 */

import type {
  CreateFolderInput,
  CreateTestCaseInput,
  FolderNode,
  ImportResult,
  ImportedCaseRow,
  TestCase,
  TestCaseSummary,
  TestFolder,
  TestStep,
  TestStepInput,
  UpdateTestCaseInput,
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

class MockStore {
  private folders: TestFolder[];
  private cases: TestCase[];
  private nextDisplayId: number;

  constructor() {
    const seed = buildSeed();
    this.folders = seed.folders;
    this.cases = seed.cases;
    this.nextDisplayId = seed.nextDisplayId;
  }

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
    const now = new Date().toISOString();
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
    const now = new Date().toISOString();
    const created: TestCase = {
      id: uuid(),
      displayId: this.nextDisplayId++,
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
    c.updatedAt = new Date().toISOString();
    return c;
  }

  deleteCase(id: string): boolean {
    const before = this.cases.length;
    this.cases = this.cases.filter((c) => c.id !== id);
    return this.cases.length < before;
  }

  duplicateCase(id: string): TestCase | null {
    const src = this.cases.find((c) => c.id === id);
    if (!src) return null;
    const now = new Date().toISOString();
    const copy: TestCase = {
      ...src,
      id: uuid(),
      displayId: this.nextDisplayId++,
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
  switch (key) {
    case 'getContext':
      return { accountId: 'local-dev', displayName: 'Local Dev (mock)', currentIssueKey: null } as T;
    case 'repo.getFolderTree':
      return store.getFolderTree(payload.projectKey as string | undefined) as T;
    case 'repo.createFolder':
      return store.createFolder(payload as unknown as CreateFolderInput) as T;
    case 'repo.listCases':
      return store.listCases(payload.folderId as string | undefined) as T;
    case 'repo.getCase':
      return store.getCase(payload.id as string) as T;
    case 'repo.createCase':
      return store.createCase(payload as unknown as CreateTestCaseInput) as T;
    case 'repo.updateCase':
      return store.updateCase(payload.id as string, (payload.patch ?? {}) as UpdateTestCaseInput) as T;
    case 'repo.deleteCase':
      return { deleted: store.deleteCase(payload.id as string) } as T;
    case 'repo.duplicateCase':
      return store.duplicateCase(payload.id as string) as T;
    case 'repo.importCases':
      return store.importCases(payload.folderId as string, (payload.rows ?? []) as ImportedCaseRow[]) as T;
    default:
      throw new Error(`mockInvoke: unhandled resolver key "${key}"`);
  }
}
