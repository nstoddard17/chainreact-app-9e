"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { WorkflowFolder } from "@/contracts/folders";
import { WorkflowsEmptyState } from "../WorkflowsEmptyState";
import {
  canCreateChildAt,
  childrenOf,
  folderDepth,
  folderPath,
  indexById,
  subfolderCount,
  MAX_FOLDER_DEPTH,
} from "./folderTree";

/**
 * Folders tab — depth-3 drill-down navigator (Slice 4.WF-5; nested-tree pass).
 *
 * Renders the subfolders of the current level (`currentParentId`, null = root)
 * as cards plus a breadcrumb to walk back up. A card's name drills INTO that
 * folder (to its subfolders); "Open →" views the folder's automations (parent
 * narrows the Automations list); the ⋯ menu offers Rename / Move… / Delete, and
 * ▲/▼ reorder within the sibling group. "New folder" creates inside the current
 * level and is disabled at the tier cap or when the level is already at the
 * 3-deep nesting limit. All depth/cycle gating is UX-only — the server
 * re-validates every mutation.
 */
interface Props {
  folders: readonly WorkflowFolder[];
  counts: ReadonlyMap<string, number>;
  limit: number;
  currentParentId: string | null;
  onNavigate: (parentId: string | null) => void;
  onOpen: (folderId: string) => void;
  onCreate: () => void;
  onRename: (folder: WorkflowFolder) => void;
  onMove: (folder: WorkflowFolder) => void;
  onDelete: (folder: WorkflowFolder) => void;
  onReorder: (folder: WorkflowFolder, dir: "up" | "down") => void;
}

export function WorkflowFoldersGrid({
  folders,
  counts,
  limit,
  currentParentId,
  onNavigate,
  onOpen,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onReorder,
}: Props) {
  const byId = indexById(folders);
  const children = childrenOf(folders, currentParentId);
  const trail = currentParentId ? folderPath(currentParentId, byId) : [];
  const depthOk = canCreateChildAt(currentParentId, byId);
  const limitReached = folders.length >= limit;
  const newDisabled = limitReached || !depthOk;
  const isRoot = currentParentId === null;

  const newTitle = limitReached
    ? `Folder limit reached (${limit})`
    : !depthOk
      ? `Maximum nesting depth is ${MAX_FOLDER_DEPTH} levels`
      : "New folder";

  return (
    <div data-testid="workflow-folders-grid" className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav
        data-testid="workflow-folder-breadcrumb"
        aria-label="Folder path"
        className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
      >
        <button
          type="button"
          data-testid="workflow-folder-crumb-root"
          onClick={() => onNavigate(null)}
          disabled={isRoot}
          className="rounded px-1.5 py-0.5 font-medium hover:bg-muted hover:text-foreground disabled:cursor-default disabled:font-semibold disabled:text-foreground disabled:hover:bg-transparent"
        >
          All folders
        </button>
        {trail.map((f, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={f.id} className="flex items-center gap-1">
              <span aria-hidden className="opacity-50">
                /
              </span>
              <button
                type="button"
                data-testid={`workflow-folder-crumb-${f.id}`}
                onClick={() => onNavigate(f.id)}
                disabled={last}
                className="max-w-[180px] truncate rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground disabled:cursor-default disabled:font-semibold disabled:text-foreground disabled:hover:bg-transparent"
              >
                {f.name}
              </button>
            </span>
          );
        })}
      </nav>

      {/* "View automations in this folder" for the current (non-root) level */}
      {!isRoot && currentParentId && (
        <button
          type="button"
          data-testid={`workflow-folder-open-current`}
          onClick={() => onOpen(currentParentId)}
          className="self-start text-xs font-medium text-primary hover:underline"
        >
          View {counts.get(currentParentId) ?? 0} automation
          {(counts.get(currentParentId) ?? 0) === 1 ? "" : "s"} in this folder →
        </button>
      )}

      {isRoot && folders.length === 0 && <WorkflowsEmptyState kind="no-folders" />}
      {!isRoot && children.length === 0 && (
        <p
          data-testid="workflow-folder-no-subfolders"
          className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground"
        >
          No subfolders here yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children.map((f, i) => {
          const automations = counts.get(f.id) ?? 0;
          const subs = subfolderCount(folders, f.id);
          const canNest = folderDepth(f.id, byId) < MAX_FOLDER_DEPTH;
          return (
            <div
              key={f.id}
              data-testid="workflow-folder-card"
              data-folder-id={f.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  data-testid={`workflow-folder-drill-${f.id}`}
                  onClick={() => onNavigate(f.id)}
                  className="min-w-0 text-left"
                  title={canNest ? "Open folder" : "Open folder (max depth reached)"}
                >
                  <span className="flex items-center gap-1.5">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="shrink-0 text-muted-foreground">
                      <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h3l1.5 1.5H13A1.5 1.5 0 0 1 14.5 6v5A1.5 1.5 0 0 1 13 12.5H3A1.5 1.5 0 0 1 1.5 11z" />
                    </svg>
                    <span className="block truncate text-sm font-semibold text-foreground hover:underline">
                      {f.name}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {automations} automation{automations === 1 ? "" : "s"}
                    {subs > 0 ? ` · ${subs} subfolder${subs === 1 ? "" : "s"}` : ""}
                  </span>
                </button>
                <FolderCardMenu
                  folder={f}
                  onRename={() => onRename(f)}
                  onMove={() => onMove(f)}
                  onDelete={() => onDelete(f)}
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  data-testid={`workflow-folder-open-${f.id}`}
                  onClick={() => onOpen(f.id)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open →
                </button>
                <div className="flex items-center gap-0.5">
                  <ReorderButton
                    dir="up"
                    folder={f}
                    disabled={i === 0}
                    onReorder={onReorder}
                  />
                  <ReorderButton
                    dir="down"
                    folder={f}
                    disabled={i === children.length - 1}
                    onReorder={onReorder}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          data-testid="workflow-folder-new"
          onClick={onCreate}
          disabled={newDisabled}
          title={newTitle}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center transition hover:border-primary hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-lg leading-none text-primary">＋</span>
          <span className="text-sm font-medium text-foreground">
            {isRoot ? "New folder" : "New subfolder"}
          </span>
          <span className="text-xs text-muted-foreground">
            {limitReached
              ? `Limit reached (${folders.length}/${limit})`
              : !depthOk
                ? `Max depth ${MAX_FOLDER_DEPTH} reached`
                : isRoot
                  ? "Group related automations"
                  : "Nest under this folder"}
          </span>
        </button>
      </div>
    </div>
  );
}

function ReorderButton({
  dir,
  folder,
  disabled,
  onReorder,
}: {
  dir: "up" | "down";
  folder: WorkflowFolder;
  disabled: boolean;
  onReorder: (folder: WorkflowFolder, dir: "up" | "down") => void;
}) {
  return (
    <button
      type="button"
      data-testid={`workflow-folder-${dir}-${folder.id}`}
      aria-label={`Move ${folder.name} ${dir}`}
      disabled={disabled}
      onClick={() => onReorder(folder, dir)}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        {dir === "up" ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}
      </svg>
    </button>
  );
}

function FolderCardMenu({
  folder,
  onRename,
  onMove,
  onDelete,
}: {
  folder: WorkflowFolder;
  onRename: () => void;
  onMove: () => void;
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
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
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
          data-testid={`workflow-folder-move-${folder.id}`}
          onClick={() => {
            setOpen(false);
            onMove();
          }}
          className="block w-full rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
        >
          Move…
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
