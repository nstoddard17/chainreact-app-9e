import type { FieldMeta } from "@/contracts/actionMeta";
import { isRequiredValueMissing } from "@/core/workflows/requiredFields";
import {
  deriveAppendRange,
  isDerivedAppendRange,
  parseSheetNameFromRange,
} from "@/core/workflows/spreadsheet/a1Range";
import type { GuidedSpreadsheetAdapter } from "./guidedSpreadsheetAdapters";

/**
 * Pure model behind the guided spreadsheet steps
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * Everything the accordion shows — which steps are complete, what each
 * collapsed header summarises, whether a legacy range needs explaining
 * — is DERIVED from state that already exists (the action metadata plus
 * the pending config draft). Nothing here is stored, and no new slice
 * is introduced: step completion is a projection, not a second copy of
 * the truth.
 *
 * Keeping it pure is what makes the interesting rules testable without
 * rendering: "an optional blank column does not block", "a hand-written
 * range is never silently replaced", "a legacy range is explained, not
 * rewritten".
 */

export type GuidedStepId = "destination" | "mapping" | "write";

export interface GuidedStepState {
  readonly id: GuidedStepId;
  /** Fields this step draws, in order. */
  readonly fields: readonly string[];
  /** Every required field this step owns has a value. */
  readonly complete: boolean;
  /** One-line summary for the collapsed header. Empty when nothing chosen yet. */
  readonly summary: string;
}

export interface GuidedModelInput {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
  /** Detected destination columns, when they have loaded. */
  readonly columnCount?: number;
}

