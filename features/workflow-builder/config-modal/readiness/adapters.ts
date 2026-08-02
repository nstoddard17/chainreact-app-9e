import type { FieldMeta } from "@/contracts/actionMeta";
import type { ReadinessChecklistItem } from "./computeConfigReadiness";

/**
 * Per-action readiness checklist adapters
 * (SPREADSHEET-CONFIG-REDESIGN-1). An adapter replaces the generic
 * "one row per required field" checklist with richer product copy for
 * actions whose readiness spans an either-or / cross-field rule the
 * `required` flags can't express (the metadata deliberately marks
 * either-or fields `required: false` and lets the runtime `.refine`
 * be authoritative).
 *
 * Rules for adapters:
 *   - DERIVE from current values only — never re-implement runtime
 *     schema validation, never fetch.
 *   - Product language only (no schema keys / shape words).
 *   - Missing adapter → the generic checklist applies, so every node
 *     gets at least the baseline banner. Adapters are polish, not a
 *     gate for new providers.
 */

export interface ReadinessAdapterInput {
  readonly fields: readonly FieldMeta[];
  readonly values: Readonly<Record<string, unknown>>;
}

export type ReadinessAdapter = (
  input: ReadinessAdapterInput,
) => ReadinessChecklistItem[];

function isFilledString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * A column-keyed row value — the second representation Excel's
 * `add_table_row` accepts. Counted as filled in so readiness treats both
 * valid shapes alike.
 */
function isNonEmptyRecord(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

/**
 * Microsoft Excel `add_row` — destination (workbook + worksheet) plus
 * "at least one row value" across the two either-or save shapes the
 * spreadsheet editor manages (one-row values XOR batch rows).
 */
const excelAddRowAdapter: ReadinessAdapter = ({ values }) => [
  {
    label: "Pick a workbook and worksheet",
    done: isFilledString(values["workbookId"]) && isFilledString(values["worksheetName"]),
  },
  {
    label: "Fill in at least one row value",
    done: isNonEmptyArray(values["values"]) || isNonEmptyArray(values["rows"]),
  },
];

/**
 * Google Sheets `append_row` (SHEETS-GUIDED-CONFIG-1) — mirrors the
 * three guided questions so the banner and the accordion never disagree
 * about what is outstanding.
 *
 * The distinction that matters most here: a destination COLUMN left
 * deliberately blank is a finished state, not missing configuration.
 * Only "no values at all" is outstanding, because that is the one case
 * the runtime schema rejects. Blocking on individually empty columns
 * would force people to invent data to satisfy the UI.
 *
 * `valueInputOption` earns its own line because it is a Q11 field with
 * no default: nothing answers it on the user's behalf, so the banner
 * must name it rather than leaving the user hunting for what is
 * incomplete.
 */
const googleSheetsAppendRowAdapter: ReadinessAdapter = ({ values }) => [
  {
    label: "Choose a spreadsheet and tab",
    done:
      isFilledString(values["spreadsheetId"]) &&
      isFilledString(values["sheetName"]),
  },
  {
    label: "Fill in at least one column",
    done: isNonEmptyArray(values["values"]),
  },
  {
    label: "Say how the values should be written",
    done: isFilledString(values["valueInputOption"]),
  },
];

/**
 * Microsoft Excel `add_table_row` (EXCEL-GUIDED-CONFIG-2) — destination
 * (workbook + table) plus at least one mapped value.
 *
 * `values` is the one field whose emptiness the runtime schema actually
 * rejects, and it accepts EITHER representation the action allows: a
 * positional array or a column-keyed record. Both count as filled in, so
 * readiness must not quietly demand the positional one.
 *
 * A column left deliberately blank is a finished state, not a gap — the
 * handler writes `null` for it — so only "nothing at all" blocks.
 */
const excelAddTableRowAdapter: ReadinessAdapter = ({ values }) => [
  {
    label: "Pick a workbook and table",
    done:
      isFilledString(values["workbookId"]) &&
      isFilledString(values["tableName"]),
  },
  {
    label: "Fill in at least one column",
    done: isNonEmptyArray(values["values"]) || isNonEmptyRecord(values["values"]),
  },
];

const READINESS_ADAPTERS: Readonly<Record<string, ReadinessAdapter>> =
  Object.freeze({
    "microsoft-excel:add_row": excelAddRowAdapter,
    "microsoft-excel:add_table_row": excelAddTableRowAdapter,
    "google-sheets:append_row": googleSheetsAppendRowAdapter,
  });

export function getReadinessAdapter(
  metaKey: string,
): ReadinessAdapter | undefined {
  return READINESS_ADAPTERS[metaKey];
}
