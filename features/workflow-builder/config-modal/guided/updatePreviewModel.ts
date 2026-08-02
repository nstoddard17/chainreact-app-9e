import type { VariableSource } from "../../hooks/useUpstreamVariables";
import {
  buildRowPreview,
  type PreviewCellState,
  type PreviewProvenance,
} from "./rowPreviewModel";
import type { UpdateCell } from "../fields/spreadsheet/_updateModel";

/**
 * What an UPDATE preview is allowed to claim
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The append preview ("The row we'd add") could show a whole row, because
 * every cell of a new row is authored in the builder. An update preview
 * cannot: most of the row already exists in the customer's spreadsheet, and
 * the builder has never read it. There is no resolver that fetches an
 * arbitrary worksheet row, and inventing one for the preview would be worse
 * than showing nothing — a realistic-looking "before" reads as confirmation
 * that the right row was found.
 *
 * So this model shows exactly three things, all of which the builder
 * genuinely knows:
 *
 *   1. the columns that WILL CHANGE, with their values resolved from real
 *      captured run data (never invented samples);
 *   2. the columns that will be CLEARED;
 *   3. a COUNT of columns left unchanged.
 *
 * It never shows the target row's current contents, the resulting merged
 * row, or a value the system has not actually produced.
 *
 * Value resolution delegates to `buildRowPreview`, so a value shown here and
 * a value shown in the append preview or the variable picker can never
 * disagree about what "real" means.
 */

export type UpdateEntryKind = "set" | "clear";

export interface UpdatePreviewEntry {
  readonly column: string;
  readonly kind: UpdateEntryKind;
  /** Provenance of the value. Always `"literal"` for a clear. */
  readonly state: PreviewCellState;
  /** What to render. Empty for a clear. */
  readonly display: string;
}

export interface UpdatePreview {
  readonly entries: readonly UpdatePreviewEntry[];
  /** Detected columns the run will leave exactly as they are. */
  readonly unchangedCount: number;
  readonly provenance: PreviewProvenance;
  /** Honest one-line caption stating where the values came from. */
  readonly caption: string;
  readonly brokenReferences: readonly string[];
}

/**
 * Caption when nothing needs resolving because every change is a clear.
 * `literal-only`'s usual caption ("The row as you have written it") would be
 * wrong here — no row is being written, and nothing was typed.
 */
const CLEARS_ONLY_CAPTION = "The columns you have chosen to empty";

export interface BuildUpdatePreviewInput {
  readonly cells: readonly UpdateCell[];
  readonly sources: readonly VariableSource[];
  readonly latestValuesBySource: Readonly<Record<string, unknown>> | undefined;
}

export function buildUpdatePreview(
  input: BuildUpdatePreviewInput,
): UpdatePreview {
  const { cells, sources, latestValuesBySource } = input;

  const setCells = cells.filter((c) => c.state === "value");
  const clearCells = cells.filter((c) => c.state === "blank");
  const unchangedCount = cells.filter((c) => c.state === "unchanged").length;

  // Resolve only the authored values, through the shared resolver.
  const resolved = buildRowPreview({
    columns: setCells.map((c) => c.column),
    cells: setCells.map((c) => c.value),
    sources,
    latestValuesBySource,
  });

  const entries: UpdatePreviewEntry[] = [
    ...resolved.cells.map((cell) => ({
      column: cell.columnName,
      kind: "set" as const,
      state: cell.state,
      display: cell.display,
    })),
    ...clearCells.map((cell) => ({
      column: cell.column,
      kind: "clear" as const,
      state: "literal" as const,
      display: "",
    })),
  ];

  return {
    entries,
    unchangedCount,
    provenance: resolved.provenance,
    caption:
      setCells.length === 0 && clearCells.length > 0
        ? CLEARS_ONLY_CAPTION
        : resolved.caption,
    brokenReferences: resolved.brokenReferences,
  };
}
