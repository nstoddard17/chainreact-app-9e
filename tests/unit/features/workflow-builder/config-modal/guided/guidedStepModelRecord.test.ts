/**
 * Guided step model — the two shared changes record mode required
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * Both are provider-agnostic and both were REAL gaps rather than polish:
 *
 *   1. A NUMBER destination field contributed nothing to the collapsed
 *      step-1 summary, because the summary read strings only. An update
 *      action's row number is part of what names the destination, so the
 *      step would have read "Invoices.xlsx · Sheet1" while quietly hiding
 *      that the user had also chosen row 42.
 *   2. Step 2's summary counted FILLED CELLS, which is the wrong question
 *      for an update: "2 of 12 columns filled in" reads as ten unfinished
 *      columns when leaving them alone is the entire point.
 *
 * Both are driven by declared field metadata, never by an action key.
 */
import { buildGuidedSteps } from "@/features/workflow-builder/config-modal/guided/guidedStepModel";
import type { GuidedSpreadsheetAdapter } from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
import type { FieldMeta } from "@/contracts/actionMeta";

const RECORD_FIELDS: FieldMeta[] = [
  { name: "workbookId", label: "Workbook", type: "combobox", required: true },
  { name: "worksheetName", label: "Worksheet", type: "combobox", required: true },
  { name: "rowNumber", label: "Row number", type: "number", required: true },
  {
    name: "values",
    label: "Columns",
    type: "spreadsheet-rows",
    required: true,
    valueShape: "record",
  },
];

const RECORD_ADAPTER = {
  actionKey: "microsoft-excel:update_row",
  destinationFields: ["workbookId", "worksheetName", "rowNumber"],
  mappingField: "values",
  writeBehaviorFields: [],
} as GuidedSpreadsheetAdapter;

const POSITIONAL_FIELDS: FieldMeta[] = [
  { name: "workbookId", label: "Workbook", type: "combobox", required: true },
  { name: "worksheetName", label: "Worksheet", type: "combobox", required: true },
  {
    name: "values",
    label: "Row values",
    type: "spreadsheet-rows",
    required: false,
  },
];

const POSITIONAL_ADAPTER = {
  actionKey: "microsoft-excel:add_row",
  destinationFields: ["workbookId", "worksheetName"],
  mappingField: "values",
  writeBehaviorFields: [],
} as GuidedSpreadsheetAdapter;

function recordSteps(values: Record<string, unknown>, columnCount?: number) {
  return buildGuidedSteps({
    adapter: RECORD_ADAPTER,
    fields: RECORD_FIELDS,
    values,
    ...(columnCount !== undefined && { columnCount }),
  });
}

describe("a number destination field appears in the collapsed summary", () => {
  it("includes the row number alongside the workbook and worksheet", () => {
    const [destination] = recordSteps({
      workbookId: "Invoices.xlsx",
      worksheetName: "Sheet1",
      rowNumber: 42,
    });
    expect(destination!.summary).toBe("Invoices.xlsx · Sheet1 · 42");
  });

  it("does not drop a legitimate zero", () => {
    const [destination] = recordSteps({ workbookId: "wb", rowNumber: 0 });
    expect(destination!.summary).toBe("wb · 0");
  });

  it("stays quiet about a value it cannot summarise honestly", () => {
    const [destination] = recordSteps({
      workbookId: "wb",
      rowNumber: Number.NaN,
    });
    expect(destination!.summary).toBe("wb");
  });

  it("counts the row number toward step-1 completion", () => {
    const [withoutRow] = recordSteps({ workbookId: "wb", worksheetName: "s" });
    expect(withoutRow!.complete).toBe(false);
    const [withRow] = recordSteps({
      workbookId: "wb",
      worksheetName: "s",
      rowNumber: 2,
    });
    expect(withRow!.complete).toBe(true);
  });
});

describe("a record mapping summarises CHANGES, not filled cells", () => {
  it("says how many columns will change out of the ones detected", () => {
    const [, mapping] = recordSteps(
      { values: { Name: "Ada", Notes: "" } },
      12,
    );
    expect(mapping!.summary).toBe("2 of 12 columns will change");
  });

  it("counts a deliberate clear as a change — an empty string is a write", () => {
    const [, mapping] = recordSteps({ values: { Notes: "" } }, 3);
    expect(mapping!.summary).toBe("1 of 3 columns will change");
  });

  it("falls back to a bare count before the columns are known", () => {
    const [, mapping] = recordSteps({ values: { Name: "Ada" } });
    expect(mapping!.summary).toBe("1 column will change");
  });

  it("states zero rather than going blank once the columns are known", () => {
    // Matches what the append summary already does with a known column
    // count ("0 of 4 columns filled in") — "0 of 12 columns will change"
    // is a fact about a real worksheet, and more useful than a fallback
    // hint that says nothing about how big the sheet is.
    expect(recordSteps({}, 12)[1]!.summary).toBe("0 of 12 columns will change");
  });

  it("says nothing at all before the columns are known", () => {
    expect(recordSteps({})[1]!.summary).toBe("");
  });

  it("is incomplete until at least one column changes", () => {
    expect(recordSteps({}, 12)[1]!.complete).toBe(false);
    expect(recordSteps({ values: { Name: "Ada" } }, 12)[1]!.complete).toBe(true);
  });
});

describe("append actions are untouched by either change", () => {
  it("still counts filled cells and still says 'filled in'", () => {
    const [, mapping] = buildGuidedSteps({
      adapter: POSITIONAL_ADAPTER,
      fields: POSITIONAL_FIELDS,
      values: { values: ["Ada", "", "pioneer"] },
      columnCount: 4,
    });
    expect(mapping!.summary).toBe("2 of 4 columns filled in");
  });

  it("still summarises string destinations exactly as before", () => {
    const [destination] = buildGuidedSteps({
      adapter: POSITIONAL_ADAPTER,
      fields: POSITIONAL_FIELDS,
      values: { workbookId: "Invoices.xlsx", worksheetName: "Sheet1" },
    });
    expect(destination!.summary).toBe("Invoices.xlsx · Sheet1");
  });
});
