/**
 * SPREADSHEET-CONFIG-REDESIGN-1 — pure save-shape contract of the
 * spreadsheet row editor. The editor renders cells; the SAVED config
 * must keep the exact shapes the Excel runtime schema already accepts
 * (`values` positional string[] XOR `rows` header-keyed records) — so
 * every commit path is round-tripped here against AddRowConfigSchema.
 */
import {
  batchRowsToGrid,
  cellsToPositionalValues,
  dropEmptyBatchRecords,
  gridToBatchRows,
  positionalValuesToCells,
} from "@/features/workflow-builder/config-modal/fields/spreadsheet/_serialize";
import { AddRowConfigSchema } from "@/integrations/microsoft-excel/actions/addRow.schema";

const DESTINATION = { workbookId: "wb-1", worksheetName: "Sheet1" };

describe("cellsToPositionalValues (one-row save shape)", () => {
  it("keeps in-between blanks as empty strings so later columns stay aligned", () => {
    expect(cellsToPositionalValues(["Ada", "", "note"])).toEqual([
      "Ada",
      "",
      "note",
    ]);
  });

  it("trims trailing blanks (the handler pads the tail to the sheet's width)", () => {
    expect(cellsToPositionalValues(["Ada", "x", "", ""])).toEqual(["Ada", "x"]);
  });

  it("returns undefined when every cell is blank (optional key drops out for the XOR refine)", () => {
    expect(cellsToPositionalValues(["", "  ", ""])).toBeUndefined();
    expect(cellsToPositionalValues([])).toBeUndefined();
  });

  it("commits a shape AddRowConfigSchema accepts", () => {
    const config = {
      ...DESTINATION,
      values: cellsToPositionalValues(["Ada", "", "ada@example.com"]),
    };
    expect(() => AddRowConfigSchema.parse(config)).not.toThrow();
  });
});

describe("positionalValuesToCells (one-row hydration)", () => {
  it("pads to the column count and stringifies numbers/booleans", () => {
    expect(positionalValuesToCells(["Ada", 5, true], 5)).toEqual([
      "Ada",
      "5",
      "true",
      "",
      "",
    ]);
  });

  it("non-array values hydrate as all-blank cells", () => {
    expect(positionalValuesToCells(undefined, 2)).toEqual(["", ""]);
    expect(positionalValuesToCells("oops", 2)).toEqual(["", ""]);
  });
});

describe("gridToBatchRows (several-rows save shape)", () => {
  const COLUMNS = ["Name", "Email", "Notes"];

  it("keys filled cells by column name and omits blanks (the handler nulls unnamed columns)", () => {
    expect(
      gridToBatchRows(COLUMNS, [
        ["Ada", "ada@example.com", ""],
        ["Grace", "", "pioneer"],
      ]),
    ).toEqual([
      { Name: "Ada", Email: "ada@example.com" },
      { Name: "Grace", Notes: "pioneer" },
    ]);
  });

  it("skips all-blank rows (the runtime schema rejects empty records) and returns undefined when nothing is left", () => {
    expect(
      gridToBatchRows(COLUMNS, [
        ["", "", ""],
        ["Ada", "", ""],
      ]),
    ).toEqual([{ Name: "Ada" }]);
    expect(gridToBatchRows(COLUMNS, [["", "", ""]])).toBeUndefined();
    expect(gridToBatchRows(COLUMNS, [])).toBeUndefined();
  });

  it("commits a shape AddRowConfigSchema accepts", () => {
    const config = {
      ...DESTINATION,
      rows: gridToBatchRows(COLUMNS, [
        ["Ada", "ada@example.com", ""],
        ["", "grace@example.com", ""],
      ]),
    };
    expect(() => AddRowConfigSchema.parse(config)).not.toThrow();
  });
});

describe("batchRowsToGrid (several-rows hydration)", () => {
  it("aligns records back onto the column list, blank for missing columns", () => {
    expect(
      batchRowsToGrid(
        ["Name", "Email"],
        [{ Name: "Ada" }, { Email: "g@example.com", Name: "Grace" }],
      ),
    ).toEqual([
      ["Ada", ""],
      ["Grace", "g@example.com"],
    ]);
  });

  it("ignores non-record entries and non-array values", () => {
    expect(batchRowsToGrid(["Name"], [null, "x", ["arr"], { Name: "Ada" }])).toEqual([
      ["Ada"],
    ]);
    expect(batchRowsToGrid(["Name"], undefined)).toEqual([]);
  });
});

describe("dropEmptyBatchRecords (manual fallback commit)", () => {
  it("drops schema-invalid empty records and returns undefined when nothing is left", () => {
    expect(dropEmptyBatchRecords([{ Name: "Ada" }, {}])).toEqual([
      { Name: "Ada" },
    ]);
    expect(dropEmptyBatchRecords([{}])).toBeUndefined();
    expect(dropEmptyBatchRecords(undefined)).toBeUndefined();
  });

  it("kept records still satisfy AddRowConfigSchema", () => {
    const config = {
      ...DESTINATION,
      rows: dropEmptyBatchRecords([{ Name: "Ada" }, {}]),
    };
    expect(() => AddRowConfigSchema.parse(config)).not.toThrow();
  });
});
