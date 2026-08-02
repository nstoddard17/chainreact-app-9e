import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

/**
 * Guided spreadsheet configuration — the adapter registry
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * The guided experience is a PRESENTATION of an action's existing
 * metadata: the same fields, the same renderers, the same config draft.
 * What differs per provider is only which field answers which question:
 *
 *   1. Which sheet?            → `destinationFields`
 *   2. What goes in each column? → `mappingField`
 *   3. How is it written?        → `writeBehaviorFields`
 *
 * That difference is DATA, not code. There is deliberately no
 * `if (provider === "google-sheets")` anywhere in the guided components:
 * adding Excel later is a new entry in the table below, not a new
 * branch. Equally deliberately, this table lives in the builder feature
 * rather than the provider registry — the registry is a frozen contract
 * describing what a provider CAN DO, not how one client chooses to draw
 * it.
 *
 * An action without an entry here keeps the generic form exactly as it
 * was. That is also the rollback lever: delete the registration and the
 * node reverts, with no data change, because nothing about the saved
 * configuration is guided-specific.
 */

/** Copy shown around a step. Defaults cover the ordinary spreadsheet case. */
export interface GuidedStepCopy {
  readonly destinationTitle: string;
  readonly destinationHint: string;
  readonly mappingTitle: string;
  readonly mappingHint: string;
  readonly writeTitle: string;
  readonly writeHint: string;
  /** Shown as step 3's body when the action has no write-behavior fields. */
  readonly writeEmpty: string;
}

export const DEFAULT_GUIDED_COPY: GuidedStepCopy = {
  destinationTitle: "Pick the sheet",
  destinationHint:
    "We read the header row of this tab to work out the columns — no cell ranges to type.",
  mappingTitle: "Say what goes in each column",
  mappingHint:
    "Columns you leave empty stay blank in the sheet — nothing breaks.",
  writeTitle: "Confirm how it's written",
  writeHint: "",
  writeEmpty:
    "Values are written exactly as provided. There is nothing else to decide for this step.",
};

/** A resource link the user can paste instead of hunting through the picker. */
export interface ParsedResourceLink {
  /** Field the extracted id belongs to. */
  readonly field: string;
  readonly value: string;
}

export interface GuidedSpreadsheetAdapter {
  /** `ActionMeta.key` this adapter guides. */
  readonly actionKey: string;
  /** Step 1 — destination fields, in render order. */
  readonly destinationFields: readonly string[];
  /** Step 2 — the column-mapping field (a `spreadsheet-rows` field). */
  readonly mappingField: string;
  /** Step 3 — write-behavior fields. Empty renders an honest "nothing to decide". */
  readonly writeBehaviorFields: readonly string[];
  /**
   * Field → option value we RECOMMEND. Recommendation is a label, never a
   * selection: a Q11 field must stay unanswered until the user answers it.
   */
  readonly recommendedValues?: Readonly<Record<string, string>>;
  /** Field → option value that reveals the destructive-consequence warning. */
  readonly dangerValues?: Readonly<Record<string, string>>;
  /**
   * The field whose value the destination range is derived from, and the
   * field that holds the derived range. Both must be destination-scoped.
   * Omitted when a provider addresses its destination directly (Excel
   * names a worksheet; it has no range string to derive).
   */
  readonly derivedRange?: {
    readonly fromField: string;
    readonly intoField: string;
  };
  /** Pure link parser for "paste a link instead". */
  readonly parseResourceLink?: (url: string) => ParsedResourceLink | null;
  readonly copy?: Partial<GuidedStepCopy>;
}

/**
 * Extract a spreadsheet id from a Google Sheets URL.
 *
 * Accepts the shapes a user can actually copy out of a browser
 * (`/spreadsheets/d/<id>/edit#gid=0`, with or without the scheme). A
 * bare id is accepted too, because pasting the id is the same intent.
 * Anything else answers `null` — a link we cannot read is reported to
 * the user, never silently turned into a wrong destination.
 *
 * Note what is NOT taken from the URL: the `gid` fragment identifies a
 * tab numerically, but `google-sheets:sheets` keys tabs by TITLE, so a
 * gid could not be matched to a tab without another provider call. The
 * user picks the tab.
 */
export function parseGoogleSheetsLink(url: string): ParsedResourceLink | null {
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (fromUrl?.[1]) {
    return { field: "spreadsheetId", value: fromUrl[1] };
  }
  // A bare id — no slashes, no spaces, and long enough not to be a typo.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return { field: "spreadsheetId", value: trimmed };
  }
  return null;
}

