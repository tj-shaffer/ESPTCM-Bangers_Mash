/** Middle pane: list of test cases in the selected folder, with quick search
 *  and (for authors) multi-select bulk actions. */

import { useMemo, useState } from 'react';
import type { TestCaseStatus, TestCaseSummary } from '../../domain/types';
import { STATUSES, tcId } from '../../domain/types';
import { PriorityBadge, StatusBadge } from '../../components/ui';
import { Icon } from '../../components/Icon';

interface BulkActions {
  onDelete: (ids: string[]) => Promise<void>;
  onSetStatus: (ids: string[], status: TestCaseStatus) => Promise<void>;
  /** Start a run from the selected cases (handoff into execution). */
  onRun?: (ids: string[]) => void;
  /** Save the selected cases as a reusable suite. */
  onSaveSuite?: (ids: string[]) => void;
  busy?: boolean;
}

interface Props {
  cases: TestCaseSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** When provided (authors), rows get checkboxes and a bulk action bar. */
  bulk?: BulkActions;
}

export function TestCaseList({ cases, selectedId, onSelect, bulk }: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter(
      (c) => c.title.toLowerCase().includes(needle) || tcId(c.displayId).toLowerCase().includes(needle),
    );
  }, [cases, q]);

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => sel.has(c.id));
  const toggleAll = () =>
    setSel(allFilteredSelected ? new Set() : new Set(filtered.map((c) => c.id)));
  const clear = () => setSel(new Set());
  const ids = () => [...sel];

  return (
    <>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--esp-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {bulk && filtered.length > 0 ? (
          <input
            type="checkbox"
            title="Select all in this folder"
            checked={allFilteredSelected}
            onChange={toggleAll}
          />
        ) : null}
        <input
          className="esp-input"
          style={{ flex: 1 }}
          placeholder="Search this folder…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {bulk && sel.size > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--esp-border)',
            background: 'var(--esp-powder-soft)',
          }}
        >
          <span className="esp-muted" style={{ fontSize: 12 }}>
            {sel.size} selected
          </span>
          <div className="esp-header-spacer" />
          {bulk.onRun ? (
            <button
              className="esp-btn esp-btn-primary"
              disabled={bulk.busy}
              onClick={() => bulk.onRun!(ids())}
              title="Start a test run from the selected cases"
            >
              <Icon name="play" /> Run selected
            </button>
          ) : null}
          {bulk.onSaveSuite ? (
            <button
              className="esp-btn esp-btn-secondary"
              disabled={bulk.busy}
              onClick={() => bulk.onSaveSuite!(ids())}
              title="Save the selected cases as a reusable suite you can run later"
            >
              <Icon name="copy" /> Save as suite
            </button>
          ) : null}
          <select
            className="esp-select"
            style={{ width: 'auto' }}
            value=""
            disabled={bulk.busy}
            onChange={(e) => {
              const s = e.target.value as TestCaseStatus;
              if (s) void bulk.onSetStatus(ids(), s).then(clear);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Set status…
            </option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="esp-btn esp-btn-danger" disabled={bulk.busy} onClick={() => void bulk.onDelete(ids()).then(clear)}>
            Delete
          </button>
          <button className="esp-btn esp-btn-ghost" disabled={bulk.busy} onClick={clear}>
            Clear
          </button>
        </div>
      ) : null}

      <div className="esp-list">
        {filtered.length === 0 ? (
          <div className="esp-empty">{cases.length === 0 ? 'No test cases in this folder yet.' : 'No matches.'}</div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className={`esp-case-row${selectedId === c.id ? ' selected' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              {bulk ? (
                <input
                  type="checkbox"
                  checked={sel.has(c.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(c.id)}
                  style={{ marginRight: 2 }}
                />
              ) : null}
              <span className="esp-case-id">{tcId(c.displayId)}</span>
              <div className="esp-case-main">
                <div className="esp-case-title">{c.title}</div>
                <div className="esp-case-meta">
                  <span>{c.stepCount} steps</span>
                  {c.vendors.map((v) => (
                    <span key={v} className="esp-badge esp-badge-vendor">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <PriorityBadge priority={c.priority} />
              <StatusBadge status={c.status} />
            </div>
          ))
        )}
      </div>
    </>
  );
}
