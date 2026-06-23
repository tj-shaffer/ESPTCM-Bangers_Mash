/** Repository: folder tree + case list + editor, plus import & folder creation. */

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Spinner from '@atlaskit/spinner';
import type { Environment, FolderNode, PackageDetail, SuiteDetail, TestCaseStatus, TestCaseSummary, TestType } from '../../domain/types';
import { ENVIRONMENTS, suiteId, TEAM_MEMBERS, TEST_TYPES, TEST_TYPE_LABELS } from '../../domain/types';
import {
  useCase,
  useCases,
  useCreateCase,
  useCreateFolder,
  useDeleteCase,
  useDeleteFolder,
  useDuplicateCase,
  useFolderTree,
  useUpdateCase,
  useUpdateFolder,
} from '../../api/repository';
import { useCreateCycle, useCreateRun, usePackages } from '../../api/runs';
import { useSuites, useSuite, useCreateSuite, useDeleteSuite } from '../../api/suites';
import { FolderTree, type FolderActions } from './FolderTree';
import { TestCaseList } from './TestCaseList';
import { TestCaseEditor } from './TestCaseEditor';
import { ImportWizard } from '../import/ImportWizard';
import { Modal, Toast } from '../../components/ui';
import { Icon } from '../../components/Icon';
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

/** Total folders (including the node itself) and test cases in a subtree. */
function folderSubtreeStats(node: FolderNode): { folders: number; cases: number } {
  let folders = 1;
  let cases = node.testCaseCount;
  for (const child of node.children) {
    const s = folderSubtreeStats(child);
    folders += s.folders;
    cases += s.cases;
  }
  return { folders, cases };
}

/** All folder ids in a subtree (the node plus every descendant). */
function collectFolderIds(node: FolderNode): string[] {
  return [node.id, ...node.children.flatMap(collectFolderIds)];
}

