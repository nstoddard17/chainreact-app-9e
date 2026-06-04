"use client";

import { Button } from "@/components/ui/button";
import type { TrashListing } from "@/lib/api/trash";
import { WorkflowsEmptyState } from "../WorkflowsEmptyState";

/**
 * Trash view (Slice 4.WF-5). Lists soft-deleted workflows + folders still in
 * their 7-day restore window, each with a "purges in N days" hint and a Restore
 * action. The design has no Trash screen of its own, so this follows the design's
 * card/list idiom in V2's Tailwind language. Read-only otherwise.
 */
interface Props {
  loading: boolean;
  error: string | null;
  listing: TrashListing | null;
  pendingId: string | null;
  onRestoreWorkflow: (id: string) => void;
  onRestoreFolder: (id: string) => void;
  onRetry: () => void;
}

function purgesIn(purgeAfter: string | null): string {
  if (!purgeAfter) return "";
  const ms = new Date(purgeAfter).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  const days = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "purges soon";
  return `purges in ${days} day${days === 1 ? "" : "s"}`;
}

export function WorkflowsTrashView({
  loading,
  error,
  listing,
  pendingId,
  onRestoreWorkflow,
  onRestoreFolder,
  onRetry,
}: Props) {
  if (error) {
    return (
      <div
        role="alert"
        data-testid="workflows-trash-error"
        className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
      >
        <span>{error}</span>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  if (loading || !listing) {
    return (
      <p
        role="status"
        data-testid="workflows-trash-loading"
        className="text-xs text-muted-foreground"
      >
        Loading Trash…
      </p>
    );
  }

  const empty = listing.folders.length === 0 && listing.workflows.length === 0;
  if (empty) return <WorkflowsEmptyState kind="empty-trash" />;

  return (
    <div data-testid="workflows-trash-view" className="flex flex-col gap-2">
      {listing.folders.map((f) => (
        <div
          key={f.id}
          data-testid="trash-folder-row"
          data-folder-id={f.id}
          className="flex items-center gap-4 rounded-md border border-border bg-card p-4"
        >
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Folder
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{f.name}</p>
            <p className="text-xs text-muted-foreground">{purgesIn(f.purgeAfter)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendingId === f.id}
            onClick={() => onRestoreFolder(f.id)}
            data-testid={`trash-restore-folder-${f.id}`}
          >
            {pendingId === f.id ? "Restoring…" : "Restore"}
          </Button>
        </div>
      ))}
      {listing.workflows.map((w) => (
        <div
          key={w.id}
          data-testid="trash-workflow-row"
          data-workflow-id={w.id}
          className="flex items-center gap-4 rounded-md border border-border bg-card p-4"
        >
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            Automation
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{w.name}</p>
            <p className="text-xs text-muted-foreground">{purgesIn(w.purgeAfter)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendingId === w.id}
            onClick={() => onRestoreWorkflow(w.id)}
            data-testid={`trash-restore-workflow-${w.id}`}
          >
            {pendingId === w.id ? "Restoring…" : "Restore"}
          </Button>
        </div>
      ))}
    </div>
  );
}
