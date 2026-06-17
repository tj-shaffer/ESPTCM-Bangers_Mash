/** PipelineView — the "manufacturing line." Runs are cards flowing left→right
 *  through stage columns (stations): In progress → Submitted for QC → In QC
 *  review → Ready for approval → Approved. Replaces the old Test Runs + Review
 *  Queue tabs: one board, role-gated card actions, no duplicate surfaces. */

import { useEffect, useMemo, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { useDeleteRun, useRuns } from '../../api/runs';
import { RUN_STAGES, RUN_STAGE_LABEL } from '../../domain/types';
import type { RunStage, TestRunSummary } from '../../domain/types';
import { Toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { ExecBadge } from './ExecutionRunner';
import { RunPlayer } from './RunPlayer';
import { ExecutiveApproval } from './ExecutiveApproval';
import { StageControls } from './runStageControls';

// Approved runs accumulate forever; show only the most recent and point the rest
// at the dashboard rather than growing the column unbounded.
const APPROVED_CAP = 25;

export function PipelineView({ deepRunId = null }: { deepRunId?: string | null } = {}) {
  const auth = useAuth();
  const canManageRuns = auth.can('run.create');
  const isManager = auth.hasRole('SUPER_ADMIN', 'TEST_MANAGER');
  const canSubmitStage = auth.can('run.setStage');

  const runs = useRuns();
  const deleteRun = useDeleteRun();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerInitialExecId, setPlayerInitialExecId] = useState<string | null>(null);
  const [approvalRunId, setApprovalRunId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  // Group runs into their stage columns, newest-first within each.
  const byStage = useMemo(() => {
    const map = Object.fromEntries(RUN_STAGES.map((s) => [s, [] as TestRunSummary[]])) as Record<
      RunStage,
      TestRunSummary[]
    >;
    for (const r of runs.data ?? []) map[r.stage]?.push(r);
    for (const s of RUN_STAGES) map[s].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return map;
  }, [runs.data]);

  // Arriving via #runs/<id> (e.g. a fresh run from the Repository): drop into the player.
  useEffect(() => {
    if (deepRunId) {
      setSelectedRunId(deepRunId);
      setPlayerInitialExecId(null);
      setPlayerOpen(true);
    }
  }, [deepRunId]);

  const openCard = (r: TestRunSummary) => {
    if (r.stage === 'READY_FOR_APPROVAL' || r.stage === 'APPROVED') {
      setApprovalRunId(r.id);
    } else {
      setSelectedRunId(r.id);
      setPlayerInitialExecId(null);
      setPlayerOpen(true);
    }
  };

  const removeRun = (r: TestRunSummary) => {
    if (!window.confirm(`Delete run "${r.name}"? This removes its execution results.`)) return;
    deleteRun.mutate(r.id, { onSuccess: () => flash('Run deleted') });
  };

  if (runs.isLoading) {
    return (
      <div className="esp-spinner-wrap">
        <Spinner size="large" />
      </div>
    );
  }

  return (
    <>
      <div className="esp-toolbar">
        <h2 style={{ margin: 0 }}>Pipeline</h2>
        <span className="esp-muted" style={{ fontSize: 12 }}>Runs flow left → right, station by station.</span>
        <div className="esp-header-spacer" />
        {canManageRuns ? (
          <button
            className="esp-btn esp-btn-primary"
            title="Runs start in the Repository — pick a folder or cases to run"
            onClick={() => {
              window.location.hash = 'repository';
            }}
          >
            + New run
          </button>
        ) : null}
      </div>
      <div className="esp-board">
        {RUN_STAGES.map((stage) => {
          const all = byStage[stage];
          const capped = stage === 'APPROVED' ? all.slice(0, APPROVED_CAP) : all;
          const hidden = all.length - capped.length;
          return (
            <div className="esp-board-col" key={stage}>
              <div className="esp-board-col-head">
                <span className={`esp-stage esp-stage-${stage}`}>{RUN_STAGE_LABEL[stage]}</span>
                <span className="esp-board-col-count">{all.length}</span>
              </div>
              <div className="esp-board-col-body">
                {capped.length === 0 ? (
                  <div className="esp-empty" style={{ padding: 20, fontSize: 12 }}>
                    {stage === 'IN_PROGRESS'
                      ? 'No active runs. Start one from the Repository.'
                      : stage === 'APPROVED'
                        ? 'Nothing approved yet.'
                        : 'Nothing here.'}
                  </div>
                ) : (
                  capped.map((r) => (
                    <RunCard
                      key={r.id}
                      run={r}
                      isManager={isManager}
                      canSubmitStage={canSubmitStage}
                      canManageRuns={canManageRuns}
                      onOpen={() => openCard(r)}
                      onAdvance={flash}
                      onDelete={() => removeRun(r)}
                    />
                  ))
                )}
                {hidden > 0 ? (
                  <a className="esp-muted" href="#dashboard" style={{ fontSize: 12, padding: '4px 2px', textDecoration: 'none' }}>
                    +{hidden} older — view in dashboard →
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {playerOpen && selectedRunId ? (
        <RunPlayer
          runId={selectedRunId}
          initialExecutionId={playerInitialExecId}
          onExit={() => {
            setPlayerOpen(false);
            setPlayerInitialExecId(null);
          }}
        />
      ) : null}

      {approvalRunId ? (
        <ExecutiveApproval runId={approvalRunId} onExit={() => setApprovalRunId(null)} onResult={flash} />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </>
  );
}

function RunCard({
  run,
  isManager,
  canSubmitStage,
  canManageRuns,
  onOpen,
  onAdvance,
  onDelete,
}: {
  run: TestRunSummary;
  isManager: boolean;
  canSubmitStage: boolean;
  canManageRuns: boolean;
  onOpen: () => void;
  onAdvance: (msg: string) => void;
  onDelete: () => void;
}) {
  const done = run.total - run.notStarted;
  const pct = run.total > 0 ? Math.round((done / run.total) * 100) : 0;
  return (
    <div className="esp-run-card" onClick={onOpen}>
      <div className="esp-run-card-title">{run.name}</div>
      <div className="esp-run-card-meta">
        <span className="esp-badge esp-badge-soft">{run.environment}</span>
        <ExecBadge status={run.status} />
        {run.assigneeName ? <span>👤 {run.assigneeName}</span> : null}
      </div>
      {run.stage === 'IN_PROGRESS' ? (
        <div className="esp-run-card-meta">
          <div className="esp-progress" style={{ flex: 1 }}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span>{done}/{run.total} run</span>
        </div>
      ) : (
        <div className="esp-run-card-meta">
          <span style={{ color: 'var(--esp-active)' }}>✓ {run.passed}</span>
          <span style={{ color: 'var(--esp-critical)' }}>✗ {run.failed}</span>
          <span style={{ color: 'var(--esp-draft)' }}>⚠ {run.blocked}</span>
          <span>· {run.total} cases</span>
        </div>
      )}
      {/* Actions: stage advance + delete. Stop propagation so they don't open the card. */}
      <div className="esp-run-card-actions" onClick={(e) => e.stopPropagation()}>
        <StageControls run={run} isManager={isManager} canSubmit={canSubmitStage} onDone={onAdvance} />
        {canManageRuns ? (
          <button
            className="esp-btn esp-btn-ghost"
            style={{ marginLeft: 'auto' }}
            title="Delete run"
            onClick={onDelete}
          >
            🗑
          </button>
        ) : null}
      </div>
    </div>
  );
}
