/**
 * @jest-environment node
 *
 * Tests for the Excel `delete_worksheet` config schema. Pins the
 * single-worksheet contract from parity-microsoft-excel.md §7 and
 * Marcus's audit acceptance (no bulk, no fallback).
 */
import { DeleteWorksheetConfigSchema } from "@/integrations/microsoft-excel/actions/deleteWorksheet.schema";

describe("DeleteWorksheetConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(true);
  });

  it("rejects when workbookId is missing", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing (no silent fallback)", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
      }).success,
    ).toBe(false);
  });

  it("rejects bulk-array form (no bulk delete)", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetNames: ["Sheet1", "Sheet2"],
      }).success,
    ).toBe(false);
  });

  it("rejects worksheetId variant (V2 convention is worksheetName)", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetId: "ws-1",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      DeleteWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });
});
