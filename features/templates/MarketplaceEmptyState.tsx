/**
 * Templates empty-state panel (CS-XT-MARKETPLACE-UX-SEARCH). Distinguishes the three meaningfully
 * different "nothing to show" cases so the copy is honest:
 *   - `none-mine`        — the viewer has saved no templates yet.
 *   - `none-marketplace` — this marketplace tab genuinely has no templates.
 *   - `no-match`         — templates exist but the active search/filters matched none; offers a
 *                          one-click reset. Copy deliberately does NOT imply templates or app
 *                          connections are missing.
 */

interface Props {
  kind: "none-mine" | "none-marketplace" | "no-match";
  /** Tunes the no-match copy/button between "search" (Your templates) and "filters" (marketplace). */
  showingMine: boolean;
  onReset: () => void;
}

export function MarketplaceEmptyState({ kind, showingMine, onReset }: Props) {
  return (
    <div
      data-testid="templates-empty"
      data-empty-kind={kind}
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      {kind === "none-mine" && (
        <>
          <div className="text-sm font-semibold text-foreground">You haven&apos;t saved any templates yet</div>
          <div className="max-w-sm text-sm text-muted-foreground">
            Save a copy of a marketplace template, or turn one of your workflows into a template, to build your library.
          </div>
        </>
      )}
      {kind === "none-marketplace" && (
        <>
          <div className="text-sm font-semibold text-foreground">No templates here yet</div>
          <div className="max-w-sm text-sm text-muted-foreground">
            Check back soon, or save one of your own workflows as a template to share it.
          </div>
        </>
      )}
      {kind === "no-match" && (
        <>
          <div className="text-sm font-semibold text-foreground">
            No templates match your {showingMine ? "search" : "filters"}
          </div>
          <div className="max-w-sm text-sm text-muted-foreground">
            Nothing here matches the current {showingMine ? "search" : "search and filters"}. Try adjusting{" "}
            {showingMine ? "it" : "them"}.
          </div>
          <button
            type="button"
            data-testid="templates-empty-reset"
            onClick={onReset}
            className="mt-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-sky-500/60"
          >
            Clear {showingMine ? "search" : "filters"}
          </button>
        </>
      )}
    </div>
  );
}
