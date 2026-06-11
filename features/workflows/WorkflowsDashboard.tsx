"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { listWorkflows, WorkflowApiError } from "@/lib/api/workflows";
import type { WorkflowListItem } from "@/contracts/workflow";
import type { WorkflowFolder } from "@/contracts/folders";
import { WorkflowCard } from "./WorkflowCard";
import { WorkflowsTable } from "./WorkflowsTable";
import { WorkflowsEmptyState } from "./WorkflowsEmptyState";
import { WorkflowsStatCards } from "./WorkflowsStatCards";
import {
  WorkflowsToolbar,
  type WorkflowStatusFilter,
  type WorkflowsTab,
  type WorkflowsView,
} from "./WorkflowsToolbar";
import { WorkflowFoldersGrid } from "./folders/WorkflowFoldersGrid";
import { WorkflowsTrashView } from "./folders/WorkflowsTrashView";
import { WorkflowsUndoToast } from "./folders/WorkflowsUndoToast";
import { FolderFormDialog } from "./folders/FolderFormDialog";
import { FolderDeleteDialog } from "./folders/FolderDeleteDialog";
import { FolderMoveDialog } from "./folders/FolderMoveDialog";
import { WorkflowsBulkActions } from "./folders/WorkflowsBulkActions";
import { useWorkflowSelection } from "./folders/useWorkflowSelection";
import { useFolderManagement, type UndoState } from "./folders/useFolderManagement";
import { flattenForDisplay } from "./folders/folderTree";
import {
  WorkflowsFiltersPanel,
  DEFAULT_FILTERS,
  UNCATEGORIZED,
  countActiveFilters,
  type DashboardFilters,
} from "./folders/WorkflowsFiltersPanel";
import {
  applyFilters,
  deriveAppOptions,
  deriveFolderCounts,
} from "./folders/dashboardFilters";

/**
 * Workflows dashboard — top-level client orchestrator
 * (Slice 4.WORKFLOWS-PAGE-1; folders/trash/filters added in WF-5).
 *
 * Server-provided `initialWorkflows` + `initialFolders` avoid a first-paint
 * flash. The folder / Trash / move / undo concern lives in `useFolderManagement`
 * (folder list, nesting cursor, dialog targets, Trash, and the CRUD/restore
 * handlers); the dashboard owns the workflow list, filters/tabs, and the shared
 * error + undo surfaces. Trash is lazy-loaded only when its tab opens — initial
 * render makes NO folder/trash API calls.
 */
interface Props {
  initialWorkflows: readonly WorkflowListItem[];
  initialFolders?: readonly WorkflowFolder[];
  folderLimit?: number;
}

const UNDO_TIMEOUT_MS = 8000;

