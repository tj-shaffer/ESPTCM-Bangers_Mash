/**
 * Audit trail for mutations.
 *
 * Every successful write through /api/invoke records a change-log row (actor,
 * action = invoke key, entity, ip). Security-critical state changes — role
 * changes and approval sign-offs — additionally record before/after via a
 * `recordAudit` call inside dispatch (those keys are listed in SELF_AUDITED so
 * the route doesn't double-log them).
 *
 * Replaces the earlier post-response middleware, which could only see the
 * generic request and never the entity or its prior state.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

/** Invoke keys that mutate state and should be audited. Reads are excluded. */
export const WRITE_KEYS: ReadonlySet<string> = new Set([
  'repo.createFolder',
  'repo.updateFolder',
  'repo.deleteFolder',
  'repo.createCase',
  'repo.updateCase',
  'repo.deleteCase',
  'repo.duplicateCase',
  'repo.importCases',
  'run.create',
  'run.update',
  'run.setStage',
  'run.signOff',
  'run.delete',
  'package.create',
  'package.delete',
  'package.signOff',
  'exec.setStep',
  'exec.addAttachment',
  'exec.deleteAttachment',
  'exec.complete',
  'defect.create',
  'defect.toJira',
  'defect.linkJira',
  'admin.setRole',
  'admin.createUser',
  'admin.resetPassword',
  'admin.deleteUser',
  'account.changePassword',
]);

/**
 * Keys that write their own richer before/after entry inside dispatch. The
 * route skips its baseline entry for these so each action logs exactly once.
 */
export const SELF_AUDITED: ReadonlySet<string> = new Set([
  'admin.setRole',
  'admin.deleteUser',
  'run.signOff',
  'package.signOff',
]);

/** Entity type from an invoke key, e.g. "run.setStage" -> "run". */
export function auditEntityType(key: string): string {
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

/** Best-effort target id from a payload, for the audit row. */
export function auditEntityId(payload: Record<string, unknown>): string {
  const candidate =
    payload.id ?? payload.accountId ?? payload.executionId ?? payload.stepResultId ?? payload.folderId;
  return typeof candidate === 'string' && candidate ? candidate : 'n/a';
}

export interface AuditInput {
  actorAccountId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * Write one audit row. Never throws — auditing must not break the request it
 * describes; failures are logged and swallowed.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const data: Prisma.AuditLogCreateInput = {
      actorAccountId: input.actorAccountId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ipAddress: input.ipAddress ?? null,
    };
    if (input.before !== undefined) data.before = input.before as Prisma.InputJsonValue;
    if (input.after !== undefined) data.after = input.after as Prisma.InputJsonValue;
    await prisma.auditLog.create({ data });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to write entry', err);
  }
}
