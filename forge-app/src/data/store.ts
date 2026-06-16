/**
 * Data-service interface for the Repository (folders + test cases).
 *
 * This is the swappable seam mandated by CLAUDE.md: the resolver depends only
 * on `TestCaseStore`, never on a concrete backend. The demo ships
 * `InMemoryStore` (seeded, zero provisioning). A `ForgeSqlStore` implementing
 * the same interface is the drop-in for persistence once the Forge dev site is
 * provisioned; a future `AzureApiStore` restores the production target.
 */

import { randomUUID } from 'crypto';
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
import { buildSeedState } from '../domain/seed';

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
}

const DEFAULT_PROJECT = 'DS';

export class InMemoryStore implements TestCaseStore {
  private folders: TestFolder[];
  private cases: TestCase[];
  private nextDisplayId: number;

  constructor() {
    const seed = buildSeedState();
    this.folders = seed.folders;
    this.cases = seed.cases;
    this.nextDisplayId = seed.nextDisplayId;
  }

  async getFolderTree(projectKey = DEFAULT_PROJECT): Promise<FolderNode[]> {
    const scoped = this.folders.filter((f) => f.projectKey === projectKey);
    const counts = new Map<string, number>();
    for (const c of this.cases) {
      counts.set(c.folderId, (counts.get(c.folderId) ?? 0) + 1);
    }

    const nodeById = new Map<string, FolderNode>();
    for (const f of scoped) {
      nodeById.set(f.id, { ...f, children: [], testCaseCount: counts.get(f.id) ?? 0 });
    }

    const roots: FolderNode[] = [];
    for (const node of nodeById.values()) {
      if (node.parentId && nodeById.has(node.parentId)) {
        nodeById.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortRec = (nodes: FolderNode[]): void => {
      nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }

  async createFolder(input: CreateFolderInput): Promise<TestFolder> {
    const now = new Date().toISOString();
    const siblings = this.folders.filter((f) => f.parentId === (input.parentId ?? null));
    const folder: TestFolder = {
      id: randomUUID(),
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

  async listCases(folderId?: string): Promise<TestCaseSummary[]> {
    return this.cases
      .filter((c) => (folderId ? c.folderId === folderId : true))
      .map(toSummary)
      .sort((a, b) => a.displayId - b.displayId);
  }

  async getCase(id: string): Promise<TestCase | null> {
    return this.cases.find((c) => c.id === id) ?? null;
  }

  async createCase(input: CreateTestCaseInput, ownerAccountId: string): Promise<TestCase> {
    const now = new Date().toISOString();
    const newCase: TestCase = {
      id: randomUUID(),
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
      ownerAccountId,
      version: 1,
      labels: input.labels ?? [],
      estimatedDurationMinutes: input.estimatedDurationMinutes,
      steps: normalizeSteps(input.steps ?? []),
      createdAt: now,
      updatedAt: now,
    };
    this.cases.push(newCase);
    return newCase;
  }

  async updateCase(id: string, patch: UpdateTestCaseInput): Promise<TestCase | null> {
    const existing = this.cases.find((c) => c.id === id);
    if (!existing) return null;

    if (patch.title !== undefined) existing.title = patch.title.trim() || existing.title;
    if (patch.objective !== undefined) existing.objective = patch.objective;
    if (patch.preconditions !== undefined) existing.preconditions = patch.preconditions;
    if (patch.testType !== undefined) existing.testType = patch.testType;
    if (patch.priority !== undefined) existing.priority = patch.priority;
    if (patch.status !== undefined) existing.status = patch.status;
    if (patch.vendors !== undefined) existing.vendors = patch.vendors;
    if (patch.environments !== undefined) existing.environments = patch.environments;
    if (patch.folderId !== undefined) existing.folderId = patch.folderId;
    if (patch.labels !== undefined) existing.labels = patch.labels;
    if (patch.estimatedDurationMinutes !== undefined) {
      existing.estimatedDurationMinutes = patch.estimatedDurationMinutes;
    }
    if (patch.steps !== undefined) existing.steps = normalizeSteps(patch.steps);

    existing.version += 1;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  async deleteCase(id: string): Promise<boolean> {
    const before = this.cases.length;
    this.cases = this.cases.filter((c) => c.id !== id);
    return this.cases.length < before;
  }

  async duplicateCase(id: string): Promise<TestCase | null> {
    const src = this.cases.find((c) => c.id === id);
    if (!src) return null;
    const now = new Date().toISOString();
    const copy: TestCase = {
      ...src,
      id: randomUUID(),
      displayId: this.nextDisplayId++,
      title: `${src.title} (copy)`,
      status: 'DRAFT',
      version: 1,
      steps: src.steps.map((s) => ({ ...s, id: randomUUID() })),
      createdAt: now,
      updatedAt: now,
    };
    this.cases.push(copy);
    return copy;
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
      id: randomUUID(),
      order: i + 1,
      action: s.action ?? '',
      testData: s.testData,
      expectedResult: s.expectedResult ?? '',
    }));
}

/**
 * Singleton store for the resolver process. Under `forge tunnel` this persists
 * for the session; in deployed/cold-start mode it reseeds. Swap the
 * construction here for `new ForgeSqlStore(...)` when persistence is wired.
 */
let storeSingleton: TestCaseStore | null = null;
export function getStore(): TestCaseStore {
  if (!storeSingleton) storeSingleton = new InMemoryStore();
  return storeSingleton;
}
