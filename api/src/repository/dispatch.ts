/**
 * Resolver-style dispatch: maps an invoke `key` + `payload` to a store call.
 * The frontend posts {key, payload} to /api/invoke; this mirrors the keys the
 * in-browser mock handles, so both backends are interchangeable behind the same
 * frontend.
 *
 * Payloads are validated by `parse(key, payload)` (see schemas.ts), which throws
 * DispatchError(400) on malformed input and returns a typed value — so the arms
 * below consume already-validated input with no casts.
 */

import { Role } from '@prisma/client';
import type { TestCaseStore } from './store';
import { prisma } from '../db/prisma';
import { changeOwnPassword, createUser, setUserPassword } from '../lib/identity';
import { recordAudit, auditEntityType } from '../lib/audit';
import { isManager } from './permissions';
import { DispatchError } from './errors';
import { parse } from './schemas';
import { jiraBrowseUrl, jiraCheck, jiraConfigured, jiraCreateProblem, jiraOptions, jiraSearch } from '../services/jira';
import type { ExecutionStatus } from '../domain/types';

/** Marking a step to one of these requires a screenshot when the step demands one. */
const TERMINAL_STATUSES: ExecutionStatus[] = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED', 'ENHANCEMENT'];

export { DispatchError } from './errors';

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
      return store.getFolderTree(parse(key, payload).projectKey);

    case 'repo.createFolder':
      return store.createFolder(parse(key, payload));

    case 'repo.listCases':
      return store.listCases(parse(key, payload).folderId);

    case 'repo.getCase':
      return store.getCase(parse(key, payload).id);

    case 'repo.createCase':
      return store.createCase(parse(key, payload), accountId);

    case 'repo.updateCase': {
      const { id, patch } = parse(key, payload);
      const updated = await store.updateCase(id, patch ?? {});
      if (!updated) throw new DispatchError(`Test case ${id} not found`, 404);
      return updated;
    }

    case 'repo.deleteCase': {
      const ok = await store.deleteCase(parse(key, payload).id);
      if (!ok) throw new DispatchError('Could not delete this test case.', 409);
      return { deleted: true };
    }

    case 'repo.duplicateCase': {
      const { id } = parse(key, payload);
      const copy = await store.duplicateCase(id);
      if (!copy) throw new DispatchError(`Test case ${id} not found`, 404);
      return copy;
    }

    case 'repo.importCases': {
      const { folderId, rows } = parse(key, payload);
      return store.importCases(folderId, rows, accountId);
    }

    // ---------- runs / execution / reporting ----------

    case 'run.list':
      return store.listRuns(parse(key, payload).projectKey);

    case 'run.create':
      return store.createRun(parse(key, payload), accountId);

    case 'run.get':
      return store.getRun(parse(key, payload).id);

    case 'run.update': {
      const { id, patch } = parse(key, payload);
      const updated = await store.updateRun(id, patch ?? {});
      if (!updated) throw new DispatchError('Run not found', 404);
      return updated;
    }

    case 'run.setStage': {
      const { id, stage } = parse(key, payload);
      // A tester may only submit their run for QC (→ COMPLETED_BY_TESTER); every
      // other transition — QC review, ready-for-approval, sending it back — is
      // manager-controlled. See ENHANCEMENTS #10.
      if (!isManager(role) && stage !== 'COMPLETED_BY_TESTER') {
        throw new DispatchError('Only a manager can advance a run through QC.', 403);
      }
      const updated = await store.setRunStage(id, stage);
      if (!updated) throw new DispatchError('Run not found', 404);
      return updated;
    }

    case 'run.signOff': {
      // In-app approval sign-off (manager-gated in the permission map). Only a
      // run that's been QC'd to READY_FOR_APPROVAL can be signed off. See
      // ENHANCEMENTS #11.
      const { id, decision, approverName, note } = parse(key, payload);
      const run = await store.getRun(id);
      if (!run) throw new DispatchError('Run not found', 404);
      if (run.stage !== 'READY_FOR_APPROVAL') {
        throw new DispatchError('Only a run marked ready for approval can be signed off.', 400);
      }
      const signedOff = await store.signOffRun(id, { decision, approverName, note });
      await recordAudit({
        actorAccountId: accountId,
        action: 'run.signOff',
        entityType: auditEntityType('run.signOff'),
        entityId: id,
        before: { stage: run.stage },
        after: { decision, approverName },
      });
      return signedOff;
    }

    case 'run.delete':
      return { deleted: await store.deleteRun(parse(key, payload).id) };

    // ---------- packages ----------

    case 'package.list':
      return store.listPackages(parse(key, payload).projectKey);

    case 'package.create':
      return store.createPackage(parse(key, payload), accountId);

    case 'package.get':
      return store.getPackage(parse(key, payload).id);

    case 'package.delete':
      return { deleted: await store.deletePackage(parse(key, payload).id) };

    case 'package.signOff': {
      // Package-level in-app approval (manager-gated). A package can be signed
      // off once at least one member run is QC'd to READY_FOR_APPROVAL. See
      // ENHANCEMENTS #11.
      const { id, decision, approverName, note } = parse(key, payload);
      const pkg = await store.getPackage(id);
      if (!pkg) throw new DispatchError('Package not found', 404);
      if (!pkg.runs.some((r) => r.stage === 'READY_FOR_APPROVAL')) {
        throw new DispatchError('No runs in this package are ready for approval.', 400);
      }
      const signedOff = await store.signOffPackage(id, { decision, approverName, note });
      await recordAudit({
        actorAccountId: accountId,
        action: 'package.signOff',
        entityType: auditEntityType('package.signOff'),
        entityId: id,
        before: { approvedAt: pkg.approvedAt ?? null },
        after: { decision, approverName },
      });
      return signedOff;
    }

    case 'exec.get':
      return store.getExecution(parse(key, payload).id);

    case 'exec.setStep': {
      const { executionId, stepResultId, patch } = parse(key, payload);
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
      const res = await store.addAttachment(parse(key, payload), accountId);
      if (!res) throw new DispatchError('Step result not found', 404);
      return res;
    }

    case 'exec.deleteAttachment': {
      const res = await store.deleteAttachment(parse(key, payload).id);
      if (!res) throw new DispatchError('Attachment not found', 404);
      return res;
    }

    case 'attachment.get':
      return store.getAttachment(parse(key, payload).id);

    case 'exec.complete': {
      const done = await store.completeExecution(parse(key, payload).id, accountId);
      if (!done) throw new DispatchError('Execution not found', 404);
      return done;
    }

    case 'defect.create': {
      const { executionId, input } = parse(key, payload);
      const res = await store.createDefect(executionId, input, accountId);
      if (!res) throw new DispatchError('Execution not found', 404);
      return res;
    }

    case 'jira.check':
      return jiraCheck();

    case 'jira.options':
      return jiraOptions();

    case 'jira.search':
      return jiraSearch(parse(key, payload).query ?? '');

    case 'defect.toJira': {
      const { id, issueType } = parse(key, payload);
      const defect = await store.getDefect(id);
      if (!defect) throw new DispatchError('Defect not found', 404);
      if (!jiraConfigured()) throw new DispatchError('Jira is not configured', 400);
      if (defect.jiraIssueKey) return store.getExecution(defect.executionId); // already linked — idempotent
      try {
        const { key: issueKey, url } = await jiraCreateProblem({
          summary: defect.summary,
          description: defect.description,
          severity: defect.severity,
          issueType,
        });
        return store.attachJiraKey(id, issueKey, { url });
      } catch (err) {
        throw new DispatchError(err instanceof Error ? err.message : 'Jira create failed', 502);
      }
    }

    case 'defect.linkJira': {
      // Manually link an EXISTING Jira issue key — no ticket is created. The
      // manager confirms the bug and pastes the key. See ENHANCEMENTS #7.
      const { id, jiraIssueKey } = parse(key, payload);
      const issueKey = jiraIssueKey.trim().toUpperCase();
      if (!issueKey) throw new DispatchError('A Jira issue key is required');
      const defect = await store.getDefect(id);
      if (!defect) throw new DispatchError('Defect not found', 404);
      const url = jiraBrowseUrl(issueKey);
      const res = await store.attachJiraKey(id, issueKey, url ? { url } : undefined);
      if (!res) throw new DispatchError('Defect not found', 404);
      return res;
    }

    case 'meta.projects': {
      // Distinct Jira project keys across folders, plans, and packages — powers
      // the dashboard's project filter.
      const [folders, plans, packages] = await Promise.all([
        prisma.testFolder.findMany({ distinct: ['projectKey'], select: { projectKey: true } }),
        prisma.testPlan.findMany({ distinct: ['projectKey'], select: { projectKey: true } }),
        prisma.package.findMany({ distinct: ['projectKey'], select: { projectKey: true } }),
      ]);
      return [...new Set([...folders, ...plans, ...packages].map((r) => r.projectKey))].sort();
    }

    case 'report.dashboard': {
      const { projectKey, filters } = parse(key, payload);
      return store.getDashboard(projectKey, filters ?? {});
    }

    case 'report.export': {
      const { projectKey, filters } = parse(key, payload);
      return store.getReport(projectKey, filters ?? {});
    }

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
      const { accountId: targetAccountId, role: nextRole } = parse(key, payload);
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
      const updatedUser = await prisma.userRole.update({
        where: { subjectId: targetAccountId },
        data: { role: nextRole },
        select: { subjectId: true, displayName: true, email: true, role: true },
      });
      await recordAudit({
        actorAccountId: accountId,
        action: 'admin.setRole',
        entityType: auditEntityType('admin.setRole'),
        entityId: targetAccountId,
        before: { role: target.role },
        after: { role: updatedUser.role },
      });
      return updatedUser;
    }

    case 'admin.createUser': {
      const { email, displayName, role: newRole, password } = parse(key, payload);
      try {
        return await createUser({ email, displayName, role: newRole, password });
      } catch (err) {
        throw new DispatchError(err instanceof Error ? err.message : 'Could not create user');
      }
    }

    case 'admin.resetPassword': {
      const { accountId: targetAccountId, password } = parse(key, payload);
      const updated = await setUserPassword(targetAccountId, password);
      if (!updated) throw new DispatchError('User not found', 404);
      return updated;
    }

    case 'admin.deleteUser': {
      // Completely remove a user account (revokes their access — there is no
      // separate "disable"; owned cases/runs keep their string id, no FK).
      const { accountId: targetAccountId } = parse(key, payload);
      if (targetAccountId === accountId) throw new DispatchError('You cannot delete your own account', 400);
      const target = await prisma.userRole.findUnique({
        where: { subjectId: targetAccountId },
        select: { role: true, email: true },
      });
      if (!target) throw new DispatchError('User not found', 404);
      // Never strand the app without a super admin.
      if (target.role === Role.SUPER_ADMIN) {
        const admins = await prisma.userRole.count({ where: { role: Role.SUPER_ADMIN } });
        if (admins <= 1) throw new DispatchError('Cannot delete the last super admin', 400);
      }
      await prisma.userRole.delete({ where: { subjectId: targetAccountId } });
      await recordAudit({
        actorAccountId: accountId,
        action: 'admin.deleteUser',
        entityType: auditEntityType('admin.deleteUser'),
        entityId: targetAccountId,
        before: { role: target.role, email: target.email },
      });
      return { deleted: true };
    }

    case 'account.changePassword': {
      const { currentPassword, newPassword } = parse(key, payload);
      const result = await changeOwnPassword(accountId, currentPassword, newPassword);
      if (!result.ok) throw new DispatchError(result.reason ?? 'Could not change password');
      return { ok: true };
    }

    default:
      throw new DispatchError(`Unknown invoke key "${key}"`, 404);
  }
}
