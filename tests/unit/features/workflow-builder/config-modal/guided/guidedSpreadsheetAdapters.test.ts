/**
 * Guided spreadsheet adapter registry (SHEETS-GUIDED-CONFIG-1).
 *
 * The registry is a table of FIELD NAMES — plain strings that a rename
 * would break silently. A guided step would simply stop drawing a field
 * the user has to fill in, and the first person to notice would be a
 * customer whose row never got written.
 *
 * So the rules under protection are:
 *   1. Every registered adapter validates against the REAL action
 *      metadata it claims to guide (not a fixture).
 *   2. An action with no adapter gets the generic form — the guided
 *      experience is opt-in, and un-registering it is the rollback.
 *   3. A mis-authored adapter is caught here rather than in the UI.
 */

import {
  getGuidedSpreadsheetAdapter,
  listGuidedSpreadsheetAdapters,
  parseGoogleSheetsLink,
  validateGuidedAdapter,
  type GuidedSpreadsheetAdapter,
} from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";
import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";
import { microsoftExcelAddTableRowMeta } from "@/integrations/microsoft-excel/actions/addTableRow.meta";
import { microsoftExcelUpdateRowMeta } from "@/integrations/microsoft-excel/actions/updateRow.meta";
import type { ActionMeta } from "@/contracts/actionMeta";

const META_BY_KEY: Readonly<Record<string, ActionMeta>> = {
  "google-sheets:append_row": googleSheetsAppendRowMeta,
  "microsoft-excel:add_row": microsoftExcelAddRowMeta,
  "microsoft-excel:add_table_row": microsoftExcelAddTableRowMeta,
  "microsoft-excel:update_row": microsoftExcelUpdateRowMeta,
};

describe("registered adapters agree with the live action metadata", () => {
  it("every adapter names fields that actually exist on its action", () => {
    for (const adapter of listGuidedSpreadsheetAdapters()) {
      const meta = META_BY_KEY[adapter.actionKey];
      // A registered adapter whose action this test doesn't know about is
      // itself a failure — the coverage map must be kept current.
      expect(meta).toBeDefined();
      expect(validateGuidedAdapter(adapter, meta!)).toEqual([]);
    }
  });

  it("covers exactly the spreadsheet actions shipped so far (S1 + S2 + S3)", () => {
    expect(listGuidedSpreadsheetAdapters().map((a) => a.actionKey)).toEqual([
      "google-sheets:append_row",
      "microsoft-excel:add_row",
      "microsoft-excel:add_table_row",
      "microsoft-excel:update_row",
    ]);
  });

  it("an unregistered action falls back to the generic form", () => {
    // Google Sheets `update_row` is deliberately NOT adopted: its `range`
    // is still free-text with no tab field, and its `values` is a
    // POSITIONAL array — the opposite representation to Excel's record.
    // Mixing the two provider models in one slice would put two
    // incompatible editors behind one experience.
    expect(getGuidedSpreadsheetAdapter("google-sheets:update_row")).toBeUndefined();
    expect(getGuidedSpreadsheetAdapter("slack:send_channel_message")).toBeUndefined();
    expect(getGuidedSpreadsheetAdapter(undefined)).toBeUndefined();
  });
});

