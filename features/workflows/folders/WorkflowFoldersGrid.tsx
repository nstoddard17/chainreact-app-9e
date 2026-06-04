"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkflowFolder } from "@/contracts/folders";
import { WorkflowsEmptyState } from "../WorkflowsEmptyState";

/**
 * Folders grid for the Folders tab (Slice 4.WF-5). Cards show name + workflow
 * count + Open; a per-card menu offers Rename / Delete. A trailing "New folder"
 * card creates one (disabled with limit messaging when the tier cap is hit).
 * Opening a folder narrows the Automations list (handled by the parent).
 */
interface Props {
  folders: readonly WorkflowFolder[];
  counts: ReadonlyMap<string, number>;
  limit: number;
  onOpen: (folderId: string) => void;
  onCreate: () => void;
  onRename: (folder: WorkflowFolder) => void;
  onDelete: (folder: WorkflowFolder) => void;
}

export function WorkflowFoldersGrid({
  folders,
  counts,
  limit,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const limitReached = folders.length >= limit;

  return (
    <div data-testid="workflow-folders-grid" className="flex flex-col gap-4">
      {folders.length === 0 && <WorkflowsEmptyState kind="no-folders" />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {folders.map((f) => (
          <div
            key={f.id}
            data-testid="workflow-folder-card"
            data-folder-id={f.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20"
          >
            <div className="flex items-start justify-between">
              <button
                type="button"
                data-testid={`workflow-folder-open-${f.id}`}
                onClick={() => onOpen(f.id)}
                className="min-w-0 text-left"
              >
                <span className="block truncate text-sm font-semibold text-foreground hover:underline">
                  {f.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {counts.get(f.id) ?? 0} automation
                  {(counts.get(f.id) ?? 0) === 1 ? "" : "s"}
                </span>
              </button>
              <FolderCardMenu
                folder={f}
                onRename={() => onRename(f)}
                onDelete={() => onDelete(f)}
              />
            </div>
            <button
              type="button"
              onClick={() => onOpen(f.id)}
              className="self-start text-xs font-medium text-primary hover:underline"
            >
              Open →
            </button>
          </div>
        ))}

        <button
          type="button"
          data-testid="workflow-folder-new"
          onClick={onCreate}
          disabled={limitReached}
          title={limitReached ? `Folder limit reached (${limit})` : "New folder"}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center transition hover:border-primary hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-lg leading-none text-primary">＋</span>
          <span className="text-sm font-medium text-foreground">New folder</span>
          <span className="text-xs text-muted-foreground">
            {limitReached
              ? `Limit reached (${folders.length}/${limit})`
              : "Group related automations"}
          </span>
        </button>
      </div>
    </div>
  );
}

function FolderCardMenu({
  folder,
  onRename,
  onDelete,
}: {
  folder: WorkflowFolder;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Folder actions for ${folder.name}`}
          data-testid={`workflow-folder-menu-${folder.id}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1">
        <button
          type="button"
          data-testid={`workflow-folder-rename-${folder.id}`}
          onClick={() => {
            setOpen(false);
            onRename();
          }}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
        >
          Rename
        </button>
        <button
          type="button"
          data-testid={`workflow-folder-delete-${folder.id}`}
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
        >
          Delete…
        </button>
      </PopoverContent>
    </Popover>
  );
}
