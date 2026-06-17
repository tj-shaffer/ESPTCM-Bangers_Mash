/** RunPlayer — the continuous runner. Steps a tester through every case in a run
 *  (prev/next + "Complete & next") without bouncing back to a list, then lands on
 *  an in-place RunSummary. Replaces the single-case modal for the author flow. */

import { useMemo, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { Modal } from '../../components/ui';
import { useCompleteExecution, useExecution, useRun, useSetRunStage } from '../../api/runs';
import { useAuth } from '../../context/AuthContext';
import { EXEC_STATUS_LABEL, tcId } from '../../domain/types';
import type { ExecutionStatus, RunExecutionSummary } from '../../domain/types';
import { ExecBadge, ExecutionBody } from './ExecutionRunner';

/** Cases needing attention sort first in the summary. */
const STATUS_RANK: Record<ExecutionStatus, number> = {
  FAIL: 0,
  BLOCKED: 1,
  IN_PROGRESS: 2,
  NOT_STARTED: 3,
  SKIPPED: 4,
  ENHANCEMENT: 5,
  PASS: 6,
};

export function RunPlayer({
  runId,
  initialExecutionId = null,
  onExit,
}: {
  runId: string;
  initialExecutionId?: string | null;
  onExit: () => void;
}) {
  const run = useRun(runId);
  const detail = run.data;

  if (run.isLoading) {
    return (
      <Modal title="Run" onClose={onExit}>
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      </Modal>
    );
  }

  if (!detail) {
    return (
      <Modal
        title="Run"
        onClose={onExit}
        footer={
          <button className="esp-btn esp-btn-secondary" onClick={onExit}>
            Back to runs
          </button>
        }
      >
        <div className="esp-empty">This run no longer exists.</div>
      </Modal>
    );
  }

  return <RunPlayerInner detail={detail} runId={runId} initialExecutionId={initialExecutionId} onExit={onExit} />;
}

function RunPlayerInner({
  detail,
  runId,
  initialExecutionId,
  onExit,
}: {
  detail: NonNullable<ReturnType<typeof useRun>['data']>;
  runId: string;
  initialExecutionId: string | null;
  onExit: () => void;
}) {
  const executions = detail.executions;
  const complete = useCompleteExecution(runId);

  // Start on the deep-linked/clicked case, else the first unfinished one, else case 1.
  const [index, setIndex] = useState(() => {
    if (initialExecutionId) {
      const i = executions.findIndex((e) => e.id === initialExecutionId);
      if (i >= 0) return i;
    }
    const firstOpen = executions.findIndex((e) => e.status === 'NOT_STARTED' || e.status === 'IN_PROGRESS');
    return firstOpen >= 0 ? firstOpen : 0;
  });
  const [mode, setMode] = useState<'run' | 'summary'>('run');

  const current: RunExecutionSummary | undefined = executions[index];
  const exec = useExecution(current?.id ?? null);

  const counts = useMemo(() => tally(executions), [executions]);

  if (executions.length === 0) {
    return (
      <Modal
        title={`Run: ${detail.name}`}
        onClose={onExit}
        footer={
          <button className="esp-btn esp-btn-secondary" onClick={onExit}>
            Close
          </button>
        }
      >
        <div className="esp-empty">This run has no cases.</div>
      </Modal>
    );
  }

  if (mode === 'summary') {
    return <RunSummary detail={detail} onReopen={(i) => { setIndex(i); setMode('run'); }} onExit={onExit} />;
  }

  const isLast = index >= executions.length - 1;
  const completeAndAdvance = () => {
    if (!current) return;
    complete.mutate(current.id, {
      onSuccess: () => (isLast ? setMode('summary') : setIndex(index + 1)),
    });
  };

  return (
    <Modal
      title={`Run: ${detail.name}`}
      onClose={onExit}
      footer={
        <>
          <span className="esp-muted" style={{ marginRight: 'auto', alignSelf: 'center', fontSize: 13 }}>
            Overall: <ExecBadge status={detail.status} />
          </span>
          <button className="esp-btn esp-btn-ghost" onClick={() => setMode('summary')}>
            View summary
          </button>
          <button className="esp-btn esp-btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ← Prev
          </button>
          <button className="esp-btn esp-btn-secondary" disabled={isLast} onClick={() => setIndex(index + 1)}>
            Skip →
          </button>
          <button className="esp-btn esp-btn-primary" disabled={complete.isPending} onClick={completeAndAdvance}>
            {complete.isPending ? 'Saving…' : isLast ? '✓ Complete & finish' : '✓ Complete & next'}
          </button>
        </>
      }
    >
      {/* Cross-run progress: position, live tally, and a clickable case strip. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>
            Case {index + 1} of {executions.length}
          </strong>
          <span className="esp-muted" style={{ fontSize: 12 }}>
            {counts.PASS} passed · {counts.FAIL} failed · {counts.BLOCKED} blocked · {counts.remaining} remaining
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {executions.map((e, i) => (
            <button
              key={e.id}
              className={`esp-exec esp-exec-${e.status}`}
              title={`${tcId(e.displayId)} — ${EXEC_STATUS_LABEL[e.status]}`}
              onClick={() => setIndex(i)}
              style={{
                cursor: 'pointer',
                border: i === index ? '2px solid var(--esp-ink)' : '2px solid transparent',
                minWidth: 26,
                padding: '2px 6px',
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {exec.isLoading || !exec.data ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (
        <ExecutionBody data={exec.data} runId={runId} onCompleteNext={completeAndAdvance} />
      )}
    </Modal>
  );
}

/** End-of-run review: rollup, results table (needs-attention first), and an
 *  understated hand-off to QC. Manager QC/approval lives in RunsView, role-gated. */
function RunSummary({
  detail,
  onReopen,
  onExit,
}: {
  detail: NonNullable<ReturnType<typeof useRun>['data']>;
  onReopen: (index: number) => void;
  onExit: () => void;
}) {
  const auth = useAuth();
  const setStage = useSetRunStage();
  const counts = useMemo(() => tally(detail.executions), [detail.executions]);
  // Pair each execution with its original index so re-open lands on the right case.
  const ordered = useMemo(
    () =>
      detail.executions
        .map((e, index) => ({ e, index }))
        .sort((a, b) => STATUS_RANK[a.e.status] - STATUS_RANK[b.e.status]),
    [detail.executions],
  );
  const canHandOff = auth.can('run.setStage') && detail.stage === 'IN_PROGRESS';

  return (
    <Modal
      title={`Run: ${detail.name}`}
      onClose={onExit}
      footer={
        <>
          {canHandOff ? (
            <button
              className="esp-btn esp-btn-ghost"
              style={{ marginRight: 'auto' }}
              disabled={setStage.isPending}
              onClick={() => setStage.mutate({ id: detail.id, stage: 'COMPLETED_BY_TESTER' }, { onSuccess: onExit })}
            >
              {setStage.isPending ? 'Submitting…' : 'Hand off for QC review'}
            </button>
          ) : null}
          <button className="esp-btn esp-btn-primary" onClick={onExit}>
            Done
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>
          Run finished — {counts.PASS} passed · {counts.FAIL} failed · {counts.BLOCKED} blocked
        </h3>
        <div className="esp-muted" style={{ fontSize: 13 }}>
          Overall <ExecBadge status={detail.status} /> · {detail.environment}
          {counts.remaining > 0 ? ` · ${counts.remaining} not yet run` : ''}
        </div>
      </div>

      <div className="esp-list">
        {ordered.map(({ e, index }) => (
          <div key={e.id} className="esp-case-row" onClick={() => onReopen(index)}>
            <span className="esp-case-id">{tcId(e.displayId)}</span>
            <div className="esp-case-main">
              <div className="esp-case-title">{e.title}</div>
              <div className="esp-case-meta">
                <span>
                  {e.doneSteps}/{e.stepCount} steps
                </span>
              </div>
            </div>
            <ExecBadge status={e.status} />
            <button
              className="esp-btn esp-btn-secondary"
              onClick={(ev) => {
                ev.stopPropagation();
                onReopen(index);
              }}
            >
              Re-open
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Count executions by the statuses the summary surfaces, plus "remaining". */
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
