/** Collapsible folder tree for the repository sidebar. */

import { useState } from 'react';
import type { FolderNode } from '../../domain/types';

interface Props {
  nodes: FolderNode[];
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
}

export function FolderTree({ nodes, selectedId, onSelect }: Props) {
  if (nodes.length === 0) {
    return <div className="esp-empty">No folders yet.</div>;
  }
  return (
    <div className="esp-tree">
      {nodes.map((n) => (
        <FolderRow key={n.id} node={n} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

function FolderRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={`esp-tree-row${selectedId === node.id ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(node)}
      >
        <span
          className={`esp-tree-caret${open ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          ▶
        </span>
        <span aria-hidden>{hasChildren ? (open ? '📂' : '📁') : '📄'}</span>
        <span className="esp-tree-name" title={node.name}>
          {node.name}
        </span>
        {node.vendorCode ? <span className="esp-badge esp-badge-vendor">{node.vendorCode}</span> : null}
        {node.testCaseCount > 0 ? <span className="esp-tree-count">{node.testCaseCount}</span> : null}
      </div>
      {open &&
        node.children.map((c) => (
          <FolderRow key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
        ))}
    </>
  );
}
