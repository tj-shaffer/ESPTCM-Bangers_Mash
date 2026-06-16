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
