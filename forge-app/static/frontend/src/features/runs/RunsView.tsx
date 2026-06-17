/** Test Runs: list of runs (sidebar) + run detail with its executions, plus
 *  the new-run flow and the execution runner modal. */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Spinner from '@atlaskit/spinner';
import { invokeResolver } from '../../api/client';
import { useCreateRun, useDeleteRun, usePackages, useRun, useRuns } from '../../api/runs';
import { ENVIRONMENTS, TEAM_MEMBERS, tcId } from '../../domain/types';
import type { Environment, TestCaseSummary } from '../../domain/types';
import { Modal, Toast } from '../../components/ui';
import { ExecBadge, ExecutionRunner } from './ExecutionRunner';
import { useAuth } from '../../context/AuthContext';

export function RunsView() {
  const auth = useAuth();
  const canManageRuns = auth.can('run.create');
  const runs = useRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runnerExecId, setRunnerExecId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const run = useRun(selectedRunId);
  const deleteRun = useDeleteRun();

  // Distinct assignees present across runs, for the filter dropdown.
  const assignees = useMemo(
    () => [...new Set((runs.data ?? []).map((r) => r.assigneeName).filter((a): a is string => !!a))].sort(),
    [runs.data],
  );
  const visibleRuns = useMemo(
    () => (runs.data ?? []).filter((r) => !assigneeFilter || r.assigneeName === assigneeFilter),
    [runs.data, assigneeFilter],
  );

  useEffect(() => {
    if (!selectedRunId && runs.data && runs.data.length > 0) {
      setSelectedRunId(runs.data[0]!.id);
    }
  }, [runs.data, selectedRunId]);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  if (runs.isLoading) {
    return (
      <div className="esp-spinner-wrap">
        <Spinner size="large" />
      </div>
    );
  }

  const detail = run.data;

  return (
    <div className="esp-body">
      <aside className="esp-sidebar">
        <div className="esp-sidebar-head">
          <span className="esp-sidebar-title">Test Runs</span>
          {canManageRuns ? (
            <button className="esp-btn esp-btn-ghost" onClick={() => setShowNew(true)}>
              + New run
            </button>
          ) : null}
        </div>
        {assignees.length > 0 ? (
          <select
            className="esp-select"
            style={{ margin: '8px 10px', width: 'calc(100% - 20px)' }}
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">All assignees</option>
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : null}
        <div className="esp-tree">
          {(runs.data ?? []).length === 0 ? (
            <div className="esp-empty">No runs yet. Create one to start executing.</div>
          ) : visibleRuns.length === 0 ? (
            <div className="esp-empty">No runs assigned to {assigneeFilter}.</div>
          ) : (
            visibleRuns.map((r) => (
              <div
                key={r.id}
                className={`esp-tree-row${selectedRunId === r.id ? ' selected' : ''}`}
                onClick={() => setSelectedRunId(r.id)}
              >
                <div className="esp-tree-name" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  <span className="esp-muted" style={{ fontSize: 11 }}>
                    {r.environment} · {r.passed}/{r.total} passed
                    {r.assigneeName ? ` · 👤 ${r.assigneeName}` : ''}
                    {r.packageName ? ` · 📦 ${r.packageName}` : ''}
                  </span>
                </div>
                <ExecBadge status={r.status} />
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="esp-main">
        <div className="esp-list-pane" style={{ borderRight: 'none' }}>
          {!detail ? (
            <div className="esp-empty">Select a run, or create one.</div>
          ) : (
            <>
              <div className="esp-toolbar">
                <h2>{detail.name}</h2>
                <span className="esp-badge esp-badge-soft">{detail.environment}</span>
                <ExecBadge status={detail.status} />
                <div className="esp-header-spacer" />
                {canManageRuns ? (
                  <button
                    className="esp-btn esp-btn-danger"
                    onClick={() => {
                      if (window.confirm(`Delete run "${detail.name}"? This removes its execution results.`)) {
                        deleteRun.mutate(detail.id, {
                          onSuccess: () => {
                            setSelectedRunId(null);
                            flash('Run deleted');
                          },
                        });
                      }
                    }}
                  >
                    Delete run
                  </button>
                ) : null}
              </div>

              <div className="esp-list">
                {detail.executions.map((e) => (
                  <div key={e.id} className="esp-case-row" onClick={() => setRunnerExecId(e.id)}>
                    <span className="esp-case-id">{tcId(e.displayId)}</span>
                    <div className="esp-case-main">
                      <div className="esp-case-title">{e.title}</div>
                      <div className="esp-case-meta">
                        <div className="esp-progress" style={{ width: 90 }}>
                          <span style={{ width: `${e.stepCount ? (e.doneSteps / e.stepCount) * 100 : 0}%` }} />
                        </div>
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
                        setRunnerExecId(e.id);
                      }}
                    >
                      ▶ Run
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {runnerExecId && detail ? (
        <ExecutionRunner executionId={runnerExecId} runId={detail.id} onClose={() => setRunnerExecId(null)} />
      ) : null}

      {showNew ? (
        <NewRunModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            setSelectedRunId(id);
            flash('Run created');
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (runId: string) => void }) {
  const cases = useQuery({
    queryKey: ['allCases'],
    queryFn: () => invokeResolver<TestCaseSummary[]>('repo.listCases', {}),
  });
  const packages = usePackages();
  const createRun = useCreateRun();

  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState<Environment>('TEST');
  const [assignee, setAssignee] = useState('');
  const [packageId, setPackageId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allIds = useMemo(() => (cases.data ?? []).map((c) => c.id), [cases.data]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const canCreate = name.trim().length > 0 && selected.size > 0 && !createRun.isPending;

  return (
    <Modal
      title="New test run"
      onClose={onClose}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={createRun.isPending}>
            Cancel
          </button>
          <button
            className="esp-btn esp-btn-primary"
            disabled={!canCreate}
            onClick={() =>
              createRun.mutate(
                {
                  name,
                  environment,
                  testCaseIds: [...selected],
                  assigneeName: assignee.trim() || undefined,
                  packageId: packageId || null,
                },
                { onSuccess: (r) => onCreated(r.id) },
              )
            }
          >
            {createRun.isPending ? 'Creating…' : `Create run (${selected.size})`}
          </button>
        </>
      }
    >
      <div className="esp-grid-2" style={{ marginBottom: 14 }}>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Run name</label>
          <input
            className="esp-input"
            autoFocus
            placeholder="e.g. Regression — June release"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Environment</label>
          <select className="esp-select" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="esp-grid-2" style={{ marginBottom: 14 }}>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Assign to</label>
          <input
            className="esp-input"
            list="esp-team-members"
            placeholder="e.g. Dave Brodecki"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <datalist id="esp-team-members">
            {TEAM_MEMBERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Package (optional)</label>
          <select className="esp-select" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">— none —</option>
            {(packages.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="esp-label" style={{ marginBottom: 0 }}>
          Test cases ({selected.size} selected)
        </label>
        <button
          className="esp-btn esp-btn-ghost"
          onClick={() => setSelected(allSelected ? new Set() : new Set(allIds))}
        >
          {allSelected ? 'Clear all' : 'Select all'}
        </button>
      </div>

      {cases.isLoading ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (
        <div style={{ maxHeight: '38vh', overflowY: 'auto', border: '1px solid var(--esp-border)', borderRadius: 'var(--esp-radius-sm)', padding: 6 }}>
          {(cases.data ?? []).map((c) => (
            <label key={c.id} className="esp-pick-row">
              <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="esp-case-id" style={{ width: 60 }}>{tcId(c.displayId)}</span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
              <span className="esp-muted" style={{ fontSize: 12 }}>{c.stepCount} steps</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