describe("Excel update_row is guided as an UPDATE, not as an append", () => {
  const adapter = getGuidedSpreadsheetAdapter("microsoft-excel:update_row")!;

  it("puts the row number in step 1, with the workbook and worksheet", () => {
    // All three together are what say WHICH CELLS get written, so they are
    // one question. Splitting the row number into step 2 would make that
    // step answer two unrelated things.
    expect(adapter.destinationFields).toEqual([
      "workbookId",
      "worksheetName",
      "rowNumber",
    ]);
  });

  it("offers no write-behavior controls, because Graph's range PATCH has none", () => {
    expect(adapter.writeBehaviorFields).toEqual([]);
    expect(adapter.recommendedValues).toBeUndefined();
    expect(adapter.dangerValues).toBeUndefined();
  });

  it("has no derived range — Excel names a worksheet directly", () => {
    expect(adapter.derivedRange).toBeUndefined();
    expect(adapter.parseResourceLink).toBeUndefined();
  });

  it("titles its steps as an edit rather than an addition", () => {
    expect(adapter.copy?.destinationTitle).toBe("Pick the row");
    expect(adapter.copy?.mappingTitle).toBe("Choose what to update");
    expect(adapter.copy?.writeTitle).toBe("Confirm how it's saved");
  });

  it("says only the chosen columns are written, and says why that is safe", () => {
    // EXCEL-UPDATE-ROW-CONCURRENCY-4 replaced the read-merge-write copy,
    // which became untrue: the step no longer writes the whole row back and
    // no longer rewrites the columns left unchanged.
    const step3 = adapter.copy?.writeEmpty ?? "";
    expect(step3).toMatch(/only the columns you chose/i);
    expect(step3).toMatch(/left out of the update/i);
    expect(step3).toMatch(/kept/i);
  });

  it("keeps the honest limit rather than over-claiming", () => {
    // An edit to a column this step IS setting can still be overwritten, so
    // the copy must not say "anything somebody else changes is safe".
    const step3 = adapter.copy?.writeEmpty ?? "";
    expect(step3).toMatch(/same column at the same moment/i);
    expect(step3).toMatch(/last change saved wins/i);
  });

  it("no longer describes a full-row rewrite", () => {
    const step3 = (adapter.copy?.writeEmpty ?? "").toLowerCase();
    for (const stale of [
      "reads the row first",
      "whole row back",
      "written back exactly as they were found",
    ]) {
      expect(step3).not.toContain(stale);
    }
  });

  it("claims no guarantee the handler does not provide", () => {
    // Verified against `updateRow.ts`: `worksheetRangePatch` sends no
    // If-Match / ETag, so the write is unconditional. Any of these words
    // would be a promise the code cannot keep.
    const step3 = (adapter.copy?.writeEmpty ?? "").toLowerCase();
    for (const overclaim of [
      "atomic",
      "transaction",
      "isolat",
      "conflict",
      "lock",
      "safely preserv",
      "guarantee",
    ]) {
      expect(step3).not.toContain(overclaim);
    }
  });
});

describe("Excel adopts the shared framework without inventing capabilities", () => {
  it.each([
    ["microsoft-excel:add_row", ["workbookId", "worksheetName"]],
    ["microsoft-excel:add_table_row", ["workbookId", "tableName"]],
  ] as const)(
    "%s asks for its own destination shape",
    (actionKey, expectedDestination) => {
      const adapter = getGuidedSpreadsheetAdapter(actionKey)!;
      expect(adapter.destinationFields).toEqual(expectedDestination);
      expect(adapter.mappingField).toBe("values");
    },
  );

  it.each([
    ["microsoft-excel:add_row"],
    ["microsoft-excel:add_table_row"],
  ] as const)(
    "%s offers NO write-behavior choices — Excel has no RAW/USER_ENTERED or insert mode",
    (actionKey) => {
      const adapter = getGuidedSpreadsheetAdapter(actionKey)!;
      // Offering radios here would be a choice that changes nothing.
      expect(adapter.writeBehaviorFields).toEqual([]);
      expect(adapter.recommendedValues).toBeUndefined();
      expect(adapter.dangerValues).toBeUndefined();
      // …and step 3 must still say something factual instead.
      expect(adapter.copy?.writeEmpty ?? "").not.toBe("");
    },
  );

  it.each([
    ["microsoft-excel:add_row"],
    ["microsoft-excel:add_table_row"],
  ] as const)(
    "%s derives no cell range — Excel addresses its destination by name",
    (actionKey) => {
      expect(getGuidedSpreadsheetAdapter(actionKey)!.derivedRange).toBeUndefined();
    },
  );

  it("does not offer link pasting for Excel, where a share link is not a workbook id", () => {
    // A OneDrive share URL does not carry the driveItem id the picker uses,
    // so a "paste a link" affordance could not honour its promise.
    expect(
      getGuidedSpreadsheetAdapter("microsoft-excel:add_row")!.parseResourceLink,
    ).toBeUndefined();
    expect(
      getGuidedSpreadsheetAdapter("microsoft-excel:add_table_row")!
        .parseResourceLink,
    ).toBeUndefined();
  });

  it("keeps Sheets' write behavior untouched by the Excel adoption", () => {
    const sheets = getGuidedSpreadsheetAdapter("google-sheets:append_row")!;
    expect(sheets.writeBehaviorFields).toEqual([
      "valueInputOption",
      "insertDataOption",
    ]);
    expect(sheets.derivedRange).toEqual({
      fromField: "sheetName",
      intoField: "range",
    });
  });
});

