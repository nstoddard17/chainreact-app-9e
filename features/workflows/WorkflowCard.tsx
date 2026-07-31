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
  folderActions?: WorkflowFolderActionProps;
}

export function WorkflowCard({ workflow, onChanged, folderActions }: Props) {
  return (
    <li
      data-testid="workflow-card"
      data-workflow-id={workflow.id}
      className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-4 transition hover:border-foreground/20"
    >
      {/*
        RESPONSIVE-PAGES-2 — the title row had the same defect the Templates card
        did: `justify-between` with no `min-w-0` on the name and no `shrink-0` on
        the actions menu, so a long name pushed the ⋯ trigger toward (and past)
        the card edge. The name keeps its existing `line-clamp-2` truncation —
        that was already a deliberate choice and is left alone — plus `break-words`
        so a long UNBROKEN name clamps instead of widening the card.
      */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Link
          href={`/workflows/${workflow.id}`}
          data-testid="workflow-card-name"
          className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold text-foreground hover:underline"
        >
          {workflow.name}
        </Link>
        <span className="shrink-0">
          <WorkflowActionsMenu
            workflow={workflow}
            onChanged={onChanged}
            {...folderActions}
          />
        </span>
      </div>
      {/* Badge + toggle wrap rather than squash — both must stay readable. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <WorkflowStatusBadge workflow={workflow} />
        <WorkflowStatusToggle workflow={workflow} onChanged={onChanged} />
      </div>
      {workflow.usesPrivateCredential === true &&
        workflow.viewerCanRunEdit === false && (
          <PrivateConnectionBadge className="self-start" />
        )}
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