export function WorkflowsDashboard({
  initialWorkflows,
  initialFolders = [],
  folderLimit = 10,
}: Props) {
  const [workflows, setWorkflows] = useState<readonly WorkflowListItem[]>(initialWorkflows);
  const [tab, setTab] = useState<WorkflowsTab>("automations");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("all");
  const [view, setView] = useState<WorkflowsView>("list");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [undoPending, setUndoPending] = useState(false);

  const router = useRouter();
  const refreshSeqRef = useRef(0);

  // Client-side reload of the workflow list. Used on mount (to correct a stale
  // cached server payload — BUILDER-LIST-CACHE) and as the data half of
  // refresh(). Guards against a non-array result so an unconfigured/failed fetch
  // never replaces the list with `undefined`.
  const reloadList = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const next = await listWorkflows();
      if (seq !== refreshSeqRef.current) return;
      if (Array.isArray(next)) setWorkflows(next);
    } catch (err) {
      if (seq !== refreshSeqRef.current) return;
      setError(
        err instanceof WorkflowApiError
          ? err.message
          : "Couldn't refresh workflows. Please try again.",
      );
    } finally {
      if (seq === refreshSeqRef.current) setRefreshing(false);
    }
  }, []);

  // Mutation refresh (BUILDER-LIST-CACHE): invalidate Next's client Router Cache
  // so navigating away and back reflects the post-mutation truth (deleted rows
  // stay gone; created rows appear), THEN reload the visible list now. Passed to
  // every list-mutating handler (delete/trash/restore/move/folder/bulk).
  const refresh = useCallback(async () => {
    router.refresh();
    await reloadList();
  }, [router, reloadList]);

  // Folder / Trash / move-to-folder / undo-producing concern (see hook docs).
  const {
    folders,
    folderNav,
    setFolderNav,
    createOpen,
    setCreateOpen,
    renameTarget,
    setRenameTarget,
    moveTarget,
    setMoveTarget,
    deleteTarget,
    setDeleteTarget,
    handleCreateFolder,
    handleRenameFolder,
    handleMoveFolder,
    handleReorderFolder,
    handleDeleteFolder,
    handleMoveToFolder,
    handleMoveToTrash,
    trash,
    trashLoading,
    trashError,
    trashPendingId,
    loadTrash,
    handleRestoreFromTrash,
  } = useFolderManagement({
    initialFolders,
    refresh,
    trashActive: tab === "trash",
    onError: setError,
    onUndo: setUndo,
  });

  // Auto-dismiss the undo toast.
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [undo]);

  // BUILDER-LIST-CACHE — self-correct on mount. `initialWorkflows` can be a
  // STALE prefetched / Router-Cached server payload (e.g. after a create/delete
  // performed on another route, or a back-navigation), so a fresh client fetch
  // reconciles the list to the DB truth. `reloadList` is stable (no deps), so
  // this runs once per mount — no loop.
  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  // Keep list state in sync when the SERVER prop itself changes (e.g. a
  // router.refresh() merged a fresh RSC payload into this mounted instance).
  // Skipped while a client reload is in flight so an in-progress fresh fetch is
  // not clobbered by a possibly-older prop, and a no-op on the initial prop
  // (the ref starts equal). Never wipes mid-mutation optimistic state because
  // the mutation handlers drive `setWorkflows` through reloadList, not the prop.
  const prevInitialRef = useRef(initialWorkflows);
  useEffect(() => {
    if (prevInitialRef.current === initialWorkflows) return;
    prevInitialRef.current = initialWorkflows;
    if (!refreshing) setWorkflows(initialWorkflows);
  }, [initialWorkflows, refreshing]);

  const appOptions = useMemo(() => deriveAppOptions(workflows), [workflows]);
  const folderCounts = useMemo(() => deriveFolderCounts(workflows), [workflows]);
  const folderNames = useMemo(
    () => folders.map((f) => ({ id: f.id, name: f.name })),
    [folders],
  );
  const folderNameById = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name])),
    [folders],
  );

  const filtered = useMemo(
    () => applyFilters(workflows, query, statusFilter, filters),
    [workflows, query, statusFilter, filters],
  );

  const selection = useWorkflowSelection({
    filtered,
    active: tab === "automations" && view === "list",
    refresh,
    onError: setError,
    onUndo: setUndo,
  });

  const folderOptions = useMemo(
    () =>
      flattenForDisplay(folders).map(({ folder: f, depth }) => ({
        id: f.id,
        name: f.name,
        depth,
      })),
    [folders],
  );

  // Breadcrumb folder name when exactly one real folder is selected.
  const singleFolder = useMemo(() => {
    const real = filters.folderIds.filter((id) => id !== UNCATEGORIZED);
    if (real.length !== 1 || filters.folderIds.includes(UNCATEGORIZED)) return null;
    return folders.find((f) => f.id === real[0]) ?? null;
  }, [filters.folderIds, folders]);

  const hasAny = workflows.length > 0;
  const hasFiltered = filtered.length > 0;
  // Distinguish "this folder is empty" from "no filter match": only a folder
  // facet is active (no search / status / app / date narrowing).
  const folderScopedOnly =
    filters.folderIds.length > 0 &&
    query.trim() === "" &&
    statusFilter === "all" &&
    filters.apps.length === 0 &&
    filters.date === "any";

  // ── handlers ──────────────────────────────────────────────────────────────

  // One-click recovery from the over-filtered ("no matches") empty state: reset
  // search + status pills + the facet panel back to their defaults in one go.
  const clearFilters = useCallback(() => {
    setQuery("");
    setStatusFilter("all");
    setFilters(DEFAULT_FILTERS);
  }, []);

  const openFolder = useCallback((folderId: string) => {
    setFilters((f) => ({ ...f, folderIds: [folderId] }));
    setTab("automations");
  }, []);

  const runUndo = useCallback(async () => {
    if (!undo) return;
    setUndoPending(true);
    try {
      await undo.run();
      setUndo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't undo.");
    } finally {
      setUndoPending(false);
    }
  }, [undo]);

  const makeFolderActions = (w: WorkflowListItem) => ({
    folders: folderNames,
    onMoveToFolder: (folderId: string | null) => void handleMoveToFolder(w.id, folderId),
    onMoveToTrash: () => void handleMoveToTrash(w),
  });

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <section data-testid="workflows-dashboard" aria-label="Workflows" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Workflows</h1>
        <p data-testid="workflows-dashboard-subtitle" className="text-sm text-muted-foreground">
          {tab === "folders" ? (
            <>
              {folders.length} folder{folders.length === 1 ? "" : "s"} ·{" "}
              <code className="font-mono">{workflows.length}</code> automations
            </>
          ) : tab === "trash" ? (
            <>Deleted items are restorable for 7 days, then permanently removed.</>
          ) : hasAny ? (
            <>
              {singleFolder ? (
                <>
                  In <span className="font-medium text-foreground">{singleFolder.name}</span> —{" "}
                </>
              ) : null}
              Showing <code className="font-mono">{filtered.length}</code> of{" "}
              <code className="font-mono">{workflows.length}</code> — ordered by{" "}
              {filters.sort === "name" ? "name" : "most recently changed"}.
            </>
          ) : (
            <>Create your first workflow to get started.</>
          )}
        </p>
      </header>

      <WorkflowsStatCards workflows={workflows} />

      <WorkflowsToolbar
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        view={view}
        onView={setView}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={countActiveFilters(filters)}
      />

      {error && (
        <div
          role="alert"
          data-testid="workflows-dashboard-error"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={refresh} data-testid="workflows-dashboard-retry">
            Retry
          </Button>
        </div>
      )}

      {refreshing && !error && (
        <p role="status" data-testid="workflows-dashboard-loading" className="text-xs text-muted-foreground">
          Refreshing…
        </p>
      )}

      {/* ── Automations tab ── */}
      {tab === "automations" && (
        <>
          {!hasAny && <WorkflowsEmptyState kind="no-workflows" />}
          {hasAny && !hasFiltered && (
            <WorkflowsEmptyState
              kind={folderScopedOnly ? "empty-folder" : "no-matches"}
              onClearFilters={folderScopedOnly ? undefined : clearFilters}
            />
          )}
          {hasAny && hasFiltered && view === "list" && selection.selectedIds.size > 0 && (
            <WorkflowsBulkActions
              count={selection.selectedIds.size}
              folders={folderOptions}
              pending={selection.bulkPending}
              onMove={(folderId, label) => void selection.bulkMove(folderId, label)}
              onTrash={() => void selection.bulkTrash()}
              onClear={selection.clear}
            />
          )}
          {hasAny && hasFiltered && view === "list" && (
            <WorkflowsTable
              workflows={filtered}
              folderNameById={folderNameById}
              onChanged={refresh}
              folderActionsFor={makeFolderActions}
              selectedIds={selection.selectedIds}
              onToggleSelect={selection.toggleSelect}
              onToggleSelectAll={selection.toggleSelectAll}
            />
          )}
          {hasAny && hasFiltered && view === "grid" && (
            <ul
              data-testid="workflows-grid-view"
              aria-label="Workflows grid"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {filtered.map((w) => (
                <WorkflowCard key={w.id} workflow={w} onChanged={refresh} folderActions={makeFolderActions(w)} />
              ))}
            </ul>
          )}
        </>
      )}

      {/* ── Folders tab ── */}
      {tab === "folders" && (
        <WorkflowFoldersGrid
          folders={folders}
          counts={folderCounts}
          limit={folderLimit}
          currentParentId={folderNav}
          onNavigate={setFolderNav}
          onOpen={openFolder}
          onCreate={() => setCreateOpen(true)}
          onRename={(f) => setRenameTarget(f)}
          onMove={(f) => setMoveTarget(f)}
          onDelete={(f) => setDeleteTarget(f)}
          onReorder={(f, dir) => void handleReorderFolder(f, dir)}
        />
      )}

      {/* ── Trash tab ── */}
      {tab === "trash" && (
        <WorkflowsTrashView
          loading={trashLoading}
          error={trashError}
          listing={trash}
          pendingId={trashPendingId}
          onRestoreWorkflow={(id) => void handleRestoreFromTrash("workflow", id)}
          onRestoreFolder={(id) => void handleRestoreFromTrash("folder", id)}
          onRetry={loadTrash}
        />
      )}

      <WorkflowsFiltersPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        folders={folders}
        appOptions={appOptions}
      />

      {createOpen && (
        <FolderFormDialog mode="create" onSubmit={handleCreateFolder} onClose={() => setCreateOpen(false)} />
      )}
      {renameTarget && (
        <FolderFormDialog
          mode="rename"
          initialName={renameTarget.name}
          onSubmit={(name) => handleRenameFolder(renameTarget.id, name)}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {moveTarget && (
        <FolderMoveDialog
          folder={moveTarget}
          folders={folders}
          onConfirm={(parentFolderId) => handleMoveFolder(moveTarget, parentFolderId)}
          onClose={() => setMoveTarget(null)}
        />
      )}
      {deleteTarget && (
        <FolderDeleteDialog
          folderName={deleteTarget.name}
          onConfirm={(mode) => handleDeleteFolder(deleteTarget, mode)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {undo && (
        <WorkflowsUndoToast
          message={undo.message}
          onUndo={() => void runUndo()}
          onDismiss={() => setUndo(null)}
          pending={undoPending}
        />
      )}
    </section>
  );
}
