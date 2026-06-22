/** Collapsible folder tree for the repository sidebar, with a right-click /
 *  kebab context menu for managing folders (rename, add subfolder, delete). */

import { useEffect, useState } from 'react';
import type { FolderNode } from '../../domain/types';
import { Icon } from '../../components/Icon';

/** Folder-management actions; passed only to users who can author. */
export interface FolderActions {
  onRename: (folder: FolderNode) => void;
  onNewSubfolder: (folder: FolderNode) => void;
  onDelete: (folder: FolderNode) => void;
}

interface Props {
  nodes: FolderNode[];
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
  /** Optional name filter; matches folders or their descendants and auto-expands. */
  filter?: string;
  /** When provided (authors), rows get a right-click / kebab management menu. */
  actions?: FolderActions;
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

interface MenuState {
  node: FolderNode;
  x: number;
  y: number;
}

export function FolderTree({ nodes, selectedId, onSelect, filter, actions }: Props) {
  const q = (filter ?? '').trim().toLowerCase();
  const visible = q ? filterTree(nodes, q) : nodes;
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Dismiss the menu on Escape; click-away is handled by a full-screen backdrop.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const openMenu = (node: FolderNode, x: number, y: number) => {
    // Keep the menu on-screen near the right/bottom edges.
    const clampedX = Math.min(x, window.innerWidth - 184);
    const clampedY = Math.min(y, window.innerHeight - 150);
    setMenu({ node, x: clampedX, y: clampedY });
  };

  if (nodes.length === 0) {
    return <div className="esp-empty">No folders yet.</div>;
  }
  if (visible.length === 0) {
    return <div className="esp-empty">No folders match “{filter}”.</div>;
  }
  return (
    <div className="esp-tree">
      {visible.map((n) => (
        <FolderRow
          key={n.id}
          node={n}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          forceOpen={q.length > 0}
          menuOpenId={menu?.node.id ?? null}
          onOpenMenu={actions ? openMenu : undefined}
        />
      ))}
      {menu && actions ? (
        <FolderMenu menu={menu} actions={actions} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}

function FolderRow({
  node,
  depth,
  selectedId,
  onSelect,
  forceOpen,
  menuOpenId,
  onOpenMenu,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (folder: FolderNode) => void;
  forceOpen: boolean;
  menuOpenId: string | null;
  onOpenMenu?: (folder: FolderNode, x: number, y: number) => void;
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
        onContextMenu={
          onOpenMenu
            ? (e) => {
                e.preventDefault();
                onOpenMenu(node, e.clientX, e.clientY);
              }
            : undefined
        }
      >
        <span
          className={`esp-tree-caret${isOpen ? ' open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          <Icon name="chevronDown" size={12} />
        </span>
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--esp-faint)' }}>
          <Icon name={hasChildren ? 'folder' : 'file'} size={15} />
        </span>
        <span className="esp-tree-name" title={node.name}>
          {node.name}
        </span>
        {depth === 0 && node.vendorCode ? (
          <span className="esp-badge esp-badge-vendor">{node.vendorCode}</span>
        ) : null}
        {node.testCaseCount > 0 ? <span className="esp-tree-count">{node.testCaseCount}</span> : null}
        {onOpenMenu ? (
          <button
            type="button"
            className={`esp-tree-kebab${menuOpenId === node.id ? ' open' : ''}`}
            title="Manage folder"
            aria-label={`Manage folder ${node.name}`}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onOpenMenu(node, r.right, r.bottom + 2);
            }}
          >
            ⋯
          </button>
        ) : null}
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
            menuOpenId={menuOpenId}
            onOpenMenu={onOpenMenu}
          />
        ))}
    </>
  );
}

function FolderMenu({
  menu,
  actions,
  onClose,
}: {
  menu: MenuState;
  actions: FolderActions;
  onClose: () => void;
}) {
  const run = (fn: (f: FolderNode) => void) => {
    fn(menu.node);
    onClose();
  };
  return (
    <>
      {/* Full-screen backdrop: a click anywhere outside the menu dismisses it. */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 299 }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="esp-context-menu" style={{ left: menu.x, top: menu.y }} role="menu">
        <button className="esp-context-item" role="menuitem" onClick={() => run(actions.onRename)}>
          <Icon name="file" size={14} /> Rename
        </button>
        <button
          className="esp-context-item"
          role="menuitem"
          onClick={() => run(actions.onNewSubfolder)}
        >
          <Icon name="plus" size={14} /> New subfolder
        </button>
        <div className="esp-context-sep" />
        <button
          className="esp-context-item danger"
          role="menuitem"
          onClick={() => run(actions.onDelete)}
        >
          <Icon name="trash" size={14} /> Delete…
        </button>
      </div>
    </>
  );
}
