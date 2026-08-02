/**
 * Lossless round-trip of a COLUMN-KEYED row value
 * (EXCEL-GUIDED-CONFIG-2).
 *
 * `microsoft-excel:add_table_row` accepts `values` as either a positional
 * array or a record keyed by column name, and the handler treats them
 * DIFFERENTLY:
 *
 *   - a positional array is sent to Graph verbatim, already aligned;
 *   - a record is aligned by NAME against `/tables/{name}/columns`,
 *     sorted by Graph index, with `null` for columns it does not mention.
 *
 * The `microsoft-excel:table_columns` resolver does NOT apply that sort.
 * So converting a saved record into positional cells using resolver order
 * could put a value in the wrong column — silently, on every run. These
 * helpers therefore exist to keep each representation as it was, and this
 * suite is the proof that they do.
 */

import {
  cellsToPositionalValues,
  cellsToRecordValues,
  isRecordRowValue,
  positionalValuesToCells,
  recordValuesToCells,
} from "@/features/workflow-builder/config-modal/fields/spreadsheet/_serialize";
import { AddTableRowConfigSchema } from "@/integrations/microsoft-excel/actions/addTableRow.schema";

const COLUMNS = ["Name", "Email", "Notes"];

describe("isRecordRowValue distinguishes the two valid representations", () => {
  it.each([
    [{ Name: "Ada" }, true],
    [{}, true],
    [["Ada"], false],
    [[], false],
    [null, false],
    [undefined, false],
    ["Ada", false],
  ])("classifies %p as record=%s", (value, expected) => {
    expect(isRecordRowValue(value)).toBe(expected);
  });
});

describe("a column-keyed record survives the editor unchanged", () => {
  it("lays the record out against the detected columns, by name", () => {
    const cells = recordValuesToCells(
      { Name: "Ada", Notes: "pioneer" },
      COLUMNS,
    );
    // Email is genuinely absent — an empty cell, not a shifted value.
    expect(cells).toEqual(["Ada", "", "pioneer"]);
  });

  it("round-trips a record without changing a single key", () => {
    const saved = { Name: "Ada", Notes: "pioneer" };
    const cells = recordValuesToCells(saved, COLUMNS);
    expect(cellsToRecordValues(cells, COLUMNS)).toEqual(saved);
  });

  it("keeps values attached to their column name even when the column ORDER differs", () => {
    // This is the whole reason records are not converted to positional:
    // the resolver's order and the handler's sorted order need not agree.
    const saved = { Name: "Ada", Email: "ada@example.test" };
    const asListed = recordValuesToCells(saved, ["Name", "Email", "Notes"]);
    const asReordered = recordValuesToCells(saved, ["Email", "Notes", "Name"]);
    expect(cellsToRecordValues(asListed, ["Name", "Email", "Notes"])).toEqual(
      saved,
    );
    expect(cellsToRecordValues(asReordered, ["Email", "Notes", "Name"])).toEqual(
      saved,
    );
  });

  it("stringifies numbers and booleans for display without inventing content", () => {
    expect(recordValuesToCells({ Name: 42, Email: false }, COLUMNS)).toEqual([
      "42",
      "false",
      "",
    ]);
  });

  it("omits a column the user deliberately blanked, rather than writing an empty string", () => {
    // The handler fills unnamed columns with null; an empty string would be
    // a different, visible value in the sheet.
    expect(cellsToRecordValues(["Ada", "   ", ""], COLUMNS)).toEqual({
      Name: "Ada",
    });
  });

  it("drops the key entirely when every column is blank", () => {
    // `{}` would fail the runtime schema's non-empty expectations.
    expect(cellsToRecordValues(["", "", ""], COLUMNS)).toBeUndefined();
  });
});

describe("both representations remain valid runtime configurations", () => {
  const base = { workbookId: "wb-1", tableName: "Orders" };

  it("accepts the record shape the editor commits", () => {
    const values = cellsToRecordValues(["Ada", "", "pioneer"], COLUMNS);
    expect(() =>
      AddTableRowConfigSchema.parse({ ...base, values }),
    ).not.toThrow();
  });

  it("accepts the positional shape the editor commits for a new config", () => {
    const values = cellsToPositionalValues(["Ada", "", "pioneer"]);
    expect(() =>
      AddTableRowConfigSchema.parse({ ...base, values }),
    ).not.toThrow();
  });

  it("keeps a positional value positional — never upgraded to a record", () => {
    const cells = positionalValuesToCells(["Ada", "", "pioneer"], 3);
    expect(cellsToPositionalValues(cells)).toEqual(["Ada", "", "pioneer"]);
  });
});
