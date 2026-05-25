/**
 * @jest-environment node
 *
 * Tests for the Excel `delete_row` config schema. Pins the
 * single-row-only contract from parity-microsoft-excel.md §7 +
 * Marcus's audit acceptance ("No hidden bulk delete / No
 * search-query delete / No silent no-op").
 */
import { DeleteRowConfigSchema } from "@/integrations/microsoft-excel/actions/deleteRow.schema";

describe("DeleteRowConfigSchema", () => {
  it("accepts a valid config (workbookId + worksheetName + rowNumber)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(true);
  });

  // Required fields

  it("rejects when workbookId is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when rowNumber is missing", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects rowNumber < 1 (must be 1-based)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer rowNumber", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5.5,
      }).success,
    ).toBe(false);
  });

  // V1 field rejection (.strict + bulk / search modes dropped)

  it("rejects V1 `deleteBy` discriminator", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        deleteBy: "row_number",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `startRow` / `endRow` range-delete fields", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        startRow: 5,
        endRow: 10,
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `matchColumn` / `matchValue` / `deleteMultiple` search-then-delete fields", () => {
    for (const dropped of ["matchColumn", "matchValue", "deleteMultiple"]) {
      const r = DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        [dropped]: "x",
      });
      expect(r.success).toBe(false);
    }
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      DeleteRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
