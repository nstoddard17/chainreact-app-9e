/**
 * @jest-environment node
 *
 * Tests for the Excel `update_row` config schema. Pins the
 * required-field set + strict-mode V1-field rejection from
 * parity-microsoft-excel.md §7 + Marcus's audit acceptance.
 */
import { UpdateRowConfigSchema } from "@/integrations/microsoft-excel/actions/updateRow.schema";

describe("UpdateRowConfigSchema", () => {
  it("accepts a minimal valid config (workbookId + worksheetName + rowNumber + values)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(true);
  });

  it("accepts mixed cell-value types (string / number / boolean / null)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: {
          Name: "Alice",
          Age: 30,
          Active: true,
          Notes: null,
        },
      }).success,
    ).toBe(true);
  });

  // Required fields

  it("rejects when workbookId is missing", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        rowNumber: 5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        rowNumber: 5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects when rowNumber is missing", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects rowNumber < 1 (must be 1-based)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 0,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer rowNumber", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5.5,
        values: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects when values is missing", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects when values is an empty object (no columns to update)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: {},
      }).success,
    ).toBe(false);
  });

  it("rejects when a values key is empty string", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { "": "Alice" },
      }).success,
    ).toBe(false);
  });

  // V1 field rejection (.strict)

  it("rejects V1 `matchColumn` / `matchValue` search fields", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
        matchColumn: "Email",
        matchValue: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `updateMultiple` toggle", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
        updateMultiple: true,
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `updateMapping` field (V2 uses `values` instead)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        updateMapping: { Name: "Alice" },
      }).success,
    ).toBe(false);
  });

  it("rejects V1 flat `column_*` fields", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
        column_Email: "alice@example.com",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      UpdateRowConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        rowNumber: 5,
        values: { Name: "Alice" },
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
