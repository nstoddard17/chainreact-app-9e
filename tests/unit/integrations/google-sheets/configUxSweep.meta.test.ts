/**
 * CONFIG-UX sweep (Group D) — Google Sheets builder-metadata pins.
 *
 * Guards the sweep's metadata-only changes:
 *   - read_rows: range copy no longer points users at a repo source file;
 *     majorDimension (defaultValue keeps readiness green) + valueRenderOption
 *     move to the Advanced tab.
 *   - valueInputOption (append_row / update_row / update_cell / batch_update):
 *     friendlier option LABELS while the committed VALUES stay the verbatim
 *     runtime enum (RAW / USER_ENTERED) and Q11 requiredness (no default)
 *     is intact.
 *   - find_row.operator copy drops roadmap-speak.
 *
 * Also pins (RESOLVERS-1): find_row.column is a `google-sheets:columns`
 * combobox gated on the spreadsheetId + sheetName cascade with manual entry,
 * and still commits a HEADER NAME (what the handler's `headers.indexOf`
 * matches) — not a column letter.
 *
 * row_changed's changeKinds combobox conversion + keyColumn visibleWhen /
 * columns picker are pinned in the builder integration test
 * (google-sheets-row-changed-trigger-config.test.tsx).
 *
 * Deliberately NOT changed (deferred product decision per
 * docs/slices/phase-5/spreadsheet-config-redesign-closeout.md §Secondary
 * targets): free-text A1 `range` on read/append/update/clear and the
 * positional `values` arrays.
 */

import { googleSheetsReadRowsMeta } from "@/integrations/google-sheets/actions/readRows.meta";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { googleSheetsUpdateRowMeta } from "@/integrations/google-sheets/actions/updateRow.meta";
import { googleSheetsUpdateCellMeta } from "@/integrations/google-sheets/actions/updateCell.meta";
import { googleSheetsBatchUpdateMeta } from "@/integrations/google-sheets/actions/batchUpdate.meta";
import { googleSheetsFindRowMeta } from "@/integrations/google-sheets/actions/findRow.meta";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";

function field(meta: ActionMeta, name: string): FieldMeta {
  const f = meta.fields.find((x) => x.name === name);
  if (!f) throw new Error(`Missing field '${name}' on ${meta.key}.`);
  return f;
}

describe("google-sheets:read_rows (CONFIG-UX sweep)", () => {
  it("range keeps type/requiredness; copy no longer references a repo source file", () => {
    const f = field(googleSheetsReadRowsMeta, "range");
    expect(f.type).toBe("text");
    expect(f.required).toBe(true);
    expect(f.description).not.toContain("schema.ts");
    expect(f.description).not.toContain(".ts");
    // Still example-first A1 guidance.
    expect(f.description).toContain("Sheet1!A:Z");
  });

  it("majorDimension is Advanced with the ROWS default intact (readiness stays green)", () => {
    const f = field(googleSheetsReadRowsMeta, "majorDimension");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(true);
    expect(f.defaultValue).toBe("ROWS");
  });

  it("valueRenderOption is Advanced and stays optional (omit = Sheets default)", () => {
    const f = field(googleSheetsReadRowsMeta, "valueRenderOption");
    expect(f.advanced).toBe(true);
    expect(f.required).toBe(false);
    expect(f.defaultValue).toBeUndefined();
  });
});

describe("google-sheets valueInputOption label polish (CONFIG-UX sweep)", () => {
  it.each([
    ["append_row", googleSheetsAppendRowMeta],
    ["update_row", googleSheetsUpdateRowMeta],
    ["update_cell", googleSheetsUpdateCellMeta],
    ["batch_update", googleSheetsBatchUpdateMeta],
  ] as const)(
    "%s — friendlier labels, verbatim runtime enum values, Q11 requiredness intact",
    (_key, meta) => {
      const f = field(meta, "valueInputOption");
      expect(f.type).toBe("select");
      expect(f.required).toBe(true);
      expect(f.defaultValue).toBeUndefined();
      // Committed VALUES are exactly the runtime enum.
      expect(f.options!.map((o) => o.value).sort()).toEqual([
        "RAW",
        "USER_ENTERED",
      ]);
      // Labels are outcome-language, not raw enum echoes.
      const byValue = new Map(f.options!.map((o) => [o.value, o.label]));
      expect(byValue.get("USER_ENTERED")).toBe("Parse as if typed in Sheets");
      expect(byValue.get("RAW")).toBe("Store exactly as written");
    },
  );
});

describe("google-sheets:find_row copy polish (CONFIG-UX sweep)", () => {
  it("operator description drops roadmap-speak; the single runtime value stays 'equals'", () => {
    const f = field(googleSheetsFindRowMeta, "operator");
    expect(f.defaultValue).toBe("equals");
    expect(f.options!.map((o) => o.value)).toEqual(["equals"]);
    expect(f.description!.toLowerCase()).not.toContain("slice");
    expect(f.description!.toLowerCase()).not.toContain("batch 1");
  });
});

describe("google-sheets:find_row.column — google-sheets:columns picker (RESOLVERS-1)", () => {
  it("is a combobox sourced from google-sheets:columns, gated on the spreadsheet + sheet cascade, with manual entry", () => {
    const f = field(googleSheetsFindRowMeta, "column");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-sheets:columns");
    // BOTH parents — the resolver needs spreadsheetId AND sheetName to read
    // row 1; a missing dep short-circuits the route on MISSING_DEPENDENCY.
    expect(f.dependsOn).toEqual(["spreadsheetId", "sheetName"]);
    expect(f.allowManualEntry).toBe(true);
    expect(f.required).toBe(true);
    expect(f.options).toBeUndefined();
  });

  it("the declared parents are real sibling fields (cascade can actually resolve)", () => {
    const names = googleSheetsFindRowMeta.fields.map((x) => x.name);
    expect(names).toContain("spreadsheetId");
    expect(names).toContain("sheetName");
  });

  it("still stores a HEADER NAME — copy never tells authors to type a column letter", () => {
    // The handler does `headers.indexOf(config.column)`; a column letter
    // would never match. The picker's values are header strings.
    const f = field(googleSheetsFindRowMeta, "column");
    expect(f.description!.toLowerCase()).toContain("header name");
  });
});
