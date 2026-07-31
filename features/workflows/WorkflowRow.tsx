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
/**
 * RESPONSIVE-DATA-SURFACES-5 — the column grid applies from `lg` UP only.
 *
 * It used to apply at every width, inside a `min-w-[880px]` scroller, which meant
 * a phone user had to drag an 880px table sideways to reach the actions column.
 * Below `lg` the row is a stacked card instead (see `WorkflowRow`).
 *
 * `lg` (1024px) is not arbitrary: the table needs 880px, and the content column
 * is the viewport minus the 64px rail and the container's fluid gutter, so 880px
 * first fits at roughly a 995px viewport. `lg` is the first breakpoint clear of
 * that, with ~29px to spare at 1024.
 *
 * The identity track carries a 200px FLOOR rather than `minmax(0,…)`: with six
 * provider chips the Apps column's content was winning the `fr` distribution and
 * squeezing the workflow name — the thing the row exists to show — below its
 * declared legibility floor even inside the scroller.
 */
export const WORKFLOW_ROW_GRID =
  "lg:grid lg:items-center lg:gap-4 lg:grid-cols-[minmax(200px,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,auto)_44px]";

// Same columns with a leading 28px checkbox lane for multi-select mode. Kept as
// a separate literal (not interpolated) so Tailwind's content scanner emits the
// arbitrary grid-cols value.
export const WORKFLOW_ROW_GRID_SELECTABLE =
  "lg:grid lg:items-center lg:gap-4 lg:grid-cols-[28px_minmax(200px,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,auto)_44px]";

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
        "flex min-w-0 flex-col gap-2 " +
        (selectable ? WORKFLOW_ROW_GRID_SELECTABLE : WORKFLOW_ROW_GRID) +
        " border-t border-border px-4 py-3 transition first:border-t-0 hover:bg-muted/40" +
        (selected ? " bg-primary/5" : "")
      }
    >
      {/*
        Below `lg` this row is a STACKED CARD; at `lg` and up the two wrappers
        become `display: contents` and their children rejoin the parent as grid
        tracks, so the aligned table is byte-for-byte the layout it always was.

        One DOM and one set of controls, deliberately — a hidden desktop table
        beside a mobile card list would give every workflow two checkboxes and two
        action menus, and selection state, permissions and menu contents could
        drift apart between them. That is a correctness risk on a surface that
        mutates workflows, not a styling preference.
      */}
      <div className="flex min-w-0 items-start gap-3 lg:contents">
        {/* Select */}
        {selectable && (
          <div className="flex shrink-0 items-center justify-center pt-0.5 lg:pt-0">
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
        <div
          className="flex min-w-0 flex-1 flex-col gap-0.5"
          data-legible-min="180"
          data-legible-what="workflow identity"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href={`/workflows/${workflow.id}`}
              data-testid="workflow-row-name"
              // Wraps in card mode where there is a whole line for it; ellipsis in
              // the table, where the column is fixed and alignment is the point.
              className="min-w-0 break-words text-sm font-semibold text-foreground hover:underline lg:truncate"
            >
              {workflow.name}
            </Link>
            {workflow.usesPrivateCredential === true &&
              workflow.viewerCanRunEdit === false && <PrivateConnectionBadge />}
          </div>
          <p
            data-testid="workflow-row-runs"
            className="min-w-0 break-words text-xs text-muted-foreground lg:truncate"
          >
            {formatRunStats(workflow.runStats)}
          </p>
        </div>
      </div>

      {/* Secondary group: a wrapping row in card mode, grid tracks 3–6 at `lg`. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:contents">
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
      <div
        data-testid="workflow-row-modified"
        className="min-w-0 text-xs text-muted-foreground lg:truncate"
      >
        {/* The column heading is hidden in card mode, so the value says what it is. */}
        <span className="lg:hidden">Changed </span>
        {formatRelativeTime(workflow.updatedAt)}
      </div>

      {/* Status (toggle + badge) */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <WorkflowStatusToggle workflow={workflow} onChanged={onChanged} />
        <WorkflowStatusBadge workflow={workflow} />
      </div>

      {/* Actions */}
      {/* No legibility floor here on purpose. This region is `shrink-0` and
          wraps its 32px trigger, so measuring it would measure shrink-wrapped
          content — the calibration mistake the floor rule exists to avoid. The
          trigger's reachability is covered by row containment plus the rendered
          "same actions in both presentations" test. */}
      <div className="flex shrink-0 justify-start lg:justify-end">
        <WorkflowActionsMenu workflow={workflow} onChanged={onChanged} {...folderActions} />
      </div>
      </div>
    </li>
  );
}
