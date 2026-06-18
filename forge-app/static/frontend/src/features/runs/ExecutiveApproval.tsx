/** Executive approval — a one-screen verdict for a run that's ready to approve
 *  (or already approved). Built for a VP/exec signing off, not auditing steps:
 *  pass/fail rollup, the cases that failed, who tested, environment — then the
 *  Approve / Reject sign-off (reused from ApprovalPanel, manager/admin-gated). */

import Spinner from '@atlaskit/spinner';
import { Modal } from '../../components/ui';
import { useRun } from '../../api/runs';
import { useAuth } from '../../context/AuthContext';
import { RUN_STAGE_LABEL, tcId } from '../../domain/types';
import type { RunExecutionSummary } from '../../domain/types';
import { ExecBadge } from './ExecutionRunner';
import { ApprovalPanel } from './runStageControls';
import { Icon } from '../../components/Icon';

export function ExecutiveApproval({
  runId,
  onExit,
  onResult,
}: {
  runId: string;
  onExit: () => void;
  onResult: (msg: string) => void;
}) {
  const auth = useAuth();
  const canSignOff = auth.can('run.signOff');
  const run = useRun(runId);
  const detail = run.data;

  const counts = tally(detail?.executions ?? []);
  const attention = (detail?.executions ?? []).filter((e) => e.status === 'FAIL' || e.status === 'BLOCKED');

  return (
    <Modal
      title={detail ? detail.name : 'Approval'}
      onClose={onExit}
      footer={
        <>
          {detail ? (
            <button
              className="esp-btn esp-btn-secondary"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                window.location.hash = `dashboard/${detail.id}`;
              }}
              title="See this run's results in the dashboard"
            >
              <Icon name="chart" /> View in dashboard
            </button>
          ) : null}
          <button className="esp-btn esp-btn-secondary" onClick={onExit}>
            Close
          </button>
        </>
      }
    >
      {run.isLoading || !detail ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="esp-badge esp-badge-soft">{detail.environment}</span>
            <ExecBadge status={detail.status} />
            <span className={`esp-stage esp-stage-${detail.stage}`}>{RUN_STAGE_LABEL[detail.stage]}</span>
          </div>

          <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>
            {counts.FAIL === 0 && counts.BLOCKED === 0
              ? 'All cases passed — ready to approve'
              : `${counts.FAIL} failing · ${counts.BLOCKED} blocked`}
          </h3>
          <div className="esp-muted" style={{ fontSize: 13, marginBottom: 4 }}>
            {counts.PASS} passed · {counts.FAIL} failed · {counts.BLOCKED} blocked · {counts.remaining} not run
          </div>
          <div className="esp-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Tester / assignee: <strong>{detail.assigneeName || '—'}</strong>
          </div>

          {attention.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div className="esp-label" style={{ marginBottom: 6 }}>Needs attention ({attention.length})</div>
              <div className="esp-list">
                {attention.map((e) => (
                  <div key={e.id} className="esp-case-row" style={{ cursor: 'default' }}>
                    <span className="esp-case-id">{tcId(e.displayId)}</span>
                    <div className="esp-case-main">
                      <div className="esp-case-title">{e.title}</div>
                    </div>
                    <ExecBadge status={e.status} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <ApprovalPanel
            run={detail}
            canSignOff={canSignOff}
            defaultApprover={auth.displayName ?? ''}
            onDone={(msg) => {
              onResult(msg);
              onExit();
            }}
          />
        </>
      )}
    </Modal>
  );
}

/** Count executions by the statuses the verdict surfaces, plus "remaining". */
function tally(executions: RunExecutionSummary[]) {
  let PASS = 0;
  let FAIL = 0;
  let BLOCKED = 0;
  let remaining = 0;
  for (const e of executions) {
    if (e.status === 'PASS') PASS++;
    else if (e.status === 'FAIL') FAIL++;
    else if (e.status === 'BLOCKED') BLOCKED++;
    if (e.status === 'NOT_STARTED' || e.status === 'IN_PROGRESS') remaining++;
  }
  return { PASS, FAIL, BLOCKED, remaining };
}
