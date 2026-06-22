/**
 * Zod schemas for /api/invoke payloads — one per dispatch key that takes input.
 *
 * These replace the hand-rolled `payload as SomeInput` casts + ad-hoc `if (!x)
 * throw` checks in dispatch. `parse()` validates and returns a typed value, so
 * the dispatch arms consume already-validated input with no casts.
 *
 * Behavior matches the old inline checks: the same fields are required, with the
 * same user-facing messages (a missing field yields the same message as an empty
 * one, via `required_error`); unknown keys are stripped (objects are non-strict);
 * enum fields use the same literal unions as the frontend, so the only new
 * rejection is genuinely malformed input (caught here as a 400 instead of a
 * later Prisma error).
 */

import { z } from 'zod';
import { DispatchError } from './errors';

/** A required non-empty string whose missing/empty/wrong-type errors all read `msg`. */
const req = (msg: string) => z.string({ required_error: msg, invalid_type_error: msg }).min(1, msg);
/** A required string of at least `min` chars; missing/short/wrong-type all read `msg`. */
const reqMin = (min: number, msg: string) =>
  z.string({ required_error: msg, invalid_type_error: msg }).min(min, msg);

// ---------- shared enums (mirror domain/types.ts) ----------

const testType = z.enum(['REGRESSION', 'UAT', 'MANUAL_FUNCTIONAL', 'SMOKE', 'EXPLORATORY']);
const priority = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const testCaseStatus = z.enum(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);
const vendorCode = z.enum(['PBX', 'LWS', 'CPA', 'HG']);
const environment = z.enum(['DEV', 'TEST', 'STAGING', 'PROD']);
const executionStatus = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'PASS',
  'FAIL',
  'BLOCKED',
  'SKIPPED',
  'ENHANCEMENT',
]);
const runStage = z.enum(['IN_PROGRESS', 'COMPLETED_BY_TESTER', 'IN_QC_REVIEW', 'READY_FOR_APPROVAL', 'APPROVED'], {
  errorMap: () => ({ message: 'A valid run stage is required' }),
});
const role = z.enum(['SUPER_ADMIN', 'TEST_MANAGER', 'TEST_AUTHOR', 'FIELD_OPERATOR', 'OBSERVER'], {
  errorMap: () => ({ message: 'A valid role is required' }),
});
const signOffDecision = z.enum(['APPROVED', 'REJECTED'], {
  errorMap: () => ({ message: 'A valid decision (APPROVED or REJECTED) is required' }),
});

// Step contents are normalized server-side (empties filtered), so strings may be
// empty — matching the lenient pre-zod behavior.
const stepInput = z.object({
  action: z.string().default(''),
  testData: z.string().optional(),
  expectedResult: z.string().default(''),
  screenshotRequired: z.boolean().optional(),
});

const importedRow = z.object({
  title: z.string(),
  objective: z.string().optional(),
  preconditions: z.string().optional(),
  testType: testType.optional(),
  priority: priority.optional(),
  vendors: z.array(vendorCode).optional(),
  steps: z.array(stepInput).optional(),
});

// Shared optional case fields (used by create + update + import).
const caseFields = {
  title: req('Title is required'),
  objective: z.string().optional(),
  preconditions: z.string().optional(),
  testType: testType.optional(),
  priority: priority.optional(),
  status: testCaseStatus.optional(),
  vendors: z.array(vendorCode).optional(),
  environments: z.array(environment).optional(),
  labels: z.array(z.string()).optional(),
  jiraStoryKeys: z.array(z.string()).optional(),
  estimatedDurationMinutes: z.number().optional(),
  steps: z.array(stepInput).optional(),
};

const dashboardFilters = z
  .object({
    packageId: z.string().optional(),
    runId: z.string().optional(),
    testType: testType.optional(),
    folderId: z.string().optional(),
  })
  .optional();

// ---------- per-key schemas ----------