export function RepositoryView({ deepCaseId = null }: { deepCaseId?: string | null } = {}) {
  const tree = useFolderTree();
  const [folder, setFolder] = useState<FolderNode | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(deepCaseId);
  const [creatingCase, setCreatingCase] = useState(false);
  const [showImport, setShowImport] = useState(false);
  // `undefined` = the New-folder modal is closed; otherwise the value is the
  // default parent folder id (string) or null for a top-level folder.
  const [newFolderParent, setNewFolderParent] = useState<string | null | undefined>(undefined);
  const [renamingFolder, setRenamingFolder] = useState<FolderNode | null>(null);
  const [folderQuery, setFolderQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [runModal, setRunModal] = useState<{
    candidates: TestCaseSummary[];
    defaultName: string;
    mode: 'folder' | 'selected';
  } | null>(null);
  const [cycleModal, setCycleModal] = useState<{ candidates: TestCaseSummary[]; defaultName: string } | null>(null);
  // Save-as-suite modal carries the selected case ids; Suites modal is the
  // browse/run/delete surface for saved suites.
  const [saveSuiteIds, setSaveSuiteIds] = useState<string[] | null>(null);
  const [showSuites, setShowSuites] = useState(false);

  const auth = useAuth();
  const canAuthor = auth.can('repo.createCase');
  const canRun = auth.can('run.create');

  const cases = useCases(folder?.id);
  const selectedCase = useCase(creatingCase ? null : selectedCaseId);

  const qc = useQueryClient();
  const createCase = useCreateCase();
  const updateCase = useUpdateCase();
  const deleteCase = useDeleteCase();
  const duplicateCase = useDuplicateCase();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const createSuite = useCreateSuite();

  // Auto-select a sensible default folder once the tree loads — unless a case is
  // deep-linked, in which case the effect below opens that case's folder.
  useEffect(() => {
    if (!folder && !selectedCaseId && tree.data && tree.data.length > 0) {
      setFolder(findFirstFolder(tree.data));
    }
  }, [tree.data, folder, selectedCaseId]);

  // Incoming deep link (#repository/<caseId>): open that case.
  useEffect(() => {
    if (deepCaseId && deepCaseId !== selectedCaseId) {
      setSelectedCaseId(deepCaseId);
      setCreatingCase(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepCaseId]);

  // Follow the selected case into its folder when it isn't the current one
  // (a no-op in normal use; switches folders for a deep-linked case).
  useEffect(() => {
    const c = selectedCase.data;
    if (c && c.folderId !== folder?.id) {
      const f = findFolderById(tree.data ?? [], c.folderId);
      if (f) setFolder(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCase.data, tree.data]);

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

  // Save the new case but stay in create mode with a blank form (the editor
  // resets itself), so a folder can be built out without the create→reselect cycle.
  const handleSaveAndNew = async (input: Omit<Parameters<typeof createCase.mutateAsync>[0], 'folderId'>) => {
    if (!folder) return;
    const created = await createCase.mutateAsync({ ...input, folderId: folder.id });
    flashToast(`Created TC-${created.displayId} — add another`);
  };

  const handleDuplicate = async () => {
    if (!selectedCaseId) return;
    const copy = await duplicateCase.mutateAsync(selectedCaseId);
    setSelectedCaseId(copy.id);
    flashToast(`Duplicated → TC-${copy.displayId}`);
  };

  const handleDelete = async () => {
    if (!selectedCaseId || !selectedCase.data) return;
    if (
      !window.confirm(
        `Delete TC-${selectedCase.data.displayId} "${selectedCase.data.title}"? This also removes any execution results for it and cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteCase.mutateAsync(selectedCaseId);
      setSelectedCaseId(null);
      flashToast('Test case deleted');
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not delete test case');
    }
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

  const handleRenameFolder = async (node: FolderNode, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) {
      setRenamingFolder(null);
      return;
    }
    try {
      await updateFolder.mutateAsync({ id: node.id, patch: { name: trimmed } });
      // Keep the breadcrumb/header in sync if the renamed folder is open.
      if (folder?.id === node.id) setFolder({ ...folder, name: trimmed });
      flashToast('Folder renamed');
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not rename folder');
    } finally {
      setRenamingFolder(null);
    }
  };

  const handleDeleteFolder = async (node: FolderNode) => {
    const { folders, cases } = folderSubtreeStats(node);
    const subfolders = folders - 1;
    const parts: string[] = [];
    if (subfolders > 0) parts.push(`${subfolders} subfolder${subfolders === 1 ? '' : 's'}`);
    if (cases > 0) parts.push(`${cases} test case${cases === 1 ? '' : 's'}`);
    const detail =
      parts.length > 0
        ? `This permanently deletes ${parts.join(' and ')} (including any runs and results) and cannot be undone.`
        : 'This folder is empty.';
    if (!window.confirm(`Delete “${node.name}”?\n\n${detail}`)) return;
    try {
      const res = await deleteFolder.mutateAsync(node.id);
      // If the open folder was inside what we just removed, clear the selection.
      const removed = new Set(collectFolderIds(node));
      if (folder && removed.has(folder.id)) {
        setFolder(null);
        setSelectedCaseId(null);
      }
      flashToast(
        res.deletedCases > 0
          ? `Deleted folder and ${res.deletedCases} test case${res.deletedCases === 1 ? '' : 's'}`
          : 'Folder deleted',
      );
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not delete folder');
    }
  };

  const folderActions: FolderActions = {
    onRename: (f) => setRenamingFolder(f),
    onNewSubfolder: (f) => setNewFolderParent(f.id),
    onDelete: handleDeleteFolder,
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} test case${ids.length === 1 ? '' : 's'}? This also removes any execution results and cannot be undone.`,
      )
    )
      return;
    try {
      await Promise.all(ids.map((id) => deleteCase.mutateAsync(id)));
      if (selectedCaseId && ids.includes(selectedCaseId)) setSelectedCaseId(null);
      flashToast(`Deleted ${ids.length} test case${ids.length === 1 ? '' : 's'}`);
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not delete some test cases');
    } finally {
      qc.invalidateQueries({ queryKey: ['repo'] });
    }
  };

  const handleBulkSetStatus = async (ids: string[], status: TestCaseStatus) => {
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => updateCase.mutateAsync({ id, patch: { status } })));
      flashToast(`Set ${ids.length} case${ids.length === 1 ? '' : 's'} to ${status}`);
    } catch (err) {
      flashToast(err instanceof Error ? err.message : 'Could not update some test cases');
    } finally {
      qc.invalidateQueries({ queryKey: ['repo'] });
    }
  };

  // ---- Run handoff: launch a run straight from the repository, cases pre-loaded.
  const folderCases = cases.data ?? [];
  const runnableCount = folderCases.filter((c) => c.status === 'ACTIVE').length;
  const defaultRunName = () => `${folder?.name ?? 'Run'} — ${new Date().toLocaleDateString()}`;
  const openRunFolder = () =>
    setRunModal({ candidates: folderCases, defaultName: defaultRunName(), mode: 'folder' });
  const openRunSelected = (ids: string[]) => {
    const set = new Set(ids);
    setRunModal({ candidates: folderCases.filter((c) => set.has(c.id)), defaultName: defaultRunName(), mode: 'selected' });
  };
  // Hand off to the runner: the #runs/<id> hash drops the user into RunPlayer.
  const handleRunStarted = (runId: string) => {
    setRunModal(null);
    window.location.hash = `runs/${runId}`;
  };
  // Run a saved suite — open the same Start-a-run modal pre-filled with its cases.
  const runSuite = (suite: SuiteDetail) => {
    setShowSuites(false);
    setRunModal({ candidates: suite.cases, defaultName: `${suite.name} — ${new Date().toLocaleDateString()}`, mode: 'selected' });
  };
  // Cycle handoff: pick testers, spawn one duped run each, bundled in a package.
  const openCycleFolder = () => setCycleModal({ candidates: folderCases, defaultName: folder?.name ?? 'Cycle' });
  const handleCycleStarted = (pkg: PackageDetail) => {
    setCycleModal(null);
    flashToast(`Cycle “${pkg.name}” created — ${pkg.runs.length} run${pkg.runs.length === 1 ? '' : 's'}`);
    window.location.hash = 'runs';
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
          <div style={{ display: 'flex', gap: 2 }}>
            {canRun ? (
              <button
                className="esp-btn esp-btn-ghost"
                onClick={() => setShowSuites(true)}
                title="Browse and run saved suites (reusable case sets)"
              >
                <Icon name="copy" /> Suites
              </button>
            ) : null}
            {canAuthor ? (
              <button
                className="esp-btn esp-btn-ghost"
                onClick={() => setNewFolderParent(null)}
                title="New top-level folder (use a folder's ⋯ menu to add a subfolder)"
              >
                + Folder
              </button>
            ) : null}
          </div>
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
          actions={canAuthor ? folderActions : undefined}
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
            {canRun ? (
              <button
                className="esp-btn esp-btn-secondary"
                disabled={!folder || runnableCount === 0}
                title={
                  !folder
                    ? 'Select a folder first'
                    : runnableCount === 0
                      ? 'No active cases in this folder to run'
                      : 'Start a run from this folder’s active cases'
                }
                onClick={openRunFolder}
              >
                <Icon name="play" /> Run folder
              </button>
            ) : null}
            {canRun ? (
              <button
                className="esp-btn esp-btn-secondary"
                disabled={!folder || runnableCount === 0}
                title={
                  !folder
                    ? 'Select a folder first'
                    : runnableCount === 0
                      ? 'No active cases in this folder'
                      : 'Start a multi-tester cycle from this folder’s active cases'
                }
                onClick={openCycleFolder}
              >
                <Icon name="package" /> Start a cycle
              </button>
            ) : null}
            {canAuthor ? (
              <>
                <button
                  className="esp-btn esp-btn-secondary"
                  disabled={!folder}
                  onClick={() => setShowImport(true)}
                >
                  <Icon name="upload" /> Import CSV/Excel
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
              key={folder?.id ?? 'none'}
              cases={cases.data ?? []}
              selectedId={selectedCaseId}
              onSelect={(id) => {
                setSelectedCaseId(id);
                setCreatingCase(false);
              }}
              bulk={
                canAuthor
                  ? {
                      onDelete: handleBulkDelete,
                      onSetStatus: handleBulkSetStatus,
                      onRun: canRun ? openRunSelected : undefined,
                      onSaveSuite: (ids) => setSaveSuiteIds(ids),
                      busy: deleteCase.isPending || updateCase.isPending,
                    }
                  : undefined
              }
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
            onSaveAndNew={handleSaveAndNew}
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
              <div style={{ color: 'var(--esp-faint)' }}><Icon name="folder" size={30} /></div>
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

      {runModal ? (
        <StartRunModal
          candidates={runModal.candidates}
          defaultName={runModal.defaultName}
          mode={runModal.mode}
          onClose={() => setRunModal(null)}
          onStarted={handleRunStarted}
        />
      ) : null}

      {cycleModal ? (
        <CycleModal
          candidates={cycleModal.candidates}
          defaultName={cycleModal.defaultName}
          onClose={() => setCycleModal(null)}
          onCreated={handleCycleStarted}
        />
      ) : null}

      {newFolderParent !== undefined ? (
        <NewFolderModal
          tree={tree.data ?? []}
          defaultParentId={newFolderParent}
          busy={createFolder.isPending}
          onClose={() => setNewFolderParent(undefined)}
          onCreate={async (name, parentId) => {
            await createFolder.mutateAsync({ name, parentId });
            setNewFolderParent(undefined);
            flashToast(parentId ? 'Folder created' : 'Top-level folder created');
          }}
        />
      ) : null}

      {renamingFolder ? (
        <RenameFolderModal
          folder={renamingFolder}
          busy={updateFolder.isPending}
          onClose={() => setRenamingFolder(null)}
          onRename={(name) => handleRenameFolder(renamingFolder, name)}
        />
      ) : null}

      {saveSuiteIds ? (
        <SaveSuiteModal
          count={saveSuiteIds.length}
          onClose={() => setSaveSuiteIds(null)}
          onSave={(name, description) => {
            createSuite.mutate(
              { name, description: description || undefined, caseIds: saveSuiteIds },
              {
                onSuccess: () => {
                  setSaveSuiteIds(null);
                  flashToast(`Saved suite “${name.trim()}”`);
                },
              },
            );
          }}
          busy={createSuite.isPending}
        />
      ) : null}

      {showSuites ? (
        <SuitesModal canAuthor={canAuthor} onClose={() => setShowSuites(false)} onRun={runSuite} />
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </div>
  );
}

/** Lightweight run launcher for the repository handoff: pre-filled name + an
 *  environment, cases already chosen by context. Assignee defaults to the current
 *  user server-side and packaging is a manager concern, so neither is asked here —
 *  the heavyweight cross-folder picker still lives in RunsView. */
/** Start a cycle: pick testers → one duped run each, bundled into a thematic package. */
function CycleModal({
  candidates,
  defaultName,
  onClose,
  onCreated,
}: {
  candidates: TestCaseSummary[];
  defaultName: string;
  onClose: () => void;
  onCreated: (pkg: PackageDetail) => void;
}) {
  const createCycle = useCreateCycle();
  const runnable = useMemo(() => candidates.filter((c) => c.status === 'ACTIVE'), [candidates]);
  const [name, setName] = useState(defaultName);
  const [environment, setEnvironment] = useState<Environment>('TEST');
  const [packageType, setPackageType] = useState<TestType>('REGRESSION');
  const [testers, setTesters] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  const addTester = () => {
    const t = draft.trim();
    if (t && !testers.includes(t)) setTesters((prev) => [...prev, t]);
    setDraft('');
  };
  const removeTester = (t: string) => setTesters((prev) => prev.filter((x) => x !== t));

  const canCreate = name.trim().length > 0 && testers.length > 0 && runnable.length > 0 && !createCycle.isPending;
  const start = () => {
    if (!canCreate) return;
    createCycle.mutate(
      { name: name.trim(), packageType, environment, testCaseIds: runnable.map((c) => c.id), assignees: testers },
      { onSuccess: (pkg) => onCreated(pkg) },
    );
  };

  return (
    <Modal
      title="Start a cycle"
      onClose={onClose}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={createCycle.isPending}>
            Cancel
          </button>
          <button className="esp-btn esp-btn-primary" disabled={!canCreate} onClick={start}>
            {createCycle.isPending ? 'Creating…' : <><Icon name="package" /> Create cycle ({testers.length} run{testers.length === 1 ? '' : 's'})</>}
          </button>
        </>
      }
    >
      <p className="esp-muted" style={{ fontSize: 13, marginTop: 0 }}>
        A cycle is a thematic <strong>package</strong> with one run per tester (same cases). Each tester gets their own pass; the approver signs off the whole cycle once.
      </p>
      <div className="esp-field">
        <label className="esp-label">Cycle name</label>
        <input
          className="esp-input"
          autoFocus
          value={name}
          placeholder="e.g. Coupa Integration — Q3 UAT"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="esp-grid-2">
        <div className="esp-field">
          <label className="esp-label">Environment</label>
          <select className="esp-select" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
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
      </div>
      <div className="esp-field">
        <label className="esp-label">Testers ({testers.length})</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="esp-input"
            list="esp-cycle-testers"
            placeholder="Add a tester (e.g. Kara)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTester();
              }
            }}
          />
          <button className="esp-btn esp-btn-secondary" type="button" onClick={addTester} disabled={!draft.trim()}>
            Add
          </button>
          <datalist id="esp-cycle-testers">
            {TEAM_MEMBERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        {testers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {testers.map((t) => (
              <span key={t} className="esp-badge esp-badge-soft" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t}
                <button
                  type="button"
                  onClick={() => removeTester(t)}
                  aria-label={`Remove ${t}`}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, font: 'inherit', lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="esp-muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            Add at least one tester — each gets their own run of the same cases.
          </p>
        )}
      </div>
      <p className="esp-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
        {runnable.length > 0
          ? `${testers.length} run${testers.length === 1 ? '' : 's'} · ${runnable.length} case${runnable.length === 1 ? '' : 's'} each, bundled into this cycle.`
          : 'No active cases here to run.'}
      </p>
      {createCycle.isError ? (
        <p className="esp-error" style={{ fontSize: 12, marginTop: 6 }}>{(createCycle.error as Error).message}</p>
      ) : null}
    </Modal>
  );
}

function StartRunModal({
  candidates,
  defaultName,
  mode,
  onClose,
  onStarted,
}: {
  candidates: TestCaseSummary[];
  defaultName: string;
  mode: 'folder' | 'selected';
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const createRun = useCreateRun();
  const packages = usePackages();
  const [name, setName] = useState(defaultName);
  const [environment, setEnvironment] = useState<Environment>('TEST');
  const [assignee, setAssignee] = useState('');
  const [packageId, setPackageId] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(false);

  const activeCount = candidates.filter((c) => c.status === 'ACTIVE').length;
  const nonActiveCount = candidates.length - activeCount;
  // "Run selected" runs exactly what the user picked; "Run folder" is active-only
  // unless they opt in to drafts/other statuses.
  const runnable = mode === 'selected' || includeDrafts ? candidates : candidates.filter((c) => c.status === 'ACTIVE');
  const canStart = name.trim().length > 0 && runnable.length > 0 && !createRun.isPending;

  const start = () =>
    createRun.mutate(
      {
        name: name.trim(),
        environment,
        testCaseIds: runnable.map((c) => c.id),
        assigneeName: assignee.trim() || undefined,
        packageId: packageId || undefined,
      },
      { onSuccess: (r) => onStarted(r.id) },
    );

  return (
    <Modal
      title="Start a run"
      maxWidth={460}
      onClose={onClose}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={createRun.isPending}>
            Cancel
          </button>
          <button className="esp-btn esp-btn-primary" disabled={!canStart} onClick={start}>
            {createRun.isPending ? 'Starting…' : <><Icon name="play" /> Start run ({runnable.length})</>}
          </button>
        </>
      }
    >
      <div className="esp-field">
        <label className="esp-label">Run name</label>
        <input
          className="esp-input"
          autoFocus
          value={name}
          placeholder="e.g. Coupa Integration — Single Item (TEST)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canStart) start();
          }}
        />
        <p className="esp-muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Name it for what's tested + the scope — it's how this run is spotted in the Pipeline and dashboard.
        </p>
      </div>
      <div className="esp-grid-2">
        <div className="esp-field">
          <label className="esp-label">Environment</label>
          <select className="esp-select" value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </div>
        <div className="esp-field">
          <label className="esp-label">Assign to (optional)</label>
          <input
            className="esp-input"
            list="esp-team-members"
            placeholder="e.g. David Brodecki"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <datalist id="esp-team-members">
            {TEAM_MEMBERS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>
      {/* Packages bundle existing runs for approval — only meaningful once some
          exist, so we hide this for the common first-run case to avoid confusion.
          Packages are assembled from the Pipeline board. */}
      {(packages.data ?? []).length > 0 ? (
        <div className="esp-field">
          <label className="esp-label">Add to package (optional)</label>
          <select className="esp-select" value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="">No package</option>
            {(packages.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {mode === 'folder' && nonActiveCount > 0 ? (
        <label className="esp-pick-row" style={{ marginBottom: 6 }}>
          <input type="checkbox" checked={includeDrafts} onChange={(e) => setIncludeDrafts(e.target.checked)} />
          <span>Include {nonActiveCount} non-active case{nonActiveCount === 1 ? '' : 's'} (drafts, etc.)</span>
        </label>
      ) : null}
      <p className="esp-muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
        {runnable.length > 0
          ? `${runnable.length} case${runnable.length === 1 ? '' : 's'} will be added to this run.`
          : 'No runnable cases — adjust your selection.'}
      </p>
      {createRun.isError ? (
        <p className="esp-error" style={{ fontSize: 12, marginTop: 6 }}>{(createRun.error as Error).message}</p>
      ) : null}
    </Modal>
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

/** Rename an existing folder. */
function RenameFolderModal({
  folder,
  busy,
  onClose,
  onRename,
}: {
  folder: FolderNode;
  busy: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [name, setName] = useState(folder.name);
  const canSave = name.trim().length > 0 && !busy;
  return (
    <Modal
      title="Rename folder"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="esp-btn esp-btn-primary"
            onClick={() => onRename(name)}
            disabled={!canSave}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="esp-field" style={{ marginBottom: 0 }}>
        <label className="esp-label">Folder name</label>
        <input
          className="esp-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onRename(name);
          }}
        />
      </div>
    </Modal>
  );
}

/** Name + (optional) describe a new suite from the selected cases. */
function SaveSuiteModal({
  count,
  onClose,
  onSave,
  busy,
}: {
  count: number;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const canSave = name.trim().length > 0 && !busy;
  return (
    <Modal
      title="Save as suite"
      maxWidth={460}
      onClose={onClose}
      footer={
        <>
          <button className="esp-btn esp-btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="esp-btn esp-btn-primary" disabled={!canSave} onClick={() => onSave(name, description)}>
            {busy ? 'Saving…' : 'Save suite'}
          </button>
        </>
      }
    >
      <p className="esp-muted" style={{ fontSize: 13, marginTop: 0 }}>
        A suite is a reusable set of {count} test case{count === 1 ? '' : 's'} you can run again anytime — across folders.
      </p>
      <div className="esp-field">
        <label className="esp-label">Suite name</label>
        <input
          className="esp-input"
          autoFocus
          placeholder="e.g. Cross-vendor smoke"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave(name, description);
          }}
        />
      </div>
      <div className="esp-field" style={{ marginBottom: 0 }}>
        <label className="esp-label">Description (optional)</label>
        <textarea
          className="esp-textarea"
          style={{ minHeight: 44 }}
          placeholder="What this suite covers"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

/** Browse saved suites; run one (pre-fills the run modal) or delete it. */
function SuitesModal({
  canAuthor,
  onClose,
  onRun,
}: {
  canAuthor: boolean;
  onClose: () => void;
  onRun: (suite: SuiteDetail) => void;
}) {
  const suites = useSuites();
  const deleteSuite = useDeleteSuite();
  const [runningId, setRunningId] = useState<string | null>(null);
  const running = useSuite(runningId);

  // Once the picked suite's detail (its cases) loads, hand off to the run modal.
  useEffect(() => {
    if (runningId && running.data) {
      onRun(running.data);
      setRunningId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningId, running.data]);

  const list = suites.data ?? [];
  return (
    <Modal
      title="Suites"
      maxWidth={520}
      onClose={onClose}
      footer={
        <button className="esp-btn esp-btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="esp-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Reusable sets of <strong>test cases</strong> you can run anytime. Select cases in the repository and “Save as suite” to create one. (To bundle finished <strong>runs</strong> for approval, use Packages on the Pipeline.)
      </p>
      {suites.isLoading ? (
        <div className="esp-spinner-wrap"><Spinner size="medium" /></div>
      ) : list.length === 0 ? (
        <div className="esp-empty">No suites yet.</div>
      ) : (
        <div className="esp-list" style={{ padding: 0 }}>
          {list.map((s) => (
            <div key={s.id} className="esp-case-row" style={{ cursor: 'default' }}>
              <span className="esp-case-id" style={{ width: 'auto' }}>{suiteId(s.displayId)}</span>
              <div className="esp-case-main">
                <div className="esp-case-title">{s.name}</div>
                <div className="esp-case-meta">
                  <span>{s.caseCount} case{s.caseCount === 1 ? '' : 's'}</span>
                  {s.description ? <span>· {s.description}</span> : null}
                </div>
              </div>
              <button
                className="esp-btn esp-btn-primary"
                disabled={running.isFetching && runningId === s.id}
                onClick={() => setRunningId(s.id)}
                title="Start a run from this suite"
              >
                <Icon name="play" /> Run
              </button>
              {canAuthor ? (
                <button
                  className="esp-btn esp-btn-danger"
                  disabled={deleteSuite.isPending}
                  onClick={() => deleteSuite.mutate(s.id)}
                  title="Delete suite"
                >
                  <Icon name="trash" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
