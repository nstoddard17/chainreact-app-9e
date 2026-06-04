"use client";

import type { WorkflowListItem } from "@/contracts/workflow";
import { WorkflowRow, WORKFLOW_ROW_GRID } from "./WorkflowRow";
import type { WorkflowFolderActionProps } from "./WorkflowActionsMenu";

/**
 * Workflows list view as the design's column grid-table (WF-5 polish): one
 * bordered card with an aligned header row + grid rows that share
 * `WORKFLOW_ROW_GRID`. Scrolls horizontally on narrow viewports (the design is
 * a wide, full-bleed table). Keeps the `workflows-list-view` + per-row testids.
 */
interface Props {
  workflows: readonly WorkflowListItem[];
  folderNameById: ReadonlyMap<string, string>;
  onChanged: () => void;
  folderActionsFor: (w: WorkflowListItem) => WorkflowFolderActionProps;
}

const HEADERS = ["Name", "Apps", "Folder", "Last changed", "Status", ""];

export function WorkflowsTable({
  workflows,
  folderNameById,
  onChanged,
  folderActionsFor,
}: Props) {
  return (
    <div
      data-testid="workflows-list-view"
      aria-label="Workflows list"
      className="overflow-x-auto rounded-lg border border-border bg-card"
    >
      <div className="min-w-[880px]">
        <div
          className={
            WORKFLOW_ROW_GRID +
            " border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          }
        >
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
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
