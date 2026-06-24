/** Shared run-workflow controls used across the Pipeline board and the executive
 *  approval view: the QC stage-transition buttons and the approval sign-off panel.
 *  Extracted from the old RunsView so the board cards and the approval modal share
 *  one transition matrix and one sign-off form. */

import { useState } from 'react';
import { useSetRunStage, useSignOffPackage, useSignOffRun } from '../../api/runs';
import type { PackageDetail, TestRunDetail, TestRunSummary } from '../../domain/types';
import { Icon } from '../../components/Icon';

/** QC lifecycle transition buttons, shown by current stage + the user's role.
 *  Only reads `id`/`stage`, so a board card can pass a TestRunSummary directly. */
export function StageControls({
  run,
  isManager,
  canSubmit,
  onDone,
}: {
  run: Pick<TestRunSummary, 'id' | 'stage'>;
  isManager: boolean;
  canSubmit: boolean;
  onDone: (msg: string) => void;
}) {
  const setStage = useSetRunStage();
  const busy = setStage.isPending;
  const go = (stage: Parameters<typeof setStage.mutate>[0]['stage'], msg: string) =>
    setStage.mutate({ id: run.id, stage }, { onSuccess: () => onDone(msg) });

  return (
    <>
      {run.stage === 'IN_PROGRESS' && canSubmit ? (
        <button className="esp-btn esp-btn-secondary" disabled={busy} onClick={() => go('IN_QC_REVIEW', 'Submitted for QC review')}>
          Submit for QC review
        </button>
      ) : null}
      {isManager && run.stage === 'IN_QC_REVIEW' ? (
        <button className="esp-btn esp-btn-primary" disabled={busy} onClick={() => go('READY_FOR_APPROVAL', 'Marked ready for approval')}>
          Mark ready for approval
        </button>
      ) : null}
      {isManager && run.stage !== 'IN_PROGRESS' && run.stage !== 'APPROVED' ? (
        <button className="esp-btn esp-btn-ghost" disabled={busy} onClick={() => go('IN_PROGRESS', 'Sent back to in progress')}>
          Send back
        </button>
      ) : null}
    </>
  );
}

/** Approval sign-off — shown when a run is ready for approval, or its recorded
 *  decision once signed off. Identity-light: the approver name is captured, not
 *  enforced against a dedicated role. See ENHANCEMENTS #11. */
export function ApprovalPanel({
  run,
  canSignOff,
  defaultApprover,
  onDone,
}: {
  run: TestRunDetail;
  canSignOff: boolean;
  defaultApprover: string;
  onDone: (msg: string) => void;
}) {
  const signOff = useSignOffRun();
  const [approver, setApprover] = useState(defaultApprover);
  const [note, setNote] = useState('');

  if (run.stage === 'APPROVED') {
    return (
      <div className="esp-approval esp-approval-done">
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" /> Approved{run.approverName ? ` by ${run.approverName}` : ''}</strong>
        {run.approvedAt ? <span className="esp-muted"> · {new Date(run.approvedAt).toLocaleString()}</span> : null}
        {run.approvalNote ? <div className="esp-muted" style={{ marginTop: 4 }}>“{run.approvalNote}”</div> : null}
      </div>
    );
  }

  if (run.stage !== 'READY_FOR_APPROVAL') return null;

  if (!canSignOff) {
    return (
      <div className="esp-approval">
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="flag" /> Ready for approval</strong>
        <span className="esp-muted"> · awaiting sign-off from an approver.</span>
      </div>
    );
  }

  const go = (decision: 'APPROVED' | 'REJECTED') => {
    if (!approver.trim()) return;
    signOff.mutate(
      { id: run.id, decision, approverName: approver, note: note.trim() || undefined },
      { onSuccess: () => onDone(decision === 'APPROVED' ? 'Run approved' : 'Run sent back to testers') },
    );
  };

  return (
    <div className="esp-approval">
      <div className="esp-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="flag" size={12} /> Approval sign-off</div>
      <div className="esp-grid-2" style={{ marginBottom: 8 }}>
        <input
          className="esp-input"
          placeholder="Approver name (e.g. Alex)"
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
        />
      </div>
      <textarea
        className="esp-textarea"
        style={{ minHeight: 40, marginBottom: 8 }}
        placeholder="Note (optional) — e.g. reviewed the failed steps, OK to proceed"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="esp-btn esp-btn-primary"
          disabled={!approver.trim() || signOff.isPending}
          onClick={() => go('APPROVED')}
        >
          {signOff.isPending ? 'Saving…' : <><Icon name="check" /> Approve</>}
        </button>
        <button
          className="esp-btn esp-btn-danger"
          disabled={!approver.trim() || signOff.isPending}
          onClick={() => go('REJECTED')}
        >
          <Icon name="x" /> Reject &amp; send back
        </button>
      </div>
      {signOff.isError ? (
        <p className="esp-error" style={{ fontSize: 12, marginTop: 6 }}>{(signOff.error as Error).message}</p>
      ) : null}
    </div>
  );
}

