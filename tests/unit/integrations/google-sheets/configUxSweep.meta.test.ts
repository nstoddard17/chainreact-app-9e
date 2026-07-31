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
 * SHEETS-GUIDED-CONFIG-1 resolved the deferral this file used to record for
 * `append_row`. The deferred product decision (a tab picker + a derived
 * range, per docs/slices/phase-5/spreadsheet-guided-config/plan.md §10 / D1)
 * is now implemented, so append_row's `range` is an ADVANCED field, its
 * `values` is the column-aware `spreadsheet-rows` editor, and its two write-
 * behavior selects carry plain-language labels. Those pins live in
 * "google-sheets:append_row — guided destination (SHEETS-GUIDED-CONFIG-1)"
 * below, and in the builder integration test.
 *
 * Still deliberately NOT changed (same deferral, still open for these):
 * free-text A1 `range` on read_rows / update_row / clear_range and the
 * positional `values` array on update_row. S1 covered append_row only.
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
    "%s — Q11 holds: required, no default, and the committed values are the verbatim runtime enum",
    (_key, meta) => {
      const f = field(meta, "valueInputOption");
      expect(f.type).toBe("select");
      expect(f.required).toBe(true);
      // The single most important pin in this file: a default here would
      // silently choose how a user's numbers, dates and formulas are written.
      expect(f.defaultValue).toBeUndefined();
      // Committed VALUES are exactly the runtime enum.
      expect(f.options!.map((o) => o.value).sort()).toEqual([
        "RAW",
        "USER_ENTERED",
      ]);
    },
  );

  it.each([
    ["update_row", googleSheetsUpdateRowMeta],
    ["update_cell", googleSheetsUpdateCellMeta],
    ["batch_update", googleSheetsBatchUpdateMeta],
  ] as const)(
    "%s — keeps the CONFIG-UX sweep labels (not yet migrated to guided copy)",
    (_key, meta) => {
      const byValue = new Map(
        field(meta, "valueInputOption").options!.map((o) => [o.value, o.label]),
      );
      expect(byValue.get("USER_ENTERED")).toBe("Parse as if typed in Sheets");
      expect(byValue.get("RAW")).toBe("Store exactly as written");
    },
  );
});

describe("google-sheets:append_row — guided destination (SHEETS-GUIDED-CONFIG-1)", () => {
  it("asks which TAB with a real picker instead of making the user write A1 notation", () => {
    const f = field(googleSheetsAppendRowMeta, "sheetName");
    expect(f.type).toBe("combobox");
    expect(f.optionsSource).toBe("google-sheets:sheets");
    // The tab picker is what makes a columns cascade possible at all.
    expect(f.dependsOn).toBe("spreadsheetId");
    expect(f.required).toBe(true);
    // A power user with a tab the picker can't list is never trapped.
    expect(f.allowManualEntry).toBe(true);
  });

  it("reads the destination's real columns instead of asking for blind positional cells", () => {
    const f = field(googleSheetsAppendRowMeta, "values");
    expect(f.type).toBe("spreadsheet-rows");
    expect(f.optionsSource).toBe("google-sheets:columns");
    // Both parents — the resolver reads row 1 of a specific tab.
    expect(f.dependsOn).toEqual(["spreadsheetId", "sheetName"]);
    expect(f.required).toBe(true);
    // Sheets has no multi-row append action, so the editor must not offer a
    // "several rows" mode that no runtime schema would accept.
    expect(f.batchRowsField).toBeUndefined();
  });

  it("keeps the raw cell range available to power users, off the normal path", () => {
    const f = field(googleSheetsAppendRowMeta, "range");
    expect(f.advanced).toBe(true);
    // Still REQUIRED at runtime — it is the only value sent to the API, so
    // demoting it to Advanced must not make it optional.
    expect(f.required).toBe(true);
    expect(f.type).toBe("text");
  });

  it("states the two write-behavior choices as outcomes a business user can judge", () => {
    const byValue = new Map(
      field(googleSheetsAppendRowMeta, "valueInputOption").options!.map((o) => [
        o.value,
        o.label,
      ]),
    );
    expect(byValue.get("USER_ENTERED")).toBe("Like something you typed in");
    expect(byValue.get("RAW")).toBe("Exactly as plain text");

    const insert = new Map(
      field(googleSheetsAppendRowMeta, "insertDataOption").options!.map((o) => [
        o.value,
        o.label,
      ]),
    );
    // The old labels echoed the raw API enum at the user.
    expect(insert.get("INSERT_ROWS")).toBe(
      "Push them down and slot the new row in",
    );
    expect(insert.get("OVERWRITE")).toBe("Write over whatever is there");
    // The destructive option must say so in words, not rely on styling.
    expect(
      insert.get("OVERWRITE") === undefined
        ? ""
        : field(googleSheetsAppendRowMeta, "insertDataOption").options!.find(
            (o) => o.value === "OVERWRITE",
          )!.description!,
    ).toMatch(/permanently erase|replaces existing/i);
  });

  it("no builder-visible copy asks the user to hand-write A1 notation on the normal path", () => {
    for (const f of googleSheetsAppendRowMeta.fields) {
      if (f.advanced === true) continue; // the Advanced range may say so
      expect(`${f.label} ${f.description ?? ""}`).not.toMatch(/A1 notation/i);
    }
  });

  it("the declared cascade parents are real sibling fields", () => {
    const names = googleSheetsAppendRowMeta.fields.map((x) => x.name);
    expect(names).toContain("spreadsheetId");
    expect(names).toContain("sheetName");
  });
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
