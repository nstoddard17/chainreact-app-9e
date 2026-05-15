/**
 * @jest-environment node
 *
 * Tests for the Excel `rename_worksheet` config schema. Pins the
 * required-field contract from parity-microsoft-excel.md §7 and
 * Marcus's audit acceptance.
 */
import { RenameWorksheetConfigSchema } from "@/integrations/microsoft-excel/actions/renameWorksheet.schema";

describe("RenameWorksheetConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(true);
  });

  it("rejects when workbookId is missing", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when workbookId is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is missing (no silent fallback to first worksheet)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when worksheetName is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName is missing", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName is empty string", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "",
      }).success,
    ).toBe(false);
  });

  it("rejects when newWorksheetName exceeds 31 characters (Excel limit)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "x".repeat(32),
      }).success,
    ).toBe(false);
  });

  it("accepts newWorksheetName at exactly 31 characters", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "x".repeat(31),
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields generally (strict mode)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetName: "Sheet1",
        newWorksheetName: "Renamed",
        xCustom: "v",
      }).success,
    ).toBe(false);
  });

  it("rejects V1 `oldName` (V2 uses `worksheetName` as the address)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        oldName: "Sheet1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });

  it("rejects worksheetId variant (V2 convention is worksheetName)", () => {
    expect(
      RenameWorksheetConfigSchema.safeParse({
        workbookId: "wb-1",
        worksheetId: "ws-1",
        newWorksheetName: "Renamed",
      }).success,
    ).toBe(false);
  });
});
