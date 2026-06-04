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

/**
 * List-view row for the workflows dashboard (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Renders one workflow as a horizontal row: name (link → builder), run-stats
 * sub-line, provider chips, last-changed relative time, status badge,
 * non-optimistic status toggle, actions menu.
 *
 * Pure presentational — all mutation lifts to the toggle/menu, which call the
 * existing lifecycle APIs and propagate success via `onChanged` so the parent
 * (`WorkflowsDashboard`) re-fetches the enriched list.
 */
interface Props {
  workflow: WorkflowListItem;
  onChanged: () => void;
  folderActions?: WorkflowFolderActionProps;
}

export function WorkflowRow({ workflow, onChanged, folderActions }: Props) {
  return (
    <li data-testid="workflow-row" data-workflow-id={workflow.id}>
      <div className="flex items-center gap-4 rounded-md border border-border bg-card p-4 transition hover:border-foreground/20">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/workflows/${workflow.id}`}
            data-testid="workflow-row-name"
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {workflow.name}
          </Link>
          <p
            data-testid="workflow-row-runs"
            className="text-xs text-muted-foreground"
          >
            {formatRunStats(workflow.runStats)}
          </p>
        </div>
        <div className="hidden md:block">
          <WorkflowProviderChips providers={workflow.providers} />
        </div>
        <div
          data-testid="workflow-row-modified"
          className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground sm:block"
        >
          {formatRelativeTime(workflow.updatedAt)}
        </div>
        <div className="shrink-0">
          <WorkflowStatusBadge workflow={workflow} />
        </div>
        <div className="shrink-0">
          <WorkflowStatusToggle workflow={workflow} onChanged={onChanged} />
        </div>
        <div className="shrink-0">
          <WorkflowActionsMenu
            workflow={workflow}
            onChanged={onChanged}
            {...folderActions}
          />
        </div>
      </div>
    </li>
  );
}
