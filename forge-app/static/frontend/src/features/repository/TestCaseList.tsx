/** Middle pane: list of test cases in the selected folder, with quick search. */

import { useMemo, useState } from 'react';
import type { TestCaseSummary } from '../../domain/types';
import { tcId } from '../../domain/types';
import { PriorityBadge, StatusBadge } from '../../components/ui';

interface Props {
  cases: TestCaseSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TestCaseList({ cases, selectedId, onSelect }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cases;
    return cases.filter(
      (c) => c.title.toLowerCase().includes(needle) || tcId(c.displayId).toLowerCase().includes(needle),
    );
  }, [cases, q]);

  return (
    <>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--esp-border)' }}>
        <input
          className="esp-input"
          placeholder="Search this folder…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
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
