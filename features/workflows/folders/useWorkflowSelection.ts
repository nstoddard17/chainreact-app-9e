"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkflowListItem } from "@/contracts/workflow";
import {
  deleteWorkflow,
  moveWorkflowToFolder,
  restoreWorkflow,
} from "@/lib/api/trash";

/**
 * Multi-select + bulk-action state for the workflows list (Slice
 * 4.WORKFLOW-FOLDERS-6C). Extracted from WorkflowsDashboard to keep the
 * orchestrator lean and the selection logic independently testable.
 *
 * There is no bulk backend endpoint — `bulkMove` / `bulkTrash` fan the existing
 * single-item APIs (`moveWorkflowToFolder` / `deleteWorkflow` / `restoreWorkflow`)
 * over the selection. Selection is confined to the visible list: it drops when
 * the list view is left (`active` false) and prunes whenever a workflow filters
 * out of view, so a bulk action can never touch a hidden row.
 */
interface Options {
  /** Currently visible (filtered + sorted) workflows. */
  filtered: readonly WorkflowListItem[];
  /** True only on the Automations tab in list view. */
  active: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onUndo: (undo: { message: string; run: () => Promise<void> }) => void;
}

export interface WorkflowSelection {
  selectedIds: ReadonlySet<string>;
  bulkPending: boolean;
  toggleSelect: (id: string, checked: boolean) => void;
  toggleSelectAll: (checked: boolean) => void;
  clear: () => void;
  bulkMove: (folderId: string | null) => Promise<void>;
  bulkTrash: () => Promise<void>;
}

export function useWorkflowSelection({
  filtered,
  active,
  refresh,
  onError,
  onUndo,
}: Options): WorkflowSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);

  // Selection only exists in the Automations list view; drop it when leaving.
  useEffect(() => {
    if (!active) setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [active]);

  // Prune ids that filtered out of view (stable ref when nothing changed).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((w) => w.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(filtered.map((w) => w.id)) : new Set());
    },
    [filtered],
  );

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const bulkMove = useCallback(
    async (folderId: string | null) => {
      const ids = [...selectedIds];
      if (ids.length === 0) return;
      setBulkPending(true);
      try {
        await Promise.all(ids.map((id) => moveWorkflowToFolder(id, folderId)));
        setSelectedIds(new Set());
        await refresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Couldn't move the workflows.");
      } finally {
        setBulkPending(false);
      }
    },
    [selectedIds, refresh, onError],
  );

  const bulkTrash = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkPending(true);
    try {
      await Promise.all(ids.map((id) => deleteWorkflow(id)));
      setSelectedIds(new Set());
      await refresh();
      onUndo({
        message: `${ids.length} workflow${ids.length === 1 ? "" : "s"} moved to Trash`,
        run: async () => {
          await Promise.all(ids.map((id) => restoreWorkflow(id)));
          await refresh();
        },
      });
    } catch (err) {
      onError(
        err instanceof Error ? err.message : "Couldn't move the workflows to Trash.",
      );
    } finally {
      setBulkPending(false);
    }
  }, [selectedIds, refresh, onError, onUndo]);

  return {
    selectedIds,
    bulkPending,
    toggleSelect,
    toggleSelectAll,
    clear,
    bulkMove,
    bulkTrash,
  };
}
