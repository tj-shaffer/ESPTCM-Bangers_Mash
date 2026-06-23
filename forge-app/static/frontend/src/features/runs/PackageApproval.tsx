/** Package-level executive approval — one end-to-end verdict over a bundle of
 *  runs (ENHANCEMENTS #11). Shows the aggregate pass/fail rollup, a per-run
 *  drill-down (Alex's "open each case"), and a single package sign-off that
 *  cascades to the ready member runs. Sibling to ExecutiveApproval (which is
 *  run-scoped); this one is package-scoped via usePackage. */

import Spinner from '@atlaskit/spinner';
import { Modal } from '../../components/ui';
import { usePackage } from '../../api/runs';
import { useAuth } from '../../context/AuthContext';
import { pkgId, RUN_STAGE_LABEL, TEST_TYPE_LABELS } from '../../domain/types';
import type { TestRunSummary } from '../../domain/types';
import { ExecBadge } from './ExecutionRunner';
import { Icon } from '../../components/Icon';
import { PackageApprovalPanel } from './runStageControls';

export function PackageApproval({
  packageId,
  onExit,
  onResult,
  onOpenRun,
}: {
  packageId: string;
  onExit: () => void;
  onResult: (msg: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const auth = useAuth();
  const canSignOff = auth.can('package.signOff');
  const pkg = usePackage(packageId);
  const detail = pkg.data;

  const runs = detail?.runs ?? [];
  const counts = tally(runs);
  const passRate =
    counts.PASS + counts.FAIL + counts.BLOCKED > 0
      ? Math.round((counts.PASS / (counts.PASS + counts.FAIL + counts.BLOCKED)) * 100)
      : 0;
  const anyReady = runs.some((r) => r.stage === 'READY_FOR_APPROVAL');

  return (
    <Modal
      title={detail ? `${pkgId(detail.displayId)} · ${detail.name}` : 'Package approval'}
      onClose={onExit}
      footer={
        <button className="esp-btn esp-btn-secondary" onClick={onExit}>
          Close
        </button>
      }
    >
      {pkg.isLoading || !detail ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="esp-badge esp-badge-soft">{TEST_TYPE_LABELS[detail.packageType]}</span>
            <ExecBadge status={detail.status} />
            <span className="esp-muted" style={{ fontSize: 12 }}>{runs.length} runs</span>
          </div>

          <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>
            {counts.PASS + counts.FAIL + counts.BLOCKED === 0
              ? 'No runs executed yet'
              : counts.FAIL === 0 && counts.BLOCKED === 0
                ? 'All executed runs passed'
                : `${counts.FAIL} failing · ${counts.BLOCKED} blocked across the package`}
          </h3>
          <div className="esp-muted" style={{ fontSize: 13, marginBottom: 14 }}>
            <strong>{passRate}% pass</strong> · {counts.PASS} passed · {counts.FAIL} failed · {counts.BLOCKED} blocked · {counts.remaining} not run
          </div>

          <div className="esp-label" style={{ marginBottom: 6 }}>Runs in this package ({runs.length})</div>
          <div className="esp-list" style={{ marginBottom: 14 }}>
            {runs.length === 0 ? (
              <div className="esp-empty">No runs in this package yet.</div>
            ) : (
              runs.map((r) => (
                <div key={r.id} className="esp-case-row" onClick={() => onOpenRun(r.id)} title="Open this run">
                  <div className="esp-case-main">
                    <div className="esp-case-title">{r.name}</div>
                    <div className="esp-case-meta">
                      {r.assigneeName ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="user" size={12} /> {r.assigneeName}</span>
                      ) : null}
                      <span>{r.environment}</span>
                      <span style={{ color: 'var(--esp-good)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="check" size={12} /> {r.passed}</span>
                      <span style={{ color: 'var(--esp-bad)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="x" size={12} /> {r.failed}</span>
                      <span style={{ color: 'var(--esp-amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="alert" size={12} /> {r.blocked}</span>
                      {r.enhancement > 0 ? (
                        <span title="Nice-to-have / known issues" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Icon name="flag" size={12} /> {r.enhancement}</span>
                      ) : null}
                      <span className="esp-muted">· {RUN_STAGE_LABEL[r.stage]}</span>
                    </div>
                  </div>
                  <ExecBadge status={r.status} />
                </div>
              ))
            )}
          </div>

          <PackageApprovalPanel
            pkg={detail}
            canSignOff={canSignOff}
            anyReady={anyReady}
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

/** Aggregate the package verdict across its member runs' rolled-up counts. */
function tally(runs: TestRunSummary[]) {
  let PASS = 0;
  let FAIL = 0;
  let BLOCKED = 0;
  let remaining = 0;
  for (const r of runs) {
    PASS += r.passed;
    FAIL += r.failed;
    BLOCKED += r.blocked;
    remaining += r.notStarted;
  }
  return { PASS, FAIL, BLOCKED, remaining };
}