const ADAPTERS: readonly GuidedSpreadsheetAdapter[] = [
  {
    actionKey: "google-sheets:append_row",
    destinationFields: ["spreadsheetId", "sheetName"],
    mappingField: "values",
    writeBehaviorFields: ["valueInputOption", "insertDataOption"],
    recommendedValues: {
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
    },
    dangerValues: { insertDataOption: "OVERWRITE" },
    derivedRange: { fromField: "sheetName", intoField: "range" },
    parseResourceLink: parseGoogleSheetsLink,
    copy: {
      destinationHint:
        "We read the header row of this tab to work out the columns — no cell ranges to type.",
    },
  },
  {
    // EXCEL-GUIDED-CONFIG-2. Excel addresses a worksheet by NAME, so there
    // is no range string to derive — hence no `derivedRange`.
    //
    // `writeBehaviorFields` is deliberately EMPTY. Excel's Graph range
    // PATCH has no analogue of Sheets' RAW/USER_ENTERED or
    // INSERT_ROWS/OVERWRITE, so inventing radios here would be offering a
    // choice that changes nothing. Step 3 states what the handler
    // actually does instead.
    actionKey: "microsoft-excel:add_row",
    destinationFields: ["workbookId", "worksheetName"],
    mappingField: "values",
    writeBehaviorFields: [],
    copy: {
      destinationTitle: "Pick the worksheet",
      destinationHint:
        "We read the first row of this worksheet to work out the columns.",
      // Verified against `addRow.ts`: single mode anchors at
      // `lastUsedRow + 1` and pads/truncates to the used range's column
      // count; batch mode matches each row's keys against the real
      // first-row headers and fails loudly on an unknown column name.
      writeEmpty:
        "ChainReact adds the values below the worksheet's last used row. A single row follows the worksheet's column order, and several rows are matched to the column names shown above. There is nothing else to decide.",
    },
  },
  {
    // Excel tables carry their own column schema, which is authoritative —
    // no header-row heuristic needed. No range to derive, and no write
    // options for the same reason as add_row.
    actionKey: "microsoft-excel:add_table_row",
    destinationFields: ["workbookId", "tableName"],
    mappingField: "values",
    writeBehaviorFields: [],
    copy: {
      destinationTitle: "Pick the table",
      destinationHint:
        "The table's own columns are used, so there is no header row to guess at.",
      // Verified against `addTableRow.ts`: it POSTs one row to
      // `/tables/{name}/rows`; a positional array is sent verbatim, and a
      // column-keyed record is aligned to the table's column order.
      writeEmpty:
        "ChainReact adds the values as a new row in the selected Excel table, following that table's column order. There is nothing else to decide.",
    },
  },
];

const BY_KEY: ReadonlyMap<string, GuidedSpreadsheetAdapter> = new Map(
  ADAPTERS.map((a) => [a.actionKey, a]),
);

/** The adapter for an action key, or `undefined` for the generic form. */
export function getGuidedSpreadsheetAdapter(
  actionKey: string | undefined,
): GuidedSpreadsheetAdapter | undefined {
  return actionKey === undefined ? undefined : BY_KEY.get(actionKey);
}

/** Every registered adapter — for validation tests. */
export function listGuidedSpreadsheetAdapters(): readonly GuidedSpreadsheetAdapter[] {
  return ADAPTERS;
}

/** Resolved copy for a step, adapter overrides on top of the defaults. */
export function guidedCopy(adapter: GuidedSpreadsheetAdapter): GuidedStepCopy {
  return { ...DEFAULT_GUIDED_COPY, ...(adapter.copy ?? {}) };
}

/**
 * Validate an adapter against the action metadata it claims to guide.
 * Returns human-readable problems; an empty array means consistent.
 *
 * This exists because every field name here is a string that a rename
 * would silently break — a guided step would quietly stop drawing a
 * field the user must fill in. The registry test runs this against the
 * real metadata so a rename fails a test instead of a user's setup.
 */
export function validateGuidedAdapter(
  adapter: GuidedSpreadsheetAdapter,
  meta: Pick<ActionMeta, "fields">,
): readonly string[] {
  const byName = new Map<string, FieldMeta>(
    meta.fields.map((f) => [f.name, f]),
  );
  const problems: string[] = [];

  const requireField = (name: string, role: string): FieldMeta | undefined => {
    const found = byName.get(name);
    if (!found) {
      problems.push(
        `${adapter.actionKey}: ${role} names '${name}', which is not a field on this action.`,
      );
    }
    return found;
  };

  if (adapter.destinationFields.length === 0) {
    problems.push(`${adapter.actionKey}: destinationFields must not be empty.`);
  }
  for (const name of adapter.destinationFields) {
    requireField(name, "destinationFields");
  }

  const mapping = requireField(adapter.mappingField, "mappingField");
  if (mapping && mapping.type !== "spreadsheet-rows") {
    problems.push(
      `${adapter.actionKey}: mappingField '${adapter.mappingField}' is '${mapping.type}', expected 'spreadsheet-rows'.`,
    );
  }

  for (const name of adapter.writeBehaviorFields) {
    requireField(name, "writeBehaviorFields");
  }

  for (const [fieldName, value] of Object.entries(
    adapter.recommendedValues ?? {},
  )) {
    const field = requireField(fieldName, "recommendedValues");
    if (field && !(field.options ?? []).some((o) => o.value === value)) {
      problems.push(
        `${adapter.actionKey}: recommendedValues['${fieldName}'] is '${value}', which is not one of that field's options.`,
      );
    }
  }
  for (const [fieldName, value] of Object.entries(adapter.dangerValues ?? {})) {
    const field = requireField(fieldName, "dangerValues");
    if (field && !(field.options ?? []).some((o) => o.value === value)) {
      problems.push(
        `${adapter.actionKey}: dangerValues['${fieldName}'] is '${value}', which is not one of that field's options.`,
      );
    }
  }

  if (adapter.derivedRange) {
    const from = requireField(adapter.derivedRange.fromField, "derivedRange.fromField");
    const into = requireField(adapter.derivedRange.intoField, "derivedRange.intoField");
    if (from && !adapter.destinationFields.includes(from.name)) {
      problems.push(
        `${adapter.actionKey}: derivedRange.fromField '${from.name}' must be one of destinationFields.`,
      );
    }
    if (into && into.advanced !== true) {
      problems.push(
        `${adapter.actionKey}: derivedRange.intoField '${into.name}' should be advanced — a derived value does not belong on the normal path.`,
      );
    }
  }

  return problems;
}
