/** Repository: folder tree + case list + editor, plus import & folder creation. */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Spinner from '@atlaskit/spinner';
import type { FolderNode } from '../../domain/types';
import {
  useCase,
  useCases,
  useCreateCase,
  useCreateFolder,
  useDeleteCase,
  useDuplicateCase,
  useFolderTree,
  useUpdateCase,
} from '../../api/repository';
import { FolderTree } from './FolderTree';
import { TestCaseList } from './TestCaseList';
import { TestCaseEditor } from './TestCaseEditor';
import { ImportWizard } from '../import/ImportWizard';
import { Modal, Toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

function findFirstFolder(nodes: FolderNode[]): FolderNode | null {
  for (const n of nodes) {
    if (n.testCaseCount > 0) return n;
  }
  for (const n of nodes) {
    const inChild = findFirstFolder(n.children);
    if (inChild) return inChild;
  }
  return nodes[0] ?? null;
}

function findFolderById(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findFolderById(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Names from root → the folder with `id`, for a breadcrumb. Empty if not found. */
function folderPathNames(nodes: FolderNode[], id: string): string[] {
  const walk = (ns: FolderNode[], trail: FolderNode[]): FolderNode[] | null => {
    for (const n of ns) {
      const next = [...trail, n];
      if (n.id === id) return next;
      const hit = walk(n.children, next);
      if (hit) return hit;
    }
    return null;
  };
  return (walk(nodes, []) ?? []).map((f) => f.name);
}

export function RepositoryView() {
  const tree = useFolderTree();
  const [folder, setFolder] = useState<FolderNode | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [creatingCase, setCreatingCase] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [folderQuery, setFolderQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const auth = useAuth();
  const canAuthor = auth.can('repo.createCase');

  const cases = useCases(folder?.id);
  const selectedCase = useCase(creatingCase ? null : selectedCaseId);

  const qc = useQueryClient();
  const createCase = useCreateCase();
  const updateCase = useUpdateCase();
  const deleteCase = useDeleteCase();
  const duplicateCase = useDuplicateCase();
  const createFolder = useCreateFolder();

  // Auto-select a sensible default folder once the tree loads.
  useEffect(() => {
    if (!folder && tree.data && tree.data.length > 0) {
      setFolder(findFirstFolder(tree.data));
    }
  }, [tree.data, folder]);

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const saving = createCase.isPending || updateCase.isPending;

  const treeData = tree.data ?? [];
  const selectedFolderPath = folder ? folderPathNames(treeData, folder.id) : [];
  const casePath = selectedCase.data ? folderPathNames(treeData, selectedCase.data.folderId) : [];

  const handleSave = async (input: Omit<Parameters<typeof createCase.mutateAsync>[0], 'folderId'>) => {
    if (creatingCase) {
      if (!folder) return;
      const created = await createCase.mutateAsync({ ...input, folderId: folder.id });
      setCreatingCase(false);
      setSelectedCaseId(created.id);
      flashToast(`Created TC-${created.displayId}`);
    } else if (selectedCaseId) {
      const updated = await updateCase.mutateAsync({ id: selectedCaseId, patch: input });
      flashToast(`Saved TC-${updated.displayId}`);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedCaseId) return;
    const copy = await duplicateCase.mutateAsync(selectedCaseId);
    setSelectedCaseId(copy.id);
    flashToast(`Duplicated → TC-${copy.displayId}`);
  };

  const handleDelete = async () => {
    if (!selectedCaseId || !selectedCase.data) return;
    if (!window.confirm(`Delete TC-${selectedCase.data.displayId} "${selectedCase.data.title}"? This cannot be undone.`)) {
      return;
    }
    await deleteCase.mutateAsync(selectedCaseId);
    setSelectedCaseId(null);
    flashToast('Test case deleted');
  };

  const handleMove = async (folderId: string) => {
    if (!selectedCaseId) return;
    await updateCase.mutateAsync({ id: selectedCaseId, patch: { folderId } });
    // Both the source and destination folder lists + tree counts change.
    qc.invalidateQueries({ queryKey: ['repo'] });
    const target = findFolderById(tree.data ?? [], folderId);
    if (target) setFolder(target);
    flashToast(`Moved to ${target?.name ?? 'folder'}`);
  };

  if (tree.isLoading) {
    return (
      <div className="esp-spinner-wrap">
        <Spinner size="large" />
      </div>
    );
  }
  if (tree.isError) {
    return <div className="esp-error" style={{ padding: 20 }}>Failed to load repository: {(tree.error as Error).message}</div>;
  }

  return (
    <div className="esp-body">
      <aside className="esp-sidebar">
        <div className="esp-sidebar-head">
          <span className="esp-sidebar-title">Repository</span>
          {canAuthor ? (
            <button className="esp-btn esp-btn-ghost" onClick={() => setShowNewFolder(true)} title="New folder">
              + Folder
            </button>
          ) : null}
        </div>
        <input
          className="esp-input"
          style={{ margin: '8px 10px', width: 'calc(100% - 20px)' }}
          placeholder="Search folders…"
          value={folderQuery}
          onChange={(e) => setFolderQuery(e.target.value)}
        />
        <FolderTree
          nodes={tree.data ?? []}
          selectedId={folder?.id ?? null}
          filter={folderQuery}
          onSelect={(f) => {
            setFolder(f);
            setSelectedCaseId(null);
            setCreatingCase(false);
          }}
        />
      </aside>

      <div className="esp-main">
        <div className="esp-list-pane">
          <div className="esp-toolbar">
            <div style={{ minWidth: 0 }}>
              {selectedFolderPath.length > 1 ? (
                <div className="esp-muted" style={{ fontSize: 11 }} title={selectedFolderPath.join(' › ')}>
                  {selectedFolderPath.slice(0, -1).join(' › ')} ›
                </div>
              ) : null}
              <h2 style={{ margin: 0 }}>{folder?.name ?? 'Select a folder'}</h2>
            </div>
            <div className="esp-header-spacer" />
            {canAuthor ? (
              <>
                <button
                  className="esp-btn esp-btn-secondary"
                  disabled={!folder}
                  onClick={() => setShowImport(true)}
                >
                  ⬆ Import CSV/Excel
                </button>
                <button
                  className="esp-btn esp-btn-primary"
                  disabled={!folder}
                  onClick={() => {
                    setCreatingCase(true);
                    setSelectedCaseId(null);
                  }}
                >
                  + New test case
                </button>
              </>
            ) : null}
          </div>

          {cases.isLoading ? (
            <div className="esp-spinner-wrap">
              <Spinner size="medium" />
            </div>
          ) : (
            <TestCaseList
              cases={cases.data ?? []}
              selectedId={selectedCaseId}
              onSelect={(id) => {
                setSelectedCaseId(id);
                setCreatingCase(false);
              }}
            />
          )}
        </div>

        {creatingCase && folder ? (
          <TestCaseEditor
            testCase={null}
            isNew
            folderName={folder.name}
            folderPath={selectedFolderPath}
            saving={saving}
            onSave={handleSave}
            onCancelNew={() => setCreatingCase(false)}
          />
        ) : selectedCaseId && selectedCase.data ? (
          <TestCaseEditor
            testCase={selectedCase.data}
            isNew={false}
            folderName={folder?.name ?? ''}
            folderOptions={flattenFolders(tree.data ?? [])}
            folderPath={casePath}
            onMove={canAuthor ? handleMove : undefined}
            saving={saving}
            onSave={handleSave}
            onDuplicate={canAuthor ? handleDuplicate : undefined}
            onDelete={canAuthor ? handleDelete : undefined}
            readOnly={!canAuthor}
          />
        ) : selectedCaseId && selectedCase.isLoading ? (
          <div className="esp-detail">
            <div className="esp-spinner-wrap">
              <Spinner size="medium" />
            </div>
          </div>
        ) : (
          <div className="esp-detail">
            <div className="esp-detail-empty">
              <div style={{ fontSize: 30 }}>🗂️</div>
              <div style={{ fontWeight: 700 }}>Select a test case</div>
              <div className="esp-muted">Pick one from the list, or create / import to get started.</div>
            </div>
          </div>
        )}
      </div>

      {showImport && folder ? (
        <ImportWizard
          folderId={folder.id}
          folderName={folder.name}
          onClose={() => setShowImport(false)}
          onImported={(n) => {
            setShowImport(false);
            flashToast(`Imported ${n} test case${n === 1 ? '' : 's'}`);
          }}
        />
      ) : null}

      {showNewFolder ? (
        <NewFolderModal
          tree={tree.data ?? []}
          defaultParentId={folder?.id ?? null}
          busy={createFolder.isPending}
          onClose={() => setShowNewFolder(false)}
          onCreate={async (name, parentId) => {
            await createFolder.mutateAsync({ name, parentId });
            setShowNewFolder(false);
            flashToast(parentId ? 'Folder created' : 'Top-level folder created');
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

/** Flatten the folder tree to {id, label} rows with indentation, for a <select>. */
function flattenFolders(nodes: FolderNode[], depth = 0): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'  '.repeat(depth)}${n.name}` });
    out.push(...flattenFolders(n.children, depth + 1));
  }
  return out;
}

function NewFolderModal({
  tree,
  defaultParentId,
  busy,
  onClose,
  onCreate,
}: {
  tree: FolderNode[];
  defaultParentId: string | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, parentId: string | null) => void;
}) {
  const [name, setName] = useState('');
  // Default to the selected folder so the common "subfolder" case is one click,
  // but "— Top level —" is always available so a root folder can be created.
  const [parentId, setParentId] = useState<string>(defaultParentId ?? '');
  const options = useMemo(() => flattenFolders(tree), [tree]);
  const submit = () => onCreate(name, parentId || null);

  return (
    <Modal
      title="New folder"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="esp-btn esp-btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create folder'}
          </button>
        </>
      }
    >
      <div className="esp-field">
        <label className="esp-label">Parent</label>
        <select className="esp-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">— Top level —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="esp-field" style={{ marginBottom: 0 }}>
        <label className="esp-label">Folder name</label>
        <input
          className="esp-input"
          autoFocus
          placeholder="Folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) submit();
          }}
        />
      </div>
    </Modal>
  );
}
