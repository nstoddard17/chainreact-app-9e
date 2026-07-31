import type { OutputMeta } from "@/contracts/actionMeta";
import { formatReference } from "@/core/workflows/variables/variableReferences";
import type { VariableSource } from "../../hooks/useUpstreamVariables";

/**
 * Conservative column-mapping suggestions
 * (SHEETS-GUIDED-CONFIG-1, approved decision D3).
 *
 * A suggestion says "the column called Subject probably wants the
 * earlier step's Subject". That is a genuinely useful shortcut and a
 * genuinely dangerous one: a mapping that is wrong but plausible gets
 * accepted at a glance and then writes wrong data into a real
 * spreadsheet on every run, silently.
 *
 * So the matcher is deliberately dumb, and the rules are the point:
 *
 *   - **Exact normalized-name equality only.** Case, surrounding
 *     whitespace, and punctuation/separator differences are ignored
 *     ("File link" ≡ "file_link"). Nothing else — no edit distance, no
 *     alias table, no synonyms, no AI. Those all produce confident
 *     wrong answers.
 *   - **Ambiguity produces nothing.** If two upstream outputs normalize
 *     to the same column, there is no defensible pick, so no suggestion
 *     is offered at all.
 *   - **Never overwrite.** A column the user already filled in is left
 *     alone.
 *   - **Suggestions are never configuration.** This module returns
 *     candidates; committing one is an explicit user action. Nothing
 *     here writes to the draft.
 */

/**
 * Fold a header or output name to its comparison key. Everything that
 * is not a letter or digit becomes a separator and is dropped, so
 * "File link", "file_link" and "File-Link" agree — while "Sent at" and
 * "Sent" still differ.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface MappingSuggestion {
  /** Index of the destination column this fills. */
  readonly columnIndex: number;
  readonly columnName: string;
  /** Where the value comes from, for display ("Step 1 · Gmail"). */
  readonly sourceLabel: string;
  /** Leaf output name, for display ("Subject line"). */
  readonly outputLabel: string;
  /** The canonical `{{nodeId.path}}` token that would be committed. */
  readonly token: string;
}

interface FlatOutput {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly path: string;
  readonly leafName: string;
}

/**
 * Flatten a source's output tree into addressable leaves. Only leaves
 * are offered: suggesting an object would insert a token that renders
 * as `[object Object]` in a spreadsheet cell.
 */
function flattenOutputs(
  source: VariableSource,
  outputs: readonly OutputMeta[],
  prefix: string,
  into: FlatOutput[],
): void {
  for (const output of outputs) {
    const path = prefix.length > 0 ? `${prefix}.${output.name}` : output.name;
    const children = output.fields ?? [];
    if (children.length > 0) {
      flattenOutputs(source, children, path, into);
      continue;
    }
    // A sensitive output must never be proposed for a spreadsheet cell —
    // that would write a secret into a document the user shares.
    if (output.sensitive === true) continue;
    into.push({
      sourceId: source.sourceId,
      sourceLabel: source.displayName,
      path,
      leafName: output.name,
    });
  }
}

export function flattenSourceOutputs(
  sources: readonly VariableSource[],
): readonly FlatOutput[] {
  const flat: FlatOutput[] = [];
  for (const source of sources) {
    flattenOutputs(source, source.outputs, "", flat);
  }
  return flat;
}

export interface SuggestMappingsInput {
  readonly columns: readonly string[];
  /** Current cell values, aligned by index to `columns`. */
  readonly cells: readonly string[];
  readonly sources: readonly VariableSource[];
}

/**
 * Propose mappings for the columns that are still empty. Returns one
 * suggestion per confidently-matched column, and nothing at all for the
 * rest — an empty result is a valid, common answer.
 */
export function suggestMappings(
  input: SuggestMappingsInput,
): readonly MappingSuggestion[] {
  const { columns, cells, sources } = input;
  const flat = flattenSourceOutputs(sources);

  // Group candidate outputs by normalized leaf name so ambiguity is
  // visible before anything is proposed.
  const byName = new Map<string, FlatOutput[]>();
  for (const output of flat) {
    const key = normalizeName(output.leafName);
    if (key.length === 0) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(output);
    else byName.set(key, [output]);
  }

  // Destination headers that collide must be resolved BEFORE proposing
  // anything. Skipping only the later duplicate would still fill the
  // first one — an arbitrary pick between two indistinguishable columns,
  // which is exactly the unsafe assignment this matcher must not make.
  const columnKeyCounts = new Map<string, number>();
  for (const column of columns) {
    const key = normalizeName(column);
    if (key.length === 0) continue;
    columnKeyCounts.set(key, (columnKeyCounts.get(key) ?? 0) + 1);
  }

  const suggestions: MappingSuggestion[] = [];

  for (let i = 0; i < columns.length; i++) {
    const columnName = columns[i]!;
    const key = normalizeName(columnName);
    if (key.length === 0) continue;

    // Ambiguous destination — neither copy gets a suggestion.
    if ((columnKeyCounts.get(key) ?? 0) > 1) continue;

    // Never overwrite something the user already put there.
    const existing = cells[i] ?? "";
    if (existing.trim().length > 0) continue;

    const candidates = byName.get(key);
    if (!candidates || candidates.length !== 1) continue;

    const match = candidates[0]!;
    suggestions.push({
      columnIndex: i,
      columnName,
      sourceLabel: match.sourceLabel,
      outputLabel: match.leafName,
      token: formatReference({ nodeId: match.sourceId, path: match.path }),
    });
  }

  return suggestions;
}

/**
 * Columns whose normalized name appears more than once in the
 * destination. Reported so the UI can explain why they were skipped
 * rather than staying silent about it.
 */
export function duplicateColumnNames(
  columns: readonly string[],
): readonly string[] {
  const counts = new Map<string, number>();
  for (const column of columns) {
    const key = normalizeName(column);
    if (key.length === 0) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dupes: string[] = [];
  for (const column of columns) {
    const key = normalizeName(column);
    if ((counts.get(key) ?? 0) > 1 && !dupes.includes(column)) {
      dupes.push(column);
    }
  }
  return dupes;
}
