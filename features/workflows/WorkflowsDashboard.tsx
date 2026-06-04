"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { listWorkflows, WorkflowApiError } from "@/lib/api/workflows";
import {
  createFolder,
  deleteFolder,
  listFolders,
  restoreFolder,
  updateFolder,
  type DeleteFolderResult,
} from "@/lib/api/folders";
import {
  deleteWorkflow,
  listTrash,
  moveWorkflowToFolder,
  restoreWorkflow,
  type TrashListing,
} from "@/lib/api/trash";
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
 * flash. Folder/trash mutations route through lib/api/folders + lib/api/trash;
 * the live workflow list re-fetches after each (non-optimistic). Trash is
 * lazy-loaded only when its tab opens — initial render makes NO folder/trash
 * API calls.
 */
interface Props {
  initialWorkflows: readonly WorkflowListItem[];
  initialFolders?: readonly WorkflowFolder[];
  folderLimit?: number;
}

const UNDO_TIMEOUT_MS = 8000;

interface UndoState {
  message: string;
  run: () => Promise<void>;
}

export function WorkflowsDashboard({
  initialWorkflows,
  initialFolders = [],
  folderLimit = 10,
}: Props) {
  const [workflows, setWorkflows] = useState<readonly WorkflowListItem[]>(initialWorkflows);
  const [folders, setFolders] = useState<readonly WorkflowFolder[]>(initialFolders);
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

  // Folder dialogs.
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkflowFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowFolder | null>(null);

  // Trash (lazy).
  const [trash, setTrash] = useState<TrashListing | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashPendingId, setTrashPendingId] = useState<string | null>(null);

  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setRefreshing(true);
    setError(null);
    try {
      const next = await listWorkflows();
      if (seq !== refreshSeqRef.current) return;
      setWorkflows(next);
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

  const refreshFolders = useCallback(async () => {
    try {
      setFolders(await listFolders());
    } catch {
      /* folder list is non-critical; the next mutation surfaces errors */
    }
  }, []);

  const loadTrash = useCallback(async () => {
    setTrashLoading(true);
    setTrashError(null);
    try {
      setTrash(await listTrash());
    } catch (err) {
      setTrashError(
        err instanceof Error ? err.message : "Couldn't load Trash. Please try again.",
      );
    } finally {
      setTrashLoading(false);
    }
  }, []);

  // Lazy-load Trash the first time its tab opens.
  useEffect(() => {
    if (tab === "trash" && trash === null && !trashLoading && trashError === null) {
      void loadTrash();
    }
  }, [tab, trash, trashLoading, trashError, loadTrash]);

  // Auto-dismiss the undo toast.
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [undo]);

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

  const handleMoveToFolder = useCallback(
    async (workflowId: string, folderId: string | null) => {
      try {
        await moveWorkflowToFolder(workflowId, folderId);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't move the workflow.");
      }
    },
    [refresh],
  );

  const handleMoveToTrash = useCallback(
    async (wf: WorkflowListItem) => {
      try {
        await deleteWorkflow(wf.id);
        await refresh();
        setUndo({
          message: `“${wf.name}” moved to Trash`,
          run: async () => {
            await restoreWorkflow(wf.id);
            await refresh();
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't move the workflow to Trash.");
      }
    },
    [refresh],
  );

  const openFolder = useCallback((folderId: string) => {
    setFilters((f) => ({ ...f, folderIds: [folderId] }));
    setTab("automations");
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string) => {
      await createFolder({ name });
      await refreshFolders();
    },
    [refreshFolders],
  );

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      await updateFolder(id, { name });
      await refreshFolders();
    },
    [refreshFolders],
  );

  const handleDeleteFolder = useCallback(
    async (folder: WorkflowFolder, mode: DeleteFolderResult["mode"]) => {
      await deleteFolder(folder.id, mode);
      await Promise.all([refreshFolders(), refresh()]);
      setUndo({
        message: `“${folder.name}” moved to Trash`,
        run: async () => {
          await restoreFolder(folder.id);
          await Promise.all([refreshFolders(), refresh()]);
        },
      });
    },
    [refreshFolders, refresh],
  );

  const handleRestoreFromTrash = useCallback(
    async (kind: "workflow" | "folder", id: string) => {
      setTrashPendingId(id);
      try {
        if (kind === "workflow") await restoreWorkflow(id);
        else await restoreFolder(id);
        await Promise.all([loadTrash(), refresh(), refreshFolders()]);
      } catch (err) {
        setTrashError(err instanceof Error ? err.message : "Couldn't restore. Please try again.");
      } finally {
        setTrashPendingId(null);
      }
    },
    [loadTrash, refresh, refreshFolders],
  );

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
            <WorkflowsEmptyState kind={folderScopedOnly ? "empty-folder" : "no-matches"} />
          )}
          {hasAny && hasFiltered && view === "list" && (
            <WorkflowsTable
              workflows={filtered}
              folderNameById={folderNameById}
              onChanged={refresh}
              folderActionsFor={makeFolderActions}
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
          onOpen={openFolder}
          onCreate={() => setCreateOpen(true)}
          onRename={(f) => setRenameTarget(f)}
          onDelete={(f) => setDeleteTarget(f)}
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

