/**
 * Empty / no-matches states for the Apps dashboard (Slice 4.APPS-PAGE-1).
 *
 * Two variants:
 *   - `kind="no-apps"`: registry is empty (defensive — every shipped V2
 *     build has at least 20+ providers). No CTA — adding a provider isn't a
 *     user action.
 *   - `kind="no-matches"`: a search / status / category combo excluded
 *     every row. Prompts the user to relax filters; no destructive op.
 */
interface Props {
  kind: "no-apps" | "no-matches";
}

export function AppsEmptyState({ kind }: Props) {
  if (kind === "no-matches") {
    return (
      <div
        data-testid="apps-empty-no-matches"
        role="status"
        className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card p-10 text-center"
      >
        <p className="text-sm font-semibold text-foreground">
          No apps match those filters
        </p>
        <p className="text-xs text-muted-foreground">
          Try clearing the search, status, or category — or pick a different combination.
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid="apps-empty-no-apps"
      role="status"
      className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-card p-10 text-center"
    >
      <p className="text-sm font-semibold text-foreground">No apps available</p>
      <p className="max-w-md text-xs text-muted-foreground">
        The app catalog is empty in this build. Check back soon.
      </p>
    </div>
  );
}
