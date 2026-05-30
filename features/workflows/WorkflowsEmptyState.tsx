import { CreateWorkflowButton } from "./CreateWorkflowButton";

/**
 * Empty state for the workflows dashboard (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Two variants:
 *   - `kind="no-workflows"`: the user has none yet → friendly CTA reusing
 *     the existing `CreateWorkflowButton` (real create flow → builder).
 *   - `kind="no-matches"`: a search/filter combination matched nothing →
 *     prompt to relax the filters (no destructive op).
 */
interface Props {
  kind: "no-workflows" | "no-matches";
}

export function WorkflowsEmptyState({ kind }: Props) {
  if (kind === "no-matches") {
    return (
      <div
        data-testid="workflows-empty-no-matches"
        role="status"
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card p-10 text-center"
      >
        <p className="text-sm font-semibold text-foreground">
          Nothing matches those filters
        </p>
        <p className="text-xs text-muted-foreground">
          Try clearing the search or status filter — or create a new workflow.
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid="workflows-empty-no-workflows"
      role="status"
      className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-card p-10 text-center"
    >
      <p className="text-sm font-semibold text-foreground">
        No workflows yet
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        Workflows automate things across your connected apps. Create your first
        one to get started — the builder will guide you through picking a
        trigger and adding actions.
      </p>
      <CreateWorkflowButton />
    </div>
  );
}