describe("validateGuidedAdapter catches a mis-authored adapter", () => {
  const base: GuidedSpreadsheetAdapter = {
    actionKey: "google-sheets:append_row",
    destinationFields: ["spreadsheetId", "sheetName"],
    mappingField: "values",
    writeBehaviorFields: ["valueInputOption"],
  };

  it("reports a destination field that does not exist", () => {
    const problems = validateGuidedAdapter(
      { ...base, destinationFields: ["spreadsheetId", "tabName"] },
      googleSheetsAppendRowMeta,
    );
    expect(problems.join(" ")).toMatch(/tabName/);
  });

  it("reports a mapping field that is not the column-aware editor", () => {
    const problems = validateGuidedAdapter(
      { ...base, mappingField: "range" },
      googleSheetsAppendRowMeta,
    );
    expect(problems.join(" ")).toMatch(/expected 'spreadsheet-rows'/);
  });

  it("reports a recommended value that is not one of the field's options", () => {
    const problems = validateGuidedAdapter(
      { ...base, recommendedValues: { valueInputOption: "PARSE_IT" } },
      googleSheetsAppendRowMeta,
    );
    expect(problems.join(" ")).toMatch(/PARSE_IT/);
  });

  it("reports a derived range written into a field that is still on the normal path", () => {
    // Deriving into a NON-advanced field would show the user a value they
    // did not type, in a box they are expected to fill in.
    const problems = validateGuidedAdapter(
      {
        ...base,
        derivedRange: { fromField: "sheetName", intoField: "spreadsheetId" },
      },
      googleSheetsAppendRowMeta,
    );
    expect(problems.join(" ")).toMatch(/should be advanced/);
  });

  it("reports a derived range sourced from outside the destination step", () => {
    const problems = validateGuidedAdapter(
      {
        ...base,
        derivedRange: { fromField: "valueInputOption", intoField: "range" },
      },
      googleSheetsAppendRowMeta,
    );
    expect(problems.join(" ")).toMatch(/must be one of destinationFields/);
  });

  it("accepts the shipped Sheets adapter unchanged", () => {
    const shipped = getGuidedSpreadsheetAdapter("google-sheets:append_row")!;
    expect(validateGuidedAdapter(shipped, googleSheetsAppendRowMeta)).toEqual([]);
  });
});

describe("parseGoogleSheetsLink — pasting a link instead of searching", () => {
  it.each([
    [
      "https://docs.google.com/spreadsheets/d/1aBcD-efG_h123/edit#gid=0",
      "1aBcD-efG_h123",
    ],
    [
      "https://docs.google.com/spreadsheets/d/1aBcD-efG_h123/edit?usp=sharing",
      "1aBcD-efG_h123",
    ],
    ["docs.google.com/spreadsheets/d/1aBcD-efG_h123", "1aBcD-efG_h123"],
    ["  https://docs.google.com/spreadsheets/d/1aBcD-efG_h123/  ", "1aBcD-efG_h123"],
  ])("extracts the spreadsheet id from %s", (url, expected) => {
    expect(parseGoogleSheetsLink(url)).toEqual({
      field: "spreadsheetId",
      value: expected,
    });
  });

  it("accepts a bare spreadsheet id — pasting the id is the same intent", () => {
    expect(parseGoogleSheetsLink("1aBcDeFgHiJkLmNoPqRsTuVwXyZ")).toEqual({
      field: "spreadsheetId",
      value: "1aBcDeFgHiJkLmNoPqRsTuVwXyZ",
    });
  });

  it.each([
    [""],
    ["   "],
    ["https://example.com/not-a-sheet"],
    ["https://docs.google.com/document/d/1aBcD-efG_h123/edit"],
    ["Q4 Forecast"],
  ])("refuses to guess a destination from %s", (input) => {
    expect(parseGoogleSheetsLink(input)).toBeNull();
  });

  it("never takes a tab from the gid fragment", () => {
    // gid identifies a tab numerically; the tab picker keys on TITLE. Turning
    // a gid into a tab name would require a guess.
    const parsed = parseGoogleSheetsLink(
      "https://docs.google.com/spreadsheets/d/1aBcD-efG_h123/edit#gid=87654321",
    );
    expect(parsed).toEqual({ field: "spreadsheetId", value: "1aBcD-efG_h123" });
  });
});
