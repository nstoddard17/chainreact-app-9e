"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/**
 * Bulk-action bar for multi-selected workflows (Slice 4.WORKFLOW-FOLDERS-6C).
 *
 * Appears above the list when ≥1 workflow is checked. Offers the two bulk
 * operations the backend already supports per-workflow — Move to folder (incl.
 * Uncategorized) and Move to Trash — by fanning the existing single-item APIs
 * over the selection in the parent. No bulk endpoint is invented. The folder
 * picker is hierarchy-indented to match the nested-tree dashboard.
 */
export interface BulkFolderOption {
  id: string;
  name: string;
  /** 1-based tree depth for indentation. */
  depth: number;
}

interface Props {
  count: number;
  folders: readonly BulkFolderOption[];
  pending: boolean;
  /** `label` is the human destination name ("Uncategorized" or the folder name) for the confirmation toast. */
  onMove: (folderId: string | null, label: string) => void;
  onTrash: () => void;
  onClear: () => void;
}

export function WorkflowsBulkActions({
  count,
  folders,
  pending,
  onMove,
  onTrash,
  onClear,
}: Props) {
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      data-testid="workflows-bulk-bar"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5"
    >
      <span data-testid="workflows-bulk-count" className="text-sm font-medium text-foreground">
        <code className="font-mono">{count}</code> selected
      </span>

      <div className="ml-auto flex items-center gap-2">
        <Popover open={moveOpen} onOpenChange={setMoveOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              data-testid="workflows-bulk-move-trigger"
            >
              Move to folder
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Move {count} to…
            </p>
            <div className="max-h-60 overflow-y-auto">
              <button
                type="button"
                data-testid="workflows-bulk-move-uncategorized"
                onClick={() => {
                  setMoveOpen(false);
                  onMove(null, "Uncategorized");
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              >
                Uncategorized
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`workflows-bulk-move-${f.id}`}
                  onClick={() => {
                    setMoveOpen(false);
                    onMove(f.id, f.name);
                  }}
                  style={{ paddingLeft: `${0.5 + (f.depth - 1) * 0.85}rem` }}
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                >
                  {f.name}
                </button>
              ))}
              {folders.length === 0 && (
                <p className="px-2 py-1 text-[11px] text-muted-foreground">No folders yet.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={onTrash}
          data-testid="workflows-bulk-trash"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          Move to Trash
        </Button>

        <button
          type="button"
          data-testid="workflows-bulk-clear"
          onClick={onClear}
          className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
