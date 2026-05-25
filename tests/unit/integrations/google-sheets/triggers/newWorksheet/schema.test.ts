/**
 * @jest-environment node
 */
import { NewWorksheetInputConfigSchema } from "@/integrations/google-sheets/triggers/newWorksheet/schema";

describe("NewWorksheetInputConfigSchema", () => {
  it("accepts the minimal valid config (spreadsheetId only)", () => {
    const result = NewWorksheetInputConfigSchema.parse({
      spreadsheetId: "ss-1",
    });
    expect(result).toEqual({ spreadsheetId: "ss-1" });
  });

  it("rejects missing spreadsheetId", () => {
    expect(() => NewWorksheetInputConfigSchema.parse({})).toThrow(
      /spreadsheetId/,
    );
  });

  it("rejects empty spreadsheetId", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({ spreadsheetId: "" }),
    ).toThrow();
  });

  it("rejects unknown fields (.strict())", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        extraField: "anything",
      }),
    ).toThrow();
  });

  it("rejects V1 polling chrome — hasHeaders", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        hasHeaders: true,
      }),
    ).toThrow();
  });

  it("rejects V1 polling chrome — googleSheetsWorksheetSnapshot", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        googleSheetsWorksheetSnapshot: { sheets: [] },
      }),
    ).toThrow();
  });

  it("rejects row_changed-only fields that would be confusing on a new_worksheet trigger", () => {
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
      }),
    ).toThrow();
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        changeKinds: ["added"],
      }),
    ).toThrow();
    expect(() =>
      NewWorksheetInputConfigSchema.parse({
        spreadsheetId: "ss-1",
        keyColumn: "id",
      }),
    ).toThrow();
  });
});
