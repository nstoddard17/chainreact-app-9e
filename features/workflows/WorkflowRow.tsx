"use client";

import Link from "next/link";
import type { WorkflowListItem } from "@/contracts/workflow";
import { formatRelativeTime } from "./relativeTime";
import { formatRunStats } from "./formatRunStats";
import {
  WorkflowActionsMenu,
  type WorkflowFolderActionProps,
} from "./WorkflowActionsMenu";
import { WorkflowProviderChips } from "./WorkflowProviderChips";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";
import { WorkflowStatusToggle } from "./WorkflowStatusToggle";
import { PrivateConnectionBadge } from "./PrivateConnectionBadge";

/**
 * Grid-table row for the workflows list view (Slice 4.WORKFLOWS-PAGE-1; relaid
 * out to the ChainV2Builder design's column grid in WF-5 polish). Columns:
 * Name (+ run-stats subline) · Apps · Folder · Last changed · Status (toggle +
 * badge) · actions. Shares `WORKFLOW_ROW_GRID` with the header so columns line
 * up; the table wrapper handles the bordered card + horizontal scroll.
 *
 * Pure presentational — mutation lifts to the toggle/menu, which call the
 * lifecycle APIs and propagate success via `onChanged`.
 */
export const WORKFLOW_ROW_GRID =
  "grid items-center gap-4 grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,auto)_44px]";

// Same columns with a leading 28px checkbox lane for multi-select mode. Kept as
// a separate literal (not interpolated) so Tailwind's content scanner emits the
// arbitrary grid-cols value.
export const WORKFLOW_ROW_GRID_SELECTABLE =
  "grid items-center gap-4 grid-cols-[28px_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,auto)_44px]";

interface Props {
  workflow: WorkflowListItem;
  onChanged: () => void;
  folderActions?: WorkflowFolderActionProps;
  /** Resolved folder name for the Folder column; null = uncategorized. */
  folderName?: string | null;
  /** Multi-select: render a leading checkbox when true. */
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}

export function WorkflowRow({
  workflow,
  onChanged,
  folderActions,
  folderName,
  selectable = false,
  selected = false,
  onSelectChange,
}: Props) {
  return (
    <li
      data-testid="workflow-row"
      data-workflow-id={workflow.id}
      aria-selected={selectable ? selected : undefined}
      className={
        (selectable ? WORKFLOW_ROW_GRID_SELECTABLE : WORKFLOW_ROW_GRID) +
        " border-t border-border px-4 py-3 transition first:border-t-0 hover:bg-muted/40" +
        (selected ? " bg-primary/5" : "")
      }
    >
      {/* Select */}
      {selectable && (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            data-testid={`workflow-row-select-${workflow.id}`}
            aria-label={`Select ${workflow.name}`}
            checked={selected}
            onChange={(e) => onSelectChange?.(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
        </div>
      )}

      {/* Name */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/workflows/${workflow.id}`}
            data-testid="workflow-row-name"
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {workflow.name}
          </Link>
          {workflow.usesPrivateCredential === true &&
            workflow.viewerCanRunEdit === false && <PrivateConnectionBadge />}
        </div>
        <p data-testid="workflow-row-runs" className="truncate text-xs text-muted-foreground">
          {formatRunStats(workflow.runStats)}
        </p>
      </div>

      {/* Apps */}
      <div className="min-w-0">
        <WorkflowProviderChips providers={workflow.providers} />
      </div>

      {/* Folder */}
      <div className="min-w-0">
        {folderName ? (
          <span
            data-testid="workflow-row-folder"
            className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-foreground"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="shrink-0 text-primary">
              <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h4.5A1.5 1.5 0 0 1 14 6.5v5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
            </svg>
            <span className="truncate">{folderName}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Last changed */}
      <div data-testid="workflow-row-modified" className="truncate text-xs text-muted-foreground">
        {formatRelativeTime(workflow.updatedAt)}
      </div>

      {/* Status (toggle + badge) */}
      <div className="flex items-center gap-2">
        <WorkflowStatusToggle workflow={workflow} onChanged={onChanged} />
        <WorkflowStatusBadge workflow={workflow} />
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <WorkflowActionsMenu workflow={workflow} onChanged={onChanged} {...folderActions} />
      </div>
    </li>
  );
}
