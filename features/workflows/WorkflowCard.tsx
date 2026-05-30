"use client";

import Link from "next/link";
import type { WorkflowListItem } from "@/contracts/workflow";
import { formatRelativeTime } from "./relativeTime";
import { formatRunStats } from "./formatRunStats";
import { WorkflowActionsMenu } from "./WorkflowActionsMenu";
import { WorkflowProviderChips } from "./WorkflowProviderChips";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";
import { WorkflowStatusToggle } from "./WorkflowStatusToggle";

/**
 * Grid-view card for the workflows dashboard (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Renders one workflow as a tall card: name (link → builder), status badge,
 * provider chips, run-stats sub-line, last-changed footer, non-optimistic
 * status toggle, actions menu. Same data shape + same mutation handlers as
 * `WorkflowRow` (just laid out vertically).
 */
interface Props {
  workflow: WorkflowListItem;
  onChanged: () => void;
}

export function WorkflowCard({ workflow, onChanged }: Props) {
  return (
    <li
      data-testid="workflow-card"
      data-workflow-id={workflow.id}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 transition hover:border-foreground/20"
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/workflows/${workflow.id}`}
          data-testid="workflow-card-name"
          className="line-clamp-2 text-sm font-semibold text-foreground hover:underline"
        >
          {workflow.name}
        </Link>
        <WorkflowActionsMenu workflow={workflow} onChanged={onChanged} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <WorkflowStatusBadge workflow={workflow} />
        <WorkflowStatusToggle workflow={workflow} onChanged={onChanged} />
      </div>
      <WorkflowProviderChips providers={workflow.providers} />
      <p
        data-testid="workflow-card-runs"
        className="text-xs text-muted-foreground"
      >
        {formatRunStats(workflow.runStats)}
      </p>
      <p
        data-testid="workflow-card-modified"
        className="mt-auto text-[11px] text-muted-foreground"
      >
        Updated {formatRelativeTime(workflow.updatedAt)}
      </p>
    </li>
  );
}
