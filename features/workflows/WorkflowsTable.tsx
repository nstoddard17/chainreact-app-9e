"use client";

import { useEffect, useRef } from "react";
import type { WorkflowListItem } from "@/contracts/workflow";
import {
  WorkflowRow,
  WORKFLOW_ROW_GRID,
  WORKFLOW_ROW_GRID_SELECTABLE,
} from "./WorkflowRow";
import type { WorkflowFolderActionProps } from "./WorkflowActionsMenu";

/**
 * Workflows list view as the design's column grid-table (WF-5 polish): one
 * bordered card with an aligned header row + grid rows that share
 * `WORKFLOW_ROW_GRID`. Scrolls horizontally on narrow viewports (the design is
 * a wide, full-bleed table). Keeps the `workflows-list-view` + per-row testids.
 *
 * When selection handlers are supplied (multi-select pass) a leading checkbox
 * lane is added: a per-row checkbox plus a header select-all (with indeterminate
 * state) so workflows can be bulk-moved or bulk-trashed.
 */
interface Props {
  workflows: readonly WorkflowListItem[];
  folderNameById: ReadonlyMap<string, string>;
  onChanged: () => void;
  folderActionsFor: (w: WorkflowListItem) => WorkflowFolderActionProps;
  /** Multi-select wiring. When omitted the table renders without checkboxes. */
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

const HEADERS = ["Name", "Apps", "Folder", "Last changed", "Status", ""];

export function WorkflowsTable({
  workflows,
  folderNameById,
  onChanged,
  folderActionsFor,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const selectable = onToggleSelect !== undefined;
  const selectedCount = selectable
    ? workflows.reduce((n, w) => n + (selectedIds?.has(w.id) ? 1 : 0), 0)
    : 0;
  const allSelected = selectable && workflows.length > 0 && selectedCount === workflows.length;
  const someSelected = selectable && selectedCount > 0 && !allSelected;

  return (
    <div
      data-testid="workflows-list-view"
      aria-label="Workflows list"
      data-no-pan-below="1024"
      // The scroller and the 880px floor apply from `lg` UP. Below it the rows are
      // stacked cards that fit the column they are given, so there is nothing to
      // scroll — and a phone user is never asked to drag the table sideways to
      // reach an action, which is what this declaration forbids.
      className="rounded-lg border border-border bg-card lg:overflow-x-auto"
    >
      <div className="lg:min-w-[880px]">
        <div
          data-testid="workflows-list-head"
          className={
            "hidden " +
            (selectable ? WORKFLOW_ROW_GRID_SELECTABLE : WORKFLOW_ROW_GRID) +
            " border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          }
        >
          {selectable && (
            <div className="flex items-center justify-center">
              <SelectAllCheckbox
                checked={allSelected}
                indeterminate={someSelected}
                disabled={workflows.length === 0}
                onChange={(c) => onToggleSelectAll?.(c)}
              />
            </div>
          )}
          {HEADERS.map((h, i) => (
            <div key={i} className={i === HEADERS.length - 1 ? "text-right" : "truncate"}>
              {h}
            </div>
          ))}
        </div>
        <ul className="flex flex-col">
          {workflows.map((w) => (
            <WorkflowRow
              key={w.id}
              workflow={w}
              onChanged={onChanged}
              folderName={w.folderId ? (folderNameById.get(w.folderId) ?? null) : null}
              folderActions={folderActionsFor(w)}
              selectable={selectable}
              selected={selectedIds?.has(w.id) ?? false}
              onSelectChange={(checked) => onToggleSelect?.(w.id, checked)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      data-testid="workflows-select-all"
      aria-label="Select all workflows"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
