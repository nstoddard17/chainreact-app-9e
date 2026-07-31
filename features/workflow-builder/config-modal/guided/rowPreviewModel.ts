import { formatLatestValuePreview } from "@/core/workflows/formatLatestValuePreview";
import { resolveValueAtPath } from "@/core/workflows/resolveValueAtPath";
import { parseReferences } from "@/core/workflows/variables/variableReferences";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * What the row preview is allowed to claim
 * (SHEETS-GUIDED-CONFIG-1, approved decision D6).
 *
 * A preview that shows realistic-looking values the system did not
 * actually produce is worse than no preview: it reads as confirmation.
 * So this module resolves ONLY from data ChainReact already has — the
 * latest test/run output already held in the builder — and every state
 * where it cannot is named rather than filled in.
 *
 * Specifically it never:
 *   - invents example values ("dana@example.com") to fill a gap,
 *   - fetches anything (no neighbouring sheet rows, no next row number,
 *     no provider call),
 *   - claims a row number the system cannot know before the write
 *     happens.
 *
 * Everything is pure so the honesty rules are testable directly.
 */

export type PreviewCellState =
  /** A literal the user typed. Shown as-is. */
  | "literal"
  /** A reference resolved from real captured output. */
  | "resolved"
  /** A reference to a step that exists but has no captured value yet. */
  | "untested"
  /** A reference to a step or output that no longer exists. */
  | "broken"
  /** Deliberately left blank. */
  | "blank";

export interface PreviewCell {
  readonly columnName: string;
  readonly state: PreviewCellState;
  /** What to render. Empty for `blank`. */
  readonly display: string;
  /** The raw reference, when the cell holds one and it is not resolved. */
  readonly reference?: string;
}

export type PreviewProvenance =
  /** Every reference resolved from the last test. */
  | "real"
  /** Some resolved, some not. */
  | "partial"
  /** Nothing has been tested yet. */
  | "untested"
  /** Only literal values — nothing to resolve. */
  | "literal-only"
  /** At least one reference points at something that is gone. */
  | "broken";

export interface RowPreview {
  readonly cells: readonly PreviewCell[];
  readonly provenance: PreviewProvenance;
  /** Honest one-line caption for the preview header. */
  readonly caption: string;
  /** References that could not be matched to any current step. */
  readonly brokenReferences: readonly string[];
}

const CAPTIONS: Record<PreviewProvenance, string> = {
  real: "Using data from your last test",
  partial: "Some values have not been tested yet",
  untested: "Run a test to preview real values",
  "literal-only": "The row as you have written it",
  broken: "Some values point at a step that no longer exists",
};

export interface BuildRowPreviewInput {
  readonly columns: readonly string[];
  readonly cells: readonly string[];
  readonly sources: readonly VariableSource[];
  /** Latest captured output per source id. Missing key = never tested. */
  readonly latestValuesBySource: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Build the preview of the row that would be written.
 *
 * Resolution uses the same helpers the variable picker's inline
 * previews use, so a value shown here and a value shown there can never
 * disagree.
 */
export function buildRowPreview(input: BuildRowPreviewInput): RowPreview {
  const { columns, cells, sources, latestValuesBySource } = input;
  const knownSourceIds = new Set(sources.map((s) => s.sourceId));
  const latest = latestValuesBySource ?? {};

  const previewCells: PreviewCell[] = [];
  const brokenReferences: string[] = [];
  let sawReference = false;
  let sawResolved = false;
  let sawUnresolved = false;

  const cellCount = Math.max(columns.length, cells.length);
  for (let i = 0; i < cellCount; i++) {
    const columnName = columns[i] ?? `Column ${i + 1}`;
    const raw = cells[i] ?? "";

    if (raw.trim().length === 0) {
      previewCells.push({ columnName, state: "blank", display: "" });
      continue;
    }

    const references = parseReferences(raw);
    if (references.length === 0) {
      previewCells.push({ columnName, state: "literal", display: raw });
      continue;
    }

    sawReference = true;

    // A cell can mix text and references; it only counts as resolved when
    // every reference in it resolves.
    let rendered = raw;
    let allResolved = true;
    let anyBroken = false;

    for (const reference of references) {
      const token = `{{${reference.nodeId}${
        reference.path.length === 0
          ? ""
          : reference.path.startsWith("[")
            ? reference.path
            : `.${reference.path}`
      }}}`;

      if (!knownSourceIds.has(reference.nodeId)) {
        anyBroken = true;
        allResolved = false;
        if (!brokenReferences.includes(token)) brokenReferences.push(token);
        continue;
      }

      const root = latest[reference.nodeId];
      if (root === undefined) {
        allResolved = false; // step exists, but was never tested
        continue;
      }
      const resolved = resolveValueAtPath(root, reference.path);
      const formatted = formatLatestValuePreview(resolved);
      if (formatted.kind === "absent") {
        allResolved = false;
        continue;
      }
      rendered = rendered.replace(token, formatted.preview);
    }

    if (anyBroken) {
      previewCells.push({
        columnName,
        state: "broken",
        display: raw,
        reference: raw,
      });
      sawUnresolved = true;
      continue;
    }
    if (allResolved) {
      previewCells.push({ columnName, state: "resolved", display: rendered });
      sawResolved = true;
      continue;
    }
    // Unresolved references stay VISIBLE as their token — never blanked,
    // never replaced with a plausible-looking sample.
    previewCells.push({
      columnName,
      state: "untested",
      display: raw,
      reference: raw,
    });
    sawUnresolved = true;
  }

  const provenance: PreviewProvenance = brokenReferences.length > 0
    ? "broken"
    : !sawReference
      ? "literal-only"
      : sawResolved && !sawUnresolved
        ? "real"
        : sawResolved
          ? "partial"
          : "untested";

  return {
    cells: previewCells,
    provenance,
    caption: CAPTIONS[provenance],
    brokenReferences,
  };
}