function fieldByName(
  fields: readonly FieldMeta[],
  name: string,
): FieldMeta | undefined {
  return fields.find((f) => f.name === name);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A required field counts as answered when it holds a value. Reuses the
 * shared readiness rule rather than restating "what counts as empty" —
 * the guided header and the readiness banner must never disagree about
 * whether a step is done.
 */
function isAnswered(field: FieldMeta, values: Readonly<Record<string, unknown>>): boolean {
  return !isRequiredValueMissing(values[field.name]);
}

/** Human list: ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b and c". */
function humanJoin(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
}

/**
 * Label an option value using the field's own option list, so the
 * summary says "Like something you typed in" rather than USER_ENTERED.
 */
function optionLabel(field: FieldMeta | undefined, value: unknown): string {
  const raw = readString(value);
  if (raw.length === 0) return "";
  const match = (field?.options ?? []).find((o) => o.value === raw);
  return match?.label ?? raw;
}

/**
 * How many cells of the mapping field are filled in. Blanks between
 * filled cells are meaningful (they hold column alignment) so they are
 * counted as present-but-empty, not as missing configuration.
 */
export function countFilledCells(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let filled = 0;
  for (const cell of value) {
    if (typeof cell === "string" && cell.trim().length > 0) filled += 1;
    else if (typeof cell === "number" || typeof cell === "boolean") filled += 1;
  }
  return filled;
}

/**
 * Build the three steps. `columnCount` is only used for wording ("2 of
 * 5 columns filled in"); it never changes completion, because a column
 * left deliberately blank is a legitimate finished state.
 */
export function buildGuidedSteps(input: GuidedModelInput): readonly GuidedStepState[] {
  const { adapter, fields, values, columnCount } = input;

  // ── Step 1: destination ────────────────────────────────────────────────
  const destinationFields = adapter.destinationFields
    .map((n) => fieldByName(fields, n))
    .filter((f): f is FieldMeta => f !== undefined);
  const destinationComplete = destinationFields
    .filter((f) => f.required === true)
    .every((f) => isAnswered(f, values));
  const chosen = destinationFields
    .map((f) => readString(values[f.name]))
    .filter((v) => v.length > 0);
  const destinationSummary = chosen.length > 0 ? chosen.join(" · ") : "";

  // ── Step 2: mapping ────────────────────────────────────────────────────
  const mappingField = fieldByName(fields, adapter.mappingField);
  const filled = countFilledCells(values[adapter.mappingField]);
  const mappingComplete =
    mappingField?.required === true
      ? !isRequiredValueMissing(values[adapter.mappingField])
      : true;
  const mappingSummary =
    columnCount !== undefined && columnCount > 0
      ? `${filled} of ${columnCount} column${columnCount === 1 ? "" : "s"} filled in`
      : filled > 0
        ? `${filled} value${filled === 1 ? "" : "s"} set`
        : "";

  // ── Step 3: write behavior ─────────────────────────────────────────────
  const writeFields = adapter.writeBehaviorFields
    .map((n) => fieldByName(fields, n))
    .filter((f): f is FieldMeta => f !== undefined);
  const writeComplete = writeFields
    .filter((f) => f.required === true)
    .every((f) => isAnswered(f, values) || f.defaultValue !== undefined);
  const writeSummary = writeFields.length === 0
    ? "Nothing to decide for this step"
    : humanJoin(
        writeFields
          .map((f) => optionLabel(f, values[f.name] ?? f.defaultValue))
          .filter((label) => label.length > 0),
      );

  return [
    {
      id: "destination",
      fields: adapter.destinationFields,
      complete: destinationComplete,
      summary: destinationSummary,
    },
    {
      id: "mapping",
      fields: [adapter.mappingField],
      complete: mappingComplete,
      summary: mappingSummary,
    },
    {
      id: "write",
      fields: adapter.writeBehaviorFields,
      complete: writeComplete,
      summary: writeSummary,
    },
  ];
}

/** The step the panel should open first: the earliest incomplete one. */
export function firstIncompleteStep(
  steps: readonly GuidedStepState[],
): GuidedStepId {
  return steps.find((s) => !s.complete)?.id ?? steps[0]!.id;
}

/**
 * What should happen to the derived range when the destination tab
 * becomes `nextTab`.
 *
 * The rule this encodes is a user-safety rule, not a formatting one:
 *
 *   - No derived-range configuration at all (Excel) → nothing to do.
 *   - The stored range is empty, or is one this builder could have
 *     produced → derive a fresh one. Harmless: it addresses the tab the
 *     user just chose.
 *   - The stored range is something a person deliberately wrote
 *     (`'Data'!B2:F10`) → LEAVE IT. Silently rewriting it would discard
 *     a real decision and could change which cells a live workflow
 *     writes to. The caller surfaces this instead.
 */
export type DerivedRangeOutcome =
  | { readonly kind: "none" }
  | { readonly kind: "derive"; readonly field: string; readonly value: string }
  | { readonly kind: "keep-custom"; readonly field: string; readonly current: string };

export function planDerivedRange(input: {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly values: Readonly<Record<string, unknown>>;
  readonly nextTab: string;
  readonly columnCount?: number;
}): DerivedRangeOutcome {
  const { adapter, values, nextTab, columnCount } = input;
  const spec = adapter.derivedRange;
  if (!spec) return { kind: "none" };
  if (nextTab.trim().length === 0) return { kind: "none" };

  const current = readString(values[spec.intoField]);
  if (current.length > 0 && !isDerivedAppendRange(current)) {
    return { kind: "keep-custom", field: spec.intoField, current };
  }
  return {
    kind: "derive",
    field: spec.intoField,
    value: deriveAppendRange(nextTab, columnCount),
  };
}

/**
 * What to tell the user about a node saved before the tab picker
 * existed.
 *
 * The saved range is NOT rewritten on open — opening a step must never
 * change what a workflow does. When the tab can be read out of the range
 * we offer it as a one-click choice; when it cannot, we say so plainly
 * and the user picks. Both outcomes leave the stored configuration
 * exactly as it was until the user acts.
 */
export type LegacyDestinationHint =
  | { readonly kind: "none" }
  | { readonly kind: "suggest-tab"; readonly tab: string; readonly range: string }
  | { readonly kind: "unreadable"; readonly range: string };

export function legacyDestinationHint(input: {
  readonly adapter: GuidedSpreadsheetAdapter;
  readonly values: Readonly<Record<string, unknown>>;
}): LegacyDestinationHint {
  const { adapter, values } = input;
  const spec = adapter.derivedRange;
  if (!spec) return { kind: "none" };

  const tab = readString(values[spec.fromField]);
  if (tab.length > 0) return { kind: "none" }; // already answered

  const range = readString(values[spec.intoField]);
  if (range.length === 0) return { kind: "none" }; // brand-new node

  const parsed = parseSheetNameFromRange(range);
  return parsed !== null
    ? { kind: "suggest-tab", tab: parsed, range }
    : { kind: "unreadable", range };
}