export const schemas = {
  // reads
  'repo.getFolderTree': z.object({ projectKey: z.string().optional() }),
  'repo.listCases': z.object({ folderId: z.string().optional() }),
  'repo.getCase': z.object({ id: req('Test case id is required') }),
  'run.list': z.object({ projectKey: z.string().optional() }),
  'run.get': z.object({ id: req('Run id is required') }),
  'package.list': z.object({ projectKey: z.string().optional() }),
  'package.get': z.object({ id: req('Package id is required') }),
  'exec.get': z.object({ id: req('Execution id is required') }),
  'attachment.get': z.object({ id: req('Attachment id is required') }),
  'report.dashboard': z.object({ projectKey: z.string().optional(), filters: dashboardFilters }),
  'report.export': z.object({ projectKey: z.string().optional(), filters: dashboardFilters }),

  // repository writes
  'repo.createFolder': z.object({
    name: req('Folder name is required'),
    parentId: z.string().nullable().default(null),
    vendorCode: vendorCode.optional(),
    projectKey: z.string().optional(),
  }),
  'repo.updateFolder': z.object({
    id: req('Folder id is required'),
    patch: z
      .object({ name: z.string().optional(), vendorCode: vendorCode.nullable().optional() })
      .partial(),
  }),
  'repo.deleteFolder': z.object({ id: req('Folder id is required') }),
  'repo.createCase': z.object({ folderId: req('folderId is required'), ...caseFields }),
  'repo.updateCase': z.object({
    id: req('Test case id is required'),
    patch: z
      .object({ folderId: z.string().optional(), ...caseFields })
      .partial()
      .optional(),
  }),
  'repo.deleteCase': z.object({ id: req('Test case id is required') }),
  'repo.duplicateCase': z.object({ id: req('Test case id is required') }),
  'repo.importCases': z.object({
    folderId: req('folderId is required'),
    rows: z.array(importedRow).min(1, 'No rows to import'),
  }),

  // runs / execution
  'run.create': z.object({
    name: req('Run name is required'),
    environment: environment.optional(),
    testCaseIds: z.array(z.string()).min(1, 'Select at least one test case'),
    assigneeName: z.string().optional(),
    packageId: z.string().nullish(),
  }),
  'run.update': z.object({
    id: req('Run id is required'),
    patch: z
      .object({ name: z.string().optional(), assigneeName: z.string().nullish(), packageId: z.string().nullish() })
      .optional(),
  }),
  'run.setStage': z.object({ id: req('Run id is required'), stage: runStage }),
  'run.signOff': z.object({
    id: req('Run id is required'),
    decision: signOffDecision,
    approverName: req('Approver name is required'),
    note: z.string().optional(),
  }),
  'run.delete': z.object({ id: req('Run id is required') }),

  // packages
  'package.create': z.object({
    name: req('Package name is required'),
    packageType: testType.optional(),
    runIds: z.array(z.string()).optional(),
  }),
  'package.delete': z.object({ id: req('Package id is required') }),
  'package.signOff': z.object({
    id: req('Package id is required'),
    decision: signOffDecision,
    approverName: req('Approver name is required'),
    note: z.string().optional(),
  }),

  // suites (reusable case sets)
  'suite.list': z.object({ projectKey: z.string().optional() }),
  'suite.get': z.object({ id: req('Suite id is required') }),
  'suite.create': z.object({
    name: req('Suite name is required'),
    description: z.string().optional(),
    caseIds: z.array(z.string()).min(1, 'Select at least one test case'),
  }),
  'suite.update': z.object({
    id: req('Suite id is required'),
    patch: z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        caseIds: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  'suite.delete': z.object({ id: req('Suite id is required') }),

  // execution steps / attachments / defects
  'exec.setStep': z.object({
    executionId: req('executionId and stepResultId are required'),
    stepResultId: req('executionId and stepResultId are required'),
    patch: z
      .object({ status: executionStatus.optional(), actualResult: z.string().optional(), notes: z.string().optional() })
      .optional(),
  }),
  'exec.addAttachment': z.object({
    stepResultId: req('stepResultId is required'),
    filename: z.string().default(''),
    contentType: z.string().default(''),
    dataBase64: req('Attachment content is required'),
  }),
  'exec.deleteAttachment': z.object({ id: req('Attachment id is required') }),
  'exec.complete': z.object({ id: req('Execution id is required') }),
  'defect.create': z.object({
    executionId: req('executionId is required'),
    input: z.object({
      summary: req('Defect summary is required'),
      description: z.string().optional(),
      severity: priority.optional(),
    }),
  }),
  'jira.search': z.object({ query: z.string().optional() }),
  'defect.toJira': z.object({ id: req('Defect id is required'), issueType: z.string().optional() }),
  'defect.linkJira': z.object({ id: req('Defect id is required'), jiraIssueKey: req('A Jira issue key is required') }),

  // administration
  'admin.setRole': z.object({ accountId: req('accountId is required'), role }),
  'admin.createUser': z.object({
    email: req('Email is required'),
    displayName: req('Name is required'),
    role,
    password: reqMin(8, 'Temporary password must be at least 8 characters'),
  }),
  'admin.resetPassword': z.object({
    accountId: req('accountId is required'),
    password: reqMin(8, 'Temporary password must be at least 8 characters'),
  }),
  'admin.deleteUser': z.object({ accountId: req('accountId is required') }),
  'account.changePassword': z.object({
    currentPassword: req('Current and new passwords are required'),
    newPassword: z
      .string({
        required_error: 'Current and new passwords are required',
        invalid_type_error: 'Current and new passwords are required',
      })
      .min(8, 'New password must be at least 8 characters'),
  }),
} satisfies Record<string, z.ZodTypeAny>;

export type SchemaKey = keyof typeof schemas;

export function hasSchema(key: string): key is SchemaKey {
  return key in schemas;
}

/**
 * Validate `payload` against a key's schema, returning the typed result. Throws
 * DispatchError(400) with the first issue's message on failure.
 */
export function parse<K extends SchemaKey>(key: K, payload: unknown): z.infer<(typeof schemas)[K]> {
  const result = schemas[key].safeParse(payload ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new DispatchError(first?.message ?? 'Invalid request payload', 400);
  }
  return result.data as z.infer<(typeof schemas)[K]>;
}
