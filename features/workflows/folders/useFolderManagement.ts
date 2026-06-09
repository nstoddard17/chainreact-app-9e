"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createFolder,
  deleteFolder,
  listFolders,
  reorderFolders,
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
import type { WorkflowFolder } from "@/contracts/folders";
import type { WorkflowListItem } from "@/contracts/workflow";
import { childrenOf } from "./folderTree";

/**
 * Folder / Trash / move-to-folder orchestration for the workflows dashboard.
 *
 * Owns the folder-concern STATE (the live folder list, the folder-tab nesting
 * cursor, the create/rename/move/delete dialog targets, and the lazily-loaded
 * Trash listing) plus the mutation HANDLERS that the dashboard previously held
 * inline: folder CRUD + reorder, moving a workflow into a folder / to Trash, and
 * restore-from-Trash. Extracted from WorkflowsDashboard so the orchestrator stays
 * focused on layout/tabs; mirrors the sibling `useWorkflowSelection` contract —
 * it RECEIVES `refresh` (the workflow-list reload), `onError`, and `onUndo`
 * rather than owning them, because the error banner and the undo toast are shared
 * surfaces (bulk selection feeds the same undo channel). Behavior is identical to
 * the pre-extraction dashboard — this is a mechanical move, not a redesign.
 *
 * Tests: tests/unit/features/workflows/WorkflowsDashboard.folders-trash.test.tsx
 * exercises every handler here end-to-end through the real dashboard.
 */

/** A reversible action surfaced in the shared undo toast (owned by the dashboard). */
export interface UndoState {
  message: string;
  run: () => Promise<void>;
}

interface UseFolderManagementInput {
  initialFolders: readonly WorkflowFolder[];
  /** Reload the live workflow list (folder moves / trash affect it). */
  refresh: () => Promise<void>;
  /** True while the Trash tab is the active view — gates the lazy load. */
  trashActive: boolean;
  /** Surface a recoverable error in the dashboard's shared error banner. */
  onError: (message: string) => void;
  /** Enqueue a reversible action into the dashboard's shared undo toast. */
  onUndo: (undo: UndoState) => void;
}

export interface FolderManagement {
  folders: readonly WorkflowFolder[];
  // Folder-tab nesting cursor (null = root / top level).
  folderNav: string | null;
  setFolderNav: (next: string | null) => void;
  // Dialog targets.
  createOpen: boolean;
  setCreateOpen: (open: boolean) => void;
  renameTarget: WorkflowFolder | null;
  setRenameTarget: (folder: WorkflowFolder | null) => void;
  moveTarget: WorkflowFolder | null;
  setMoveTarget: (folder: WorkflowFolder | null) => void;
  deleteTarget: WorkflowFolder | null;
  setDeleteTarget: (folder: WorkflowFolder | null) => void;
  // Folder mutation handlers.
  handleCreateFolder: (name: string) => Promise<void>;
  handleRenameFolder: (id: string, name: string) => Promise<void>;
  handleMoveFolder: (
    folder: WorkflowFolder,
    parentFolderId: string | null,
  ) => Promise<void>;
  handleReorderFolder: (
    folder: WorkflowFolder,
    dir: "up" | "down",
  ) => Promise<void>;
  handleDeleteFolder: (
    folder: WorkflowFolder,
    mode: DeleteFolderResult["mode"],
  ) => Promise<void>;
  // Workflow → folder / Trash handlers.
  handleMoveToFolder: (
    workflowId: string,
    folderId: string | null,
  ) => Promise<void>;
  handleMoveToTrash: (wf: WorkflowListItem) => Promise<void>;
  // Trash (lazy).
  trash: TrashListing | null;
  trashLoading: boolean;
  trashError: string | null;
  trashPendingId: string | null;
  loadTrash: () => Promise<void>;
  handleRestoreFromTrash: (
    kind: "workflow" | "folder",
    id: string,
  ) => Promise<void>;
}

