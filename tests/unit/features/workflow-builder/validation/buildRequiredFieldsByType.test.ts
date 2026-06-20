/**
 * Tests for buildRequiredFieldsByType (BUILDER-READINESS).
 * Derives the required-field lookup from action/trigger metadata.
 */
import type { ActionMeta } from "@/contracts/actionMeta";
import type { TriggerMeta } from "@/contracts/triggerMeta";
import { buildRequiredFieldsByType } from "@/features/workflow-builder/validation/buildRequiredFieldsByType";

const action = {
  key: "native:http_request",
  provider: "native",
  type: "http_request",
  displayName: "HTTP Request",
  fields: [
    { name: "method", label: "Method", type: "select", required: true },
    { name: "url", label: "URL", type: "text", required: true },
    { name: "body", label: "Request Body", type: "textarea", required: false },
  ],
} as unknown as ActionMeta;

// A required field that declares a defaultValue — e.g. google-sheets:read_rows
// `majorDimension` (enum default "ROWS"). It is required but always satisfiable
// by its default, so the requirement must carry `hasDefault: true`.
const defaultedAction = {
  key: "google-sheets:read_rows",
  provider: "google-sheets",
  type: "read_rows",
  displayName: "Read Rows",
  fields: [
    { name: "spreadsheetId", label: "Spreadsheet", type: "combobox", required: true },
    { name: "majorDimension", label: "Major dimension", type: "select", required: true, defaultValue: "ROWS" },
  ],
} as unknown as ActionMeta;

const trigger = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Run",
  fields: [],
} as unknown as TriggerMeta;

describe("buildRequiredFieldsByType", () => {
  it("keys by provider:type and keeps only required fields with name+label+hasDefault", () => {
    const map = buildRequiredFieldsByType([action], [trigger]);
    expect(map["native:http_request"]).toEqual({
      displayName: "HTTP Request",
      requiredFields: [
        { name: "method", label: "Method", hasDefault: false },
        { name: "url", label: "URL", hasDefault: false },
      ],
    });
  });

  it("flags a required field that declares a defaultValue with hasDefault: true", () => {
    const map = buildRequiredFieldsByType([defaultedAction], []);
    expect(map["google-sheets:read_rows"]?.requiredFields).toEqual([
      { name: "spreadsheetId", label: "Spreadsheet", hasDefault: false },
      { name: "majorDimension", label: "Major dimension", hasDefault: true },
    ]);
  });

  it("includes types with no required fields (empty list)", () => {
    const map = buildRequiredFieldsByType([action], [trigger]);
    expect(map["native:manual.run"]).toEqual({
      displayName: "Manual Run",
      requiredFields: [],
    });
  });
});
