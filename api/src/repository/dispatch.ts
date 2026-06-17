/**
 * Resolver-style dispatch: maps an invoke `key` + `payload` to a store call.
 * The frontend posts {key, payload} to /api/invoke; this mirrors the keys the
 * Forge resolver and the in-browser mock handle, so all three backends are
 * interchangeable behind the same frontend.
 */

import { Role } from '@prisma/client';
import type { TestCaseStore } from './store';
import { prisma } from '../db/prisma';
import { changeOwnPassword, createUser, setUserPassword } from '../lib/identity';
import { jiraBrowseUrl, jiraCheck, jiraConfigured, jiraCreateProblem, jiraOptions } from '../services/jira';
import type {
  AddAttachmentInput,
  CreateDefectInput,
  CreateFolderInput,
  CreatePackageInput,
  CreateRunInput,
  CreateTestCaseInput,
  DashboardFilters,
  ExecutionStatus,
  ImportedCaseRow,
  RunStage,
  SignOffDecision,
  StepResultPatch,
  UpdateRunInput,
  UpdateTestCaseInput,
} from '../domain/types';

/** Marking a step to one of these requires a screenshot when the step demands one. */
const TERMINAL_STATUSES: ExecutionStatus[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'ENHANCEMENT'];

const RUN_STAGES: RunStage[] = [
  'IN_PROGRESS',
  'COMPLETED_BY_TESTER',
  'IN_QC_REVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
];

export class DispatchError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}

