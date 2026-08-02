/**
 * Readiness checklists for the guided spreadsheet actions
 * (SHEETS-GUIDED-CONFIG-1 · EXCEL-GUIDED-CONFIG-2).
 *
 * The banner and the guided accordion answer the same question — "what
 * is left to do?" — from the same values, so they must never disagree.
 * The rule that matters most here is the one a naive implementation gets
 * wrong: a destination column left DELIBERATELY blank is a finished
 * state, not missing configuration. Blocking on it would force people to
 * invent values for columns they meant to leave empty.
 */

import { computeConfigReadiness } from "@/features/workflow-builder/config-modal/readiness/computeConfigReadiness";
import { getReadinessAdapter } from "@/features/workflow-builder/config-modal/readiness/adapters";
import { microsoftExcelAddTableRowMeta } from "@/integrations/microsoft-excel/actions/addTableRow.meta";
import { microsoftExcelAddRowMeta } from "@/integrations/microsoft-excel/actions/addRow.meta";

function readiness(
  metaKey: string,
  fields: typeof microsoftExcelAddTableRowMeta.fields,
  values: Record<string, unknown>,
) {
  return computeConfigReadiness({
    metaKey,
    nodeKind: "action",
    fields,
    values,
    errors: {},
    blockedFieldCount: 0,
  });
}

const TABLE_KEY = "microsoft-excel:add_table_row";
const TABLE_FIELDS = microsoftExcelAddTableRowMeta.fields;

describe("microsoft-excel:add_table_row readiness", () => {
  it("has an adapter, so the banner speaks about tables rather than field names", () => {
    expect(getReadinessAdapter(TABLE_KEY)).toBeDefined();
  });

  it("names the destination as one decision while it is incomplete", () => {
    const labels = readiness(TABLE_KEY, TABLE_FIELDS, {}).items.map(
      (i) => i.label,
    );
    expect(labels).toContain("Pick a workbook and table");
    expect(labels).toContain("Fill in at least one column");
  });

  it("does not call the destination done with only a workbook", () => {
    const result = readiness(TABLE_KEY, TABLE_FIELDS, {
      workbookId: "wb-1",
    });
    const destination = result.items.find((i) =>
      i.label.includes("workbook"),
    )!;
    expect(destination.done).toBe(false);
  });

  it("accepts EITHER valid row representation as filled in", () => {
    // The action's schema takes a positional array or a column-keyed
    // record; readiness must not quietly demand the positional one.
    for (const values of [
      { workbookId: "wb-1", tableName: "Orders", values: ["Ada"] },
      { workbookId: "wb-1", tableName: "Orders", values: { Name: "Ada" } },
    ]) {
      const result = readiness(TABLE_KEY, TABLE_FIELDS, values);
      expect(result.items.every((i) => i.done)).toBe(true);
      expect(result.status).toBe("ready");
    }
  });

  it("treats a row with deliberately blank columns as finished", () => {
    // Only the middle column is filled; the others were left empty on
    // purpose and the handler writes null for them.
    const result = readiness(TABLE_KEY, TABLE_FIELDS, {
      workbookId: "wb-1",
      tableName: "Orders",
      values: ["", "ada@example.test", ""],
    });
    expect(result.status).toBe("ready");
  });

  it("stays incomplete when nothing at all was mapped", () => {
    for (const values of [
      { workbookId: "wb-1", tableName: "Orders", values: [] },
      { workbookId: "wb-1", tableName: "Orders", values: {} },
      { workbookId: "wb-1", tableName: "Orders" },
    ]) {
      expect(readiness(TABLE_KEY, TABLE_FIELDS, values).status).toBe(
        "incomplete",
      );
    }
  });

  it("never asks for a write-behavior choice Excel does not have", () => {
    const labels = readiness(TABLE_KEY, TABLE_FIELDS, {}).items.map((i) =>
      i.label.toLowerCase(),
    );
    for (const label of labels) {
      expect(label).not.toMatch(/how the values|parse|plain text|overwrite/);
    }
  });
});

describe("microsoft-excel:add_row readiness is unchanged by the Excel adoption", () => {
  it("still spans the either-or row shapes the composite editor manages", () => {
    const fields = microsoftExcelAddRowMeta.fields;
    const key = "microsoft-excel:add_row";
    expect(
      readiness(key, fields, {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: ["Ada"],
      }).status,
    ).toBe("ready");
    expect(
      readiness(key, fields, {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rows: [{ Name: "Ada" }],
      }).status,
    ).toBe("ready");
    expect(
      readiness(key, fields, { workbookId: "wb-1", worksheetName: "Sheet1" })
        .status,
    ).toBe("incomplete");
  });
});
