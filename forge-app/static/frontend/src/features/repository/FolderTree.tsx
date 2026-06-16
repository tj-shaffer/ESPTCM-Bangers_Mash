/** Collapsible folder tree for the repository sidebar. */

import { useState } from 'react';
import type { FolderNode } from '../../domain/types';

interface Props {
  nodes: FolderNode[];
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
  /** Optional name filter; matches folders or their descendants and auto-expands. */
  filter?: string;
}

/** Prune the tree to folders matching `q` (by name) or with a matching descendant. */
function filterTree(nodes: FolderNode[], q: string): FolderNode[] {
  const out: FolderNode[] = [];
  for (const n of nodes) {
    const nameHit = n.name.toLowerCase().includes(q);
    const kids = filterTree(n.children, q);
    if (nameHit || kids.length > 0) {
      // A direct name hit keeps its full subtree so the user can navigate in;
      // an ancestor-only hit keeps just the matching path.
      out.push({ ...n, children: nameHit ? n.children : kids });
    }
  }
  return out;
}

export function FolderTree({ nodes, selectedId, onSelect, filter }: Props) {
  const q = (filter ?? '').trim().toLowerCase();
  const visible = q ? filterTree(nodes, q) : nodes;

  if (nodes.length === 0) {
    return <div className="esp-empty">No folders yet.</div>;
  }
  if (visible.length === 0) {
    return <div className="esp-empty">No folders match “{filter}”.</div>;
  }
  return (
    <div className="esp-tree">
      {visible.map((n) => (
        <FolderRow key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} forceOpen={q.length > 0} />
      ))}
    </div>
  );
}

function FolderRow({
  node,
  depth,
  selectedId,
  onSelect,
  forceOpen,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
  forceOpen: boolean;
}) {
  // Folders start collapsed so the sidebar reads as a short list of applications
  // (PlotBox, Lawson, …); expand one to reveal its test cases. An active filter
  // force-expands so matches are visible.
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const isOpen = forceOpen || open;

  return (
    <>
      <div
        className={`esp-tree-row${selectedId === node.id ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(node)}
      >
        <span
          className={`esp-tree-caret${isOpen ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          ▶
        </span>
        <span aria-hidden>{hasChildren ? (isOpen ? '📂' : '📁') : '📄'}</span>
        <span className="esp-tree-name" title={node.name}>
          {node.name}
        </span>
        {depth === 0 && node.vendorCode ? (
          <span className="esp-badge esp-badge-vendor">{node.vendorCode}</span>
        ) : null}
        {node.testCaseCount > 0 ? <span className="esp-tree-count">{node.testCaseCount}</span> : null}
      </div>
      {isOpen &&
        node.children.map((c) => (
          <FolderRow
            key={c.id}
            node={c}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            forceOpen={forceOpen}
          />
        ))}
    </>
  );
}
