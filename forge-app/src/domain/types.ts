/**
 * TestForge domain types (resolver side).
 *
 * Forge-native demo build — these mirror the production Prisma schema
 * (api/prisma/schema.prisma) but as plain TS so they serialize cleanly over
 * the `@forge/bridge` invoke() boundary and map onto Forge SQL later.
 * Enums are string-literal unions (portable to MySQL/Forge SQL + JSON).
 *
 * Keep this file in sync with the frontend mirror at
 * static/frontend/src/domain/types.ts.
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

export interface TestStep {
  id: string;
  order: number;
  action: string;
  testData?: string;
  expectedResult: string;
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

export interface TestCase {
  id: string;
  /** Monotonic human id rendered as TC-XXXX. Permanent, never reused. */
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
  steps: TestStep[];
  createdAt: string;
  updatedAt: string;
}

/** A folder node with its children resolved, for tree rendering. */
export interface FolderNode extends TestFolder {
  children: FolderNode[];
  testCaseCount: number;
}

/** Lightweight row for list views (no steps payload). */
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

// ---------- write payloads ----------

export interface CreateFolderInput {
  name: string;
  parentId: string | null;
  vendorCode?: VendorCode;
  projectKey?: string;
}

export interface TestStepInput {
  action: string;
  testData?: string;
  expectedResult: string;
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
  steps?: TestStepInput[];
}

export type UpdateTestCaseInput = Partial<Omit<CreateTestCaseInput, 'folderId'>> & {
  folderId?: string;
};

/** One parsed-and-mapped row from a CSV/Excel import. */
export interface ImportedCaseRow {
  title: string;
  objective?: string;
  preconditions?: string;
  testType?: TestType;
  priority?: Priority;
  vendors?: VendorCode[];
  /** Step lines already split client-side; one entry per step. */
  steps?: TestStepInput[];
}

export interface ImportResult {
  created: number;
  caseIds: string[];
}