export function useFolderManagement({
  initialFolders,
  refresh,
  trashActive,
  onError,
  onUndo,
}: UseFolderManagementInput): FolderManagement {
  const [folders, setFolders] = useState<readonly WorkflowFolder[]>(initialFolders);

  // Folder tab nesting navigation (null = root / top level).
  const [folderNav, setFolderNav] = useState<string | null>(null);

  // Folder dialogs.
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<WorkflowFolder | null>(null);
  const [moveTarget, setMoveTarget] = useState<WorkflowFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowFolder | null>(null);

  // Trash (lazy).
  const [trash, setTrash] = useState<TrashListing | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [trashPendingId, setTrashPendingId] = useState<string | null>(null);

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
    if (trashActive && trash === null && !trashLoading && trashError === null) {
      void loadTrash();
    }
  }, [trashActive, trash, trashLoading, trashError, loadTrash]);

  // If the browsed folder disappears (deleted / moved to Trash / restored away),
  // fall back to the top level rather than stranding the navigator on a ghost.
  useEffect(() => {
    if (folderNav && !folders.some((f) => f.id === folderNav)) {
      setFolderNav(null);
    }
  }, [folders, folderNav]);

  const handleMoveToFolder = useCallback(
    async (workflowId: string, folderId: string | null) => {
      try {
        await moveWorkflowToFolder(workflowId, folderId);
        await refresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't move the workflow.");
      }
    },
    [refresh, onError],
  );

  const handleMoveToTrash = useCallback(
    async (wf: WorkflowListItem) => {
      try {
        await deleteWorkflow(wf.id);
        await refresh();
        onUndo({
          message: `“${wf.name}” moved to Trash`,
          run: async () => {
            await restoreWorkflow(wf.id);
            await refresh();
          },
        });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't move the workflow to Trash.");
      }
    },
    [refresh, onError, onUndo],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      // Create inside the folder currently being browsed (null → top level).
      // Omit parentFolderId at root so the request shape stays minimal.
      await createFolder(folderNav ? { name, parentFolderId: folderNav } : { name });
      await refreshFolders();
    },
    [refreshFolders, folderNav],
  );

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      await updateFolder(id, { name });
      await refreshFolders();
    },
    [refreshFolders],
  );

  const handleMoveFolder = useCallback(
    async (folder: WorkflowFolder, parentFolderId: string | null) => {
      // Reparent. The server re-validates cycle + depth (FOLDER_CYCLE /
      // FOLDER_TOO_DEEP); the dialog surfaces those errors.
      await updateFolder(folder.id, { parentFolderId });
      await refreshFolders();
    },
    [refreshFolders],
  );

  const handleReorderFolder = useCallback(
    async (folder: WorkflowFolder, dir: "up" | "down") => {
      const parentId = folder.parentFolderId ?? null;
      const siblings = childrenOf(folders, parentId);
      const idx = siblings.findIndex((f) => f.id === folder.id);
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swap < 0 || swap >= siblings.length) return;
      const ordered = siblings.map((f) => f.id);
      [ordered[idx], ordered[swap]] = [ordered[swap]!, ordered[idx]!];
      try {
        await reorderFolders({ parentFolderId: parentId, orderedIds: ordered });
        await refreshFolders();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't reorder folders.");
      }
    },
    [folders, refreshFolders, onError],
  );

  const handleDeleteFolder = useCallback(
    async (folder: WorkflowFolder, mode: DeleteFolderResult["mode"]) => {
      await deleteFolder(folder.id, mode);
      await Promise.all([refreshFolders(), refresh()]);
      onUndo({
        message: `“${folder.name}” moved to Trash`,
        run: async () => {
          await restoreFolder(folder.id);
          await Promise.all([refreshFolders(), refresh()]);
        },
      });
    },
    [refreshFolders, refresh, onUndo],
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

  return {
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
  };
}
