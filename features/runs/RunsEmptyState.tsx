/**
 * Empty + no-matches states for the Runs dashboard
 * (Slice 4.RUNS-PAGE-1).
 *
 *   - `kind="no-runs"` — the user has zero recorded runs. Honest copy
 *     that points toward the Workflows page (the canonical place to
 *     activate / Run-Now a workflow).
 *   - `kind="no-matches"` — runs exist but the current filters /
 *     search expression yields none. Hints at clearing filters.
 *
 * No fake "create example run" CTA — that affordance doesn't exist
 * and the page guide forbids surfacing it.
 */
interface Props {
  kind: "no-runs" | "no-matches";
}

export function RunsEmptyState({ kind }: Props) {
  const body =
    kind === "no-runs"
      ? "Workflow runs will show up here as soon as a workflow fires."
      : "No runs match the current filters. Try clearing search or status.";
  return (
    <div
      data-testid={`runs-empty-state-${kind}`}
      role="status"
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center"
    >
      <p className="text-sm font-medium text-foreground">
        {kind === "no-runs" ? "No runs yet" : "Nothing here"}
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  );
}
