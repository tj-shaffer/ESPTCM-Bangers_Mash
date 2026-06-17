/** PipelineView — the "manufacturing line." Runs are cards flowing left→right
 *  through stage columns (stations): In progress → Submitted for QC → In QC
 *  review → Ready for approval → Approved. Replaces the old Test Runs + Review
 *  Queue tabs: one board, role-gated card actions, package + assignee filters,
 *  and an end-to-end package sign-off — no duplicate surfaces, no separate tab. */

import { useEffect, useMemo, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import { useCreatePackage, useDeleteRun, usePackages, useRuns } from '../../api/runs';
import {
  RUN_STAGES,
  RUN_STAGE_LABEL,
  TEST_TYPES,
  TEST_TYPE_LABELS,
  pkgId,
} from '../../domain/types';
import type { PackageSummary, RunStage, TestRunSummary, TestType } from '../../domain/types';
import { Modal, Toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { ExecBadge } from './ExecutionRunner';
import { RunPlayer } from './RunPlayer';
import { ExecutiveApproval } from './ExecutiveApproval';
import { PackageApproval } from './PackageApproval';
import { StageControls } from './runStageControls';

// Approved runs accumulate forever; show only the most recent and point the rest
// at the dashboard rather than growing the column unbounded.
const APPROVED_CAP = 25;

export function PipelineView({ deepRunId = null }: { deepRunId?: string | null } = {}) {
  const auth = useAuth();
  const canManageRuns = auth.can('run.create');
  const canCreatePackage = auth.can('package.create');
  const canSignOffPackage = auth.can('package.signOff');
  const isManager = auth.hasRole('SUPER_ADMIN', 'TEST_MANAGER');
  const canSubmitStage = auth.can('run.setStage');

  const runs = useRuns();
  const packages = usePackages();
  const deleteRun = useDeleteRun();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerInitialExecId, setPlayerInitialExecId] = useState<string | null>(null);
  const [approvalRunId, setApprovalRunId] = useState<string | null>(null);
  const [packageFilter, setPackageFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [pkgApprovalOpen, setPkgApprovalOpen] = useState(false);
  const [showNewPackage, setShowNewPackage] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  // Distinct assignees across all runs (not just the filtered set), for the filter.
  const assignees = useMemo(
    () => [...new Set((runs.data ?? []).map((r) => r.assigneeName).filter((a): a is string => !!a))].sort(),
    [runs.data],
  );

  // Apply the package + assignee filters, then group into stage columns (newest-first).
  const byStage = useMemo(() => {
    let rs = runs.data ?? [];
    if (packageFilter) rs = rs.filter((r) => r.packageId === packageFilter);
    if (assigneeFilter) rs = rs.filter((r) => (r.assigneeName ?? '') === assigneeFilter);
    const map = Object.fromEntries(RUN_STAGES.map((s) => [s, [] as TestRunSummary[]])) as Record<
      RunStage,
      TestRunSummary[]
    >;
    for (const r of rs) map[r.stage]?.push(r);
    for (const s of RUN_STAGES) map[s].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return map;
  }, [runs.data, packageFilter, assigneeFilter]);

  const selectedPackage = (packages.data ?? []).find((p) => p.id === packageFilter) ?? null;

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

  // Drill into a specific run from the package approval view.
  const openRunById = (id: string) => {
    const r = (runs.data ?? []).find((x) => x.id === id);
    if (r) {
      setPkgApprovalOpen(false);
      openCard(r);
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
        <select
          className="esp-select"
          style={{ width: 'auto' }}
          title="Filter by package"
          value={packageFilter}
          onChange={(e) => setPackageFilter(e.target.value)}
        >
          <option value="">All packages</option>
          {(packages.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              📦 {pkgId(p.displayId)} · {p.name}
            </option>
          ))}
        </select>
        {assignees.length > 0 ? (
          <select
            className="esp-select"
            style={{ width: 'auto' }}
            title="Filter by assignee"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">All assignees</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                👤 {a}
              </option>
            ))}
          </select>
        ) : null}
        <div className="esp-header-spacer" />
        {canCreatePackage ? (
          <button className="esp-btn esp-btn-secondary" onClick={() => setShowNewPackage(true)}>
            + New package
          </button>
        ) : null}
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

      {selectedPackage ? (
        <PackageHeader pkg={selectedPackage} canApprove={canSignOffPackage} onApprove={() => setPkgApprovalOpen(true)} />
      ) : null}

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

      {pkgApprovalOpen && packageFilter ? (
        <PackageApproval
          packageId={packageFilter}
          onExit={() => setPkgApprovalOpen(false)}
          onResult={flash}
          onOpenRun={openRunById}
        />
      ) : null}

      {showNewPackage ? (
        <NewPackageModal
          runs={runs.data ?? []}
          onClose={() => setShowNewPackage(false)}
          onCreated={(id) => {
            setShowNewPackage(false);
            setPackageFilter(id);
            flash('Package created');
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </>
  );
}

/** Package rollup band shown above the board when a package is selected in the filter. */
function PackageHeader({
  pkg,
  canApprove,
  onApprove,
}: {
  pkg: PackageSummary;
  canApprove: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="esp-toolbar" style={{ background: 'var(--esp-powder-soft)' }}>
      <strong style={{ fontSize: 13 }}>
        📦 {pkgId(pkg.displayId)} · {pkg.name}
      </strong>
      <span className="esp-badge esp-badge-soft">{TEST_TYPE_LABELS[pkg.packageType]}</span>
      <ExecBadge status={pkg.status} />
      <span className="esp-muted" style={{ fontSize: 12 }}>
        {pkg.runCount} runs · <span style={{ color: 'var(--esp-active)' }}>✓ {pkg.passed}</span>{' '}
        <span style={{ color: 'var(--esp-critical)' }}>✗ {pkg.failed}</span>{' '}
        <span style={{ color: 'var(--esp-draft)' }}>⚠ {pkg.blocked}</span>
        {pkg.approvedAt ? ` · ✅ approved by ${pkg.approverName ?? ''}` : ''}
      </span>
      <div className="esp-header-spacer" />
      {canApprove ? (
        <button className="esp-btn esp-btn-primary" onClick={onApprove}>
          Review &amp; approve package
        </button>
      ) : null}
    </div>
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
        {run.packageName ? <span title={run.packageName}>📦 {run.packageName}</span> : null}
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

/** Bundle existing runs into a new package for end-to-end review. */
function NewPackageModal({
  runs,
  onClose,
  onCreated,
}: {
  runs: TestRunSummary[];
  onClose: () => void;
  onCreated: (packageId: string) => void;
}) {
  const createPackage = useCreatePackage();
  const [name, setName] = useState('');
  const [packageType, setPackageType] = useState<TestType>('REGRESSION');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canCreate = name.trim().length > 0 && !createPackage.isPending;

  return (
    <Modal
      title="New package"
      maxWidth={460}
      onClose={onClose}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={createPackage.isPending}>
            Cancel
          </button>
          <button
            className="esp-btn esp-btn-primary"
            disabled={!canCreate}
            onClick={() =>
              createPackage.mutate(
                { name: name.trim(), packageType, runIds: [...selected] },
                { onSuccess: (p) => onCreated(p.id) },
              )
            }
          >
            {createPackage.isPending ? 'Creating…' : `Create package (${selected.size})`}
          </button>
        </>
      }
    >
      <div className="esp-field">
        <label className="esp-label">Package name</label>
        <input
          className="esp-input"
          autoFocus
          placeholder="e.g. June Release — End-to-end"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="esp-field">
        <label className="esp-label">Type</label>
        <select className="esp-select" value={packageType} onChange={(e) => setPackageType(e.target.value as TestType)}>
          {TEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {TEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="esp-field" style={{ marginBottom: 0 }}>
        <label className="esp-label">Runs to include ({selected.size})</label>
        {runs.length === 0 ? (
          <p className="esp-muted" style={{ fontSize: 13 }}>No runs yet — create runs from the Repository first.</p>
        ) : (
          <div style={{ maxHeight: '34vh', overflowY: 'auto', border: '1px solid var(--esp-border)', borderRadius: 'var(--esp-radius-sm)', padding: 6 }}>
            {runs.map((r) => (
              <label key={r.id} className="esp-pick-row">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                <span className="esp-muted" style={{ fontSize: 12 }}>{r.environment} · {RUN_STAGE_LABEL[r.stage]}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