export async function dispatch(
  store: TestCaseStore,
  key: string,
  payload: Record<string, unknown>,
  accountId: string,
  role: Role = Role.OBSERVER,
): Promise<unknown> {
  switch (key) {
    case 'getContext': {
      const user = await prisma.userRole.findUnique({
        where: { subjectId: accountId },
        select: { displayName: true, mustChangePassword: true },
      });
      return {
        accountId,
        displayName: user?.displayName ?? accountId,
        role,
        mustChangePassword: user?.mustChangePassword ?? false,
        currentIssueKey: null,
      };
    }

    case 'repo.getFolderTree':
      return store.getFolderTree(payload.projectKey as string | undefined);

    case 'repo.createFolder': {
      const input = payload as unknown as CreateFolderInput;
      if (!input.name || !input.name.trim()) throw new DispatchError('Folder name is required');
      return store.createFolder(input);
    }

    case 'repo.listCases':
      return store.listCases(payload.folderId as string | undefined);

    case 'repo.getCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      return store.getCase(id);
    }

    case 'repo.createCase': {
      const input = payload as unknown as CreateTestCaseInput;
      if (!input.folderId) throw new DispatchError('folderId is required');
      if (!input.title || !input.title.trim()) throw new DispatchError('Title is required');
      return store.createCase(input, accountId);
    }

    case 'repo.updateCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      const updated = await store.updateCase(id, (payload.patch ?? {}) as UpdateTestCaseInput);
      if (!updated) throw new DispatchError(`Test case ${id} not found`, 404);
      return updated;
    }

    case 'repo.deleteCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      return { deleted: await store.deleteCase(id) };
    }

    case 'repo.duplicateCase': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Test case id is required');
      const copy = await store.duplicateCase(id);
      if (!copy) throw new DispatchError(`Test case ${id} not found`, 404);
      return copy;
    }

    case 'repo.importCases': {
      const folderId = payload.folderId as string | undefined;
      const rows = payload.rows as ImportedCaseRow[] | undefined;
      if (!folderId) throw new DispatchError('folderId is required');
      if (!Array.isArray(rows) || rows.length === 0) throw new DispatchError('No rows to import');
      return store.importCases(folderId, rows, accountId);
    }

    // ---------- runs / execution / reporting ----------

    case 'run.list':
      return store.listRuns(payload.projectKey as string | undefined);

    case 'run.create': {
      const input = payload as unknown as CreateRunInput;
      if (!input.name || !input.name.trim()) throw new DispatchError('Run name is required');
      if (!Array.isArray(input.testCaseIds) || input.testCaseIds.length === 0) {
        throw new DispatchError('Select at least one test case');
      }
      return store.createRun(input, accountId);
    }

    case 'run.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Run id is required');
      return store.getRun(id);
    }

    case 'run.update': {
      const { id, patch } = payload as { id?: string; patch?: UpdateRunInput };
      if (!id) throw new DispatchError('Run id is required');
      const updated = await store.updateRun(id, patch ?? {});
      if (!updated) throw new DispatchError('Run not found', 404);
      return updated;
    }

    case 'run.setStage': {
      const { id, stage } = payload as { id?: string; stage?: RunStage };
      if (!id) throw new DispatchError('Run id is required');
      if (!stage || !RUN_STAGES.includes(stage)) throw new DispatchError('A valid run stage is required');
      // A tester may only submit their run for QC (→ COMPLETED_BY_TESTER); every
      // other transition — QC review, ready-for-approval, sending it back — is
      // manager-controlled. See ENHANCEMENTS #10.
      const isManager = role === Role.SUPER_ADMIN || role === Role.TEST_MANAGER;
      if (!isManager && stage !== 'COMPLETED_BY_TESTER') {
        throw new DispatchError('Only a manager can advance a run through QC.', 403);
      }
      const updated = await store.setRunStage(id, stage);
      if (!updated) throw new DispatchError('Run not found', 404);
      return updated;
    }

    case 'run.signOff': {
      // In-app approval sign-off (manager-gated in the permission map). Only a
      // run that's been QC'd to READY_FOR_APPROVAL can be signed off. The
      // reviewer name + decision are recorded either way. See ENHANCEMENTS #11.
      const { id, decision, approverName, note } = payload as {
        id?: string;
        decision?: SignOffDecision;
        approverName?: string;
        note?: string;
      };
      if (!id) throw new DispatchError('Run id is required');
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        throw new DispatchError('A valid decision (APPROVED or REJECTED) is required');
      }
      if (!approverName || !approverName.trim()) throw new DispatchError('Approver name is required');
      const run = await store.getRun(id);
      if (!run) throw new DispatchError('Run not found', 404);
      if (run.stage !== 'READY_FOR_APPROVAL') {
        throw new DispatchError('Only a run marked ready for approval can be signed off.', 400);
      }
      return store.signOffRun(id, { decision, approverName, note });
    }

    case 'run.delete': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Run id is required');
      return { deleted: await store.deleteRun(id) };
    }

    // ---------- packages ----------

    case 'package.list':
      return store.listPackages(payload.projectKey as string | undefined);

    case 'package.create': {
      const input = payload as unknown as CreatePackageInput;
      if (!input.name || !input.name.trim()) throw new DispatchError('Package name is required');
      return store.createPackage(input, accountId);
    }

    case 'package.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Package id is required');
      return store.getPackage(id);
    }

    case 'package.delete': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Package id is required');
      return { deleted: await store.deletePackage(id) };
    }

    case 'exec.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Execution id is required');
      return store.getExecution(id);
    }

    case 'exec.setStep': {
      const { executionId, stepResultId, patch } = payload as {
        executionId?: string;
        stepResultId?: string;
        patch?: StepResultPatch;
      };
      if (!executionId || !stepResultId) throw new DispatchError('executionId and stepResultId are required');
      // Screenshot gate: a step the builder marked screenshot-required can't be
      // set to a disposition until a screenshot is attached. See ENHANCEMENTS #6.
      if (patch?.status && TERMINAL_STATUSES.includes(patch.status)) {
        const gate = await store.getStepResultGate(stepResultId);
        if (gate?.screenshotRequired && !gate.hasAttachment) {
          throw new DispatchError('This step requires a screenshot before it can be marked.', 400);
        }
      }
      const updated = await store.setStepResult(executionId, stepResultId, patch ?? {});
      if (!updated) throw new DispatchError('Execution not found', 404);
      return updated;
    }

    case 'exec.addAttachment': {
      const input = payload as unknown as AddAttachmentInput;
      if (!input.stepResultId) throw new DispatchError('stepResultId is required');
      if (!input.dataBase64) throw new DispatchError('Attachment content is required');
      const res = await store.addAttachment(input, accountId);
      if (!res) throw new DispatchError('Step result not found', 404);
      return res;
    }

    case 'exec.deleteAttachment': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Attachment id is required');
      const res = await store.deleteAttachment(id);
      if (!res) throw new DispatchError('Attachment not found', 404);
      return res;
    }

    case 'attachment.get': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Attachment id is required');
      return store.getAttachment(id);
    }

    case 'exec.complete': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Execution id is required');
      const done = await store.completeExecution(id, accountId);
      if (!done) throw new DispatchError('Execution not found', 404);
      return done;
    }

    case 'defect.create': {
      const { executionId, input } = payload as { executionId?: string; input?: CreateDefectInput };
      if (!executionId) throw new DispatchError('executionId is required');
      if (!input?.summary || !input.summary.trim()) throw new DispatchError('Defect summary is required');
      const res = await store.createDefect(executionId, input, accountId);
      if (!res) throw new DispatchError('Execution not found', 404);
      return res;
    }

    case 'jira.check':
      return jiraCheck();

    case 'jira.options':
      return jiraOptions();

    case 'defect.toJira': {
      const id = payload.id as string | undefined;
      if (!id) throw new DispatchError('Defect id is required');
      const defect = await store.getDefect(id);
      if (!defect) throw new DispatchError('Defect not found', 404);
      if (!jiraConfigured()) throw new DispatchError('Jira is not configured', 400);
      if (defect.jiraIssueKey) return store.getExecution(defect.executionId); // already linked — idempotent
      try {
        const { key, url } = await jiraCreateProblem({
          summary: defect.summary,
          description: defect.description,
          severity: defect.severity,
          issueType: payload.issueType as string | undefined,
        });
        return store.attachJiraKey(id, key, { url });
      } catch (err) {
        throw new DispatchError(err instanceof Error ? err.message : 'Jira create failed', 502);
      }
    }

    case 'defect.linkJira': {
      // Manually link an EXISTING Jira issue key — no ticket is created. The
      // manager confirms the bug and pastes the key. See ENHANCEMENTS #7.
      const id = payload.id as string | undefined;
      const rawKey = (payload.jiraIssueKey as string | undefined) ?? '';
      const key = rawKey.trim().toUpperCase();
      if (!id) throw new DispatchError('Defect id is required');
      if (!key) throw new DispatchError('A Jira issue key is required');
      const defect = await store.getDefect(id);
      if (!defect) throw new DispatchError('Defect not found', 404);
      const url = jiraBrowseUrl(key);
      const res = await store.attachJiraKey(id, key, url ? { url } : undefined);
      if (!res) throw new DispatchError('Defect not found', 404);
      return res;
    }

    case 'report.dashboard':
      return store.getDashboard(payload.projectKey as string | undefined, (payload.filters ?? {}) as DashboardFilters);

    case 'report.export':
      return store.getReport(payload.projectKey as string | undefined, (payload.filters ?? {}) as DashboardFilters);

    // ---------- administration (SUPER_ADMIN only; gated in permissions map) ----------

    case 'admin.listUsers':
      return prisma.userRole.findMany({
        orderBy: { displayName: 'asc' },
        select: {
          subjectId: true,
          displayName: true,
          email: true,
          role: true,
          updatedAt: true,
        },
      });

    case 'admin.setRole': {
      const targetAccountId = payload.accountId as string | undefined;
      const nextRole = payload.role as string | undefined;
      if (!targetAccountId) throw new DispatchError('accountId is required');
      if (!nextRole || !(nextRole in Role)) throw new DispatchError('A valid role is required');
      const target = await prisma.userRole.findUnique({
        where: { subjectId: targetAccountId },
        select: { role: true },
      });
      if (!target) throw new DispatchError('User not found', 404);
      // Guard against removing the last super admin (lockout protection).
      if (target.role === Role.SUPER_ADMIN && nextRole !== Role.SUPER_ADMIN) {
        const admins = await prisma.userRole.count({ where: { role: Role.SUPER_ADMIN } });
        if (admins <= 1) throw new DispatchError('Cannot demote the last super admin', 400);
      }
      return prisma.userRole.update({
        where: { subjectId: targetAccountId },
        data: { role: nextRole as Role },
        select: { subjectId: true, displayName: true, email: true, role: true },
      });
    }

    case 'admin.createUser': {
      const email = payload.email as string | undefined;
      const displayName = payload.displayName as string | undefined;
      const newRole = payload.role as string | undefined;
      const password = payload.password as string | undefined;
      if (!email || !email.trim()) throw new DispatchError('Email is required');
      if (!displayName || !displayName.trim()) throw new DispatchError('Name is required');
      if (!newRole || !(newRole in Role)) throw new DispatchError('A valid role is required');
      if (!password || password.length < 8) {
        throw new DispatchError('Temporary password must be at least 8 characters');
      }
      try {
        return await createUser({ email, displayName, role: newRole as Role, password });
      } catch (err) {
        throw new DispatchError(err instanceof Error ? err.message : 'Could not create user');
      }
    }

    case 'admin.resetPassword': {
      const targetAccountId = payload.accountId as string | undefined;
      const password = payload.password as string | undefined;
      if (!targetAccountId) throw new DispatchError('accountId is required');
      if (!password || password.length < 8) {
        throw new DispatchError('Temporary password must be at least 8 characters');
      }
      const updated = await setUserPassword(targetAccountId, password);
      if (!updated) throw new DispatchError('User not found', 404);
      return updated;
    }

    case 'account.changePassword': {
      const currentPassword = payload.currentPassword as string | undefined;
      const newPassword = payload.newPassword as string | undefined;
      if (!currentPassword || !newPassword) {
        throw new DispatchError('Current and new passwords are required');
      }
      if (newPassword.length < 8) {
        throw new DispatchError('New password must be at least 8 characters');
      }
      const result = await changeOwnPassword(accountId, currentPassword, newPassword);
      if (!result.ok) throw new DispatchError(result.reason ?? 'Could not change password');
      return { ok: true };
    }

    default:
      throw new DispatchError(`Unknown invoke key "${key}"`, 404);
  }
}
