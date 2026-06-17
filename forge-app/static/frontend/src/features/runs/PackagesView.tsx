/** Packages: the third grouping level — several runs bundled for an end-to-end
 *  review. List packages (sidebar) + selected package's member runs, plus a
 *  create flow that labels the package and picks which existing runs to bundle.
 *  See ENHANCEMENTS #3. */

import { useMemo, useState } from 'react';
import Spinner from '@atlaskit/spinner';
import {
  useCreatePackage,
  useDeletePackage,
  usePackage,
  usePackages,
  useRuns,
} from '../../api/runs';
import { TEST_TYPES, TEST_TYPE_LABELS, pkgId } from '../../domain/types';
import type { TestType } from '../../domain/types';
import { Modal, Toast } from '../../components/ui';
import { ExecBadge } from './ExecutionRunner';

export function PackagesView() {
  const packages = usePackages();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const detail = usePackage(selectedId);
  const deletePackage = useDeletePackage();

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };

  if (packages.isLoading) {
    return (
      <div className="esp-spinner-wrap">
        <Spinner size="large" />
      </div>
    );
  }

  const pkg = detail.data;

  return (
    <div className="esp-body">
      <aside className="esp-sidebar">
        <div className="esp-sidebar-head">
          <span className="esp-sidebar-title">Packages</span>
          <button className="esp-btn esp-btn-ghost" onClick={() => setShowNew(true)}>
            + New package
          </button>
        </div>
        <div className="esp-tree">
          {(packages.data ?? []).length === 0 ? (
            <div className="esp-empty">No packages yet. Bundle runs into one for an end-to-end review.</div>
          ) : (
            (packages.data ?? []).map((p) => (
              <div
                key={p.id}
                className={`esp-tree-row${selectedId === p.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="esp-tree-name" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="esp-muted" style={{ fontSize: 11 }}>
                    {pkgId(p.displayId)} · {TEST_TYPE_LABELS[p.packageType]} · {p.runCount} run{p.runCount === 1 ? '' : 's'}
                  </span>
                </div>
                <ExecBadge status={p.status} />
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="esp-main">
        <div className="esp-list-pane" style={{ borderRight: 'none' }}>
          {!pkg ? (
            <div className="esp-empty">Select a package, or create one.</div>
          ) : (
            <>
              <div className="esp-toolbar">
                <h2>{pkg.name}</h2>
                <span className="esp-badge esp-badge-soft">{TEST_TYPE_LABELS[pkg.packageType]}</span>
                <ExecBadge status={pkg.status} />
                <div className="esp-header-spacer" />
                <button
                  className="esp-btn esp-btn-danger"
                  onClick={() => {
                    if (window.confirm(`Delete package "${pkg.name}"? Its runs are kept, just un-bundled.`)) {
                      deletePackage.mutate(pkg.id, {
                        onSuccess: () => {
                          setSelectedId(null);
                          flash('Package deleted');
                        },
                      });
                    }
                  }}
                >
                  Delete package
                </button>
              </div>

              <div className="esp-list">
                {pkg.runs.length === 0 ? (
                  <div className="esp-empty">No runs in this package yet.</div>
                ) : (
                  pkg.runs.map((r) => (
                    <div key={r.id} className="esp-case-row">
                      <div className="esp-case-main">
                        <div className="esp-case-title">{r.name}</div>
                        <div className="esp-case-meta">
                          <span>
                            {r.environment} · {r.passed}/{r.total} passed
                          </span>
                          {r.assigneeName ? <span>· 👤 {r.assigneeName}</span> : null}
                        </div>
                      </div>
                      <ExecBadge status={r.status} />
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showNew ? (
        <NewPackageModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            setSelectedId(id);
            flash('Package created');
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

function NewPackageModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const runs = useRuns();
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

  const allIds = useMemo(() => (runs.data ?? []).map((r) => r.id), [runs.data]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const canCreate = name.trim().length > 0 && !createPackage.isPending;

  return (
    <Modal
      title="New package"
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
                { name, packageType, runIds: [...selected] },
                { onSuccess: (p) => onCreated(p.id) },
              )
            }
          >
            {createPackage.isPending ? 'Creating…' : `Create package${selected.size ? ` (${selected.size} runs)` : ''}`}
          </button>
        </>
      }
    >
      <div className="esp-grid-2" style={{ marginBottom: 14 }}>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Package name</label>
          <input
            className="esp-input"
            autoFocus
            placeholder="e.g. Discount Management — end-to-end"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="esp-field" style={{ marginBottom: 0 }}>
          <label className="esp-label">Type / label</label>
          <select className="esp-select" value={packageType} onChange={(e) => setPackageType(e.target.value as TestType)}>
            {TEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEST_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label className="esp-label" style={{ marginBottom: 0 }}>
          Runs to include ({selected.size} selected)
        </label>
        {allIds.length > 0 ? (
          <button className="esp-btn esp-btn-ghost" onClick={() => setSelected(allSelected ? new Set() : new Set(allIds))}>
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
        ) : null}
      </div>

      {runs.isLoading ? (
        <div className="esp-spinner-wrap">
          <Spinner size="medium" />
        </div>
      ) : (runs.data ?? []).length === 0 ? (
        <p className="esp-muted" style={{ fontSize: 13 }}>
          No runs yet — you can create the package now and add runs to it from the New run dialog.
        </p>
      ) : (
        <div
          style={{
            maxHeight: '38vh',
            overflowY: 'auto',
            border: '1px solid var(--esp-border)',
            borderRadius: 'var(--esp-radius-sm)',
            padding: 6,
          }}
        >
          {(runs.data ?? []).map((r) => (
            <label key={r.id} className="esp-pick-row">
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
              <span className="esp-muted" style={{ fontSize: 12 }}>
                {r.environment}
                {r.packageName ? ` · in ${r.packageName}` : ''}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
