import {
  normalizeSchemaFieldName,
  SCHEMA_FIELDS_MAX_ROWS,
  type SchemaFieldRow,
} from "./_schemaFieldsValidator";
import type { SuggestedSchemaField } from "@/lib/api/schemaSuggestion";

/**
 * Merging a Suggest-fields proposal into the editor's rows
 * (AI-PROVIDER-7 CS-7).
 *
 * Pure, so the merge rules are testable without React and identical in both
 * directions the author can take a proposal:
 *
 *   - **Add** — keep every row the author already has, append only the
 *     proposed fields whose name is not already taken. This is the default
 *     and it can never destroy work.
 *   - **Replace** — swap the rows for the proposal. Only ever reachable from
 *     an explicit second click, never automatically.
 *
 * Proposed names run through the SAME `normalizeSchemaFieldName` the editor
 * applies to hand-typed names, so a proposal cannot introduce an identifier
 * the author could not have typed themselves — and the existing validator
 * still judges the result (a proposal is not privileged).
 */

export interface SuggestionMergeResult {
  readonly rows: SchemaFieldRow[];
  /** How many proposed fields were actually added. */
  readonly added: number;
  /** Proposed fields skipped because the author already has that name. */
  readonly skippedDuplicates: number;
  /** Proposed fields dropped because the editor is at its row cap. */
  readonly skippedOverCap: number;
}

/** Normalize + drop anything that can't become a legal row. */
function toRows(fields: readonly SuggestedSchemaField[]): SchemaFieldRow[] {
  const rows: SchemaFieldRow[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const name = normalizeSchemaFieldName(field.name);
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name,
      type: field.type,
      ...(field.required === true ? { required: true } : {}),
      ...(typeof field.description === "string" && field.description.trim() !== ""
        ? { description: field.description.trim() }
        : {}),
    });
  }
  return rows;
}

/**
 * Append the proposal to the author's rows, skipping names they already use.
 * Existing rows keep their position, their type, and their edits.
 */
export function mergeSuggestedFields(
  existing: readonly SchemaFieldRow[],
  suggested: readonly SuggestedSchemaField[],
): SuggestionMergeResult {
  const taken = new Set(
    existing.map((row) => normalizeSchemaFieldName(row.name).toLowerCase()),
  );
  const rows = [...existing];
  let added = 0;
  let skippedDuplicates = 0;
  let skippedOverCap = 0;

  for (const row of toRows(suggested)) {
    if (taken.has(row.name.toLowerCase())) {
      skippedDuplicates += 1;
      continue;
    }
    if (rows.length >= SCHEMA_FIELDS_MAX_ROWS) {
      skippedOverCap += 1;
      continue;
    }
    taken.add(row.name.toLowerCase());
    rows.push(row);
    added += 1;
  }

  return { rows, added, skippedDuplicates, skippedOverCap };
}

/** Replace the author's rows with the proposal. Explicit second click only. */
export function replaceWithSuggestedFields(
  suggested: readonly SuggestedSchemaField[],
): SuggestionMergeResult {
  const all = toRows(suggested);
  const rows = all.slice(0, SCHEMA_FIELDS_MAX_ROWS);
  return {
    rows,
    added: rows.length,
    skippedDuplicates: 0,
    skippedOverCap: all.length - rows.length,
  };
}

/** One sentence describing what a merge did. Empty string when nothing to say. */
export function describeMerge(result: SuggestionMergeResult): string {
  const parts: string[] = [];
  parts.push(`Added ${result.added} field${result.added === 1 ? "" : "s"}.`);
  if (result.skippedDuplicates > 0) {
    parts.push(
      `${result.skippedDuplicates} you already had ${result.skippedDuplicates === 1 ? "was" : "were"} left alone.`,
    );
  }
  if (result.skippedOverCap > 0) {
    parts.push(`${result.skippedOverCap} didn't fit the ${SCHEMA_FIELDS_MAX_ROWS}-field limit.`);
  }
  return parts.join(" ");
}