/** Package-level sign-off — mirrors ApprovalPanel but signs off a whole package
 *  (which cascades to its ready member runs). "Approved" = approvedAt is set. */
export function PackageApprovalPanel({
  pkg,
  canSignOff,
  anyReady,
  defaultApprover,
  onDone,
}: {
  pkg: PackageDetail;
  canSignOff: boolean;
  /** True when ≥1 member run is at READY_FOR_APPROVAL (the dispatch guard). */
  anyReady: boolean;
  defaultApprover: string;
  onDone: (msg: string) => void;
}) {
  const signOff = useSignOffPackage();
  const [approver, setApprover] = useState(defaultApprover);
  const [note, setNote] = useState('');

  if (pkg.approvedAt) {
    return (
      <div className="esp-approval esp-approval-done">
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check" /> Approved{pkg.approverName ? ` by ${pkg.approverName}` : ''}</strong>
        <span className="esp-muted"> · {new Date(pkg.approvedAt).toLocaleString()}</span>
        {pkg.approvalNote ? <div className="esp-muted" style={{ marginTop: 4 }}>“{pkg.approvalNote}”</div> : null}
      </div>
    );
  }

  if (!canSignOff) {
    return (
      <div className="esp-approval">
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="flag" /> Cycle ready for review</strong>
        <span className="esp-muted"> · awaiting sign-off from an approver.</span>
      </div>
    );
  }

  if (!anyReady) {
    return (
      <div className="esp-approval">
        <strong>Not ready to approve</strong>
        <span className="esp-muted"> · no runs in this cycle are marked ready for approval yet.</span>
      </div>
    );
  }

  const go = (decision: 'APPROVED' | 'REJECTED') => {
    if (!approver.trim()) return;
    signOff.mutate(
      { id: pkg.id, decision, approverName: approver, note: note.trim() || undefined },
      { onSuccess: () => onDone(decision === 'APPROVED' ? 'Cycle approved' : 'Cycle sent back to testers') },
    );
  };

  return (
    <div className="esp-approval">
      <div className="esp-label" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="flag" size={12} /> Cycle sign-off</div>
      <div className="esp-grid-2" style={{ marginBottom: 8 }}>
        <input
          className="esp-input"
          placeholder="Approver name (e.g. Alex)"
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
        />
      </div>
      <textarea
        className="esp-textarea"
        style={{ minHeight: 40, marginBottom: 8 }}
        placeholder="Note (optional) — e.g. end-to-end reviewed, OK to release"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="esp-btn esp-btn-primary" disabled={!approver.trim() || signOff.isPending} onClick={() => go('APPROVED')}>
          {signOff.isPending ? 'Saving…' : <><Icon name="check" /> Approve cycle</>}
        </button>
        <button className="esp-btn esp-btn-danger" disabled={!approver.trim() || signOff.isPending} onClick={() => go('REJECTED')}>
          <Icon name="x" /> Reject &amp; send back
        </button>
      </div>
      {signOff.isError ? (
        <p className="esp-error" style={{ fontSize: 12, marginTop: 6 }}>{(signOff.error as Error).message}</p>
      ) : null}
    </div>
  );
}
