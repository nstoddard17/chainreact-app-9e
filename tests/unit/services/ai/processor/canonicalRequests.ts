import { join } from "node:path";

import type { DocumentTextPayload } from "@/contracts/aiProcessing";
import type { AiProcessRequest } from "@/services/ai/processor/types";

/**
 * The canonical AiProcessRequest examples behind the committed gateway
 * request fixtures (tests/fixtures/ai-processor/request.*.json). The
 * parity test regenerates bodies from these and compares byte-for-byte
 * content equality with the fixtures — the fixtures are the Render
 * repo's contract inputs, so drift fails the build here first.
 */
export const FIXTURES_DIR = join(__dirname, "../../../../fixtures/ai-processor");

const PAYROLL_DOCUMENT: DocumentTextPayload = {
  name: "payroll-june.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  truncated: false,
  segments: [
    {
      label: "Sheet: Payroll",
      text: "Employee | Regular Hours | Overtime Hours\nAlice Johnson | 40 | 2\nCarol Diaz | 40 | 6",
    },
  ],
};

export const CANONICAL_REQUESTS: Record<
  string,
  { request: AiProcessRequest; requestId: string }
> = {
  "analyze-extract-rows": {
    requestId: "aip-fixture-0000-0000-000000000001",
    request: {
      task: "analyze_document",
      mode: "extract_rows",
      instructions: "Extract one row per employee.",
      document: PAYROLL_DOCUMENT,
      schema: {
        fields: [
          { name: "employee_name", type: "string", required: true },
          { name: "overtime_hours", type: "number", description: "Overtime hours" },
        ],
      },
      limits: { maxRows: 100, maxOutputTokens: 4000 },
    },
  },
  "transform-with-destination-context": {
    requestId: "aip-fixture-0000-0000-000000000002",
    request: {
      task: "transform_data",
      instructions: "Map the fleet sheet into vehicles.",
      inputJson: '[{"Unit":"Truck 12","VIN":"1FTSW21R08EB12345"}]',
      outputShape: "rows",
      schema: {
        fields: [
          { name: "vehicle_name", type: "string", required: true },
          { name: "vin", type: "string", required: true, description: "17-char VIN" },
        ],
      },
      destinationContext: {
        action: "fleetio:create_vehicle",
        displayName: "Create Vehicle",
        fields: [
          { name: "vehicle_name", label: "Vehicle name", type: "string", required: true },
          { name: "vin", label: "VIN", type: "string", required: true, helpText: "17 characters" },
        ],
      },
      limits: { maxRows: 100, maxOutputTokens: 4000 },
    },
  },
  "suggest-schema": {
    requestId: "aip-fixture-0000-0000-000000000003",
    request: {
      task: "suggest_schema",
      document: PAYROLL_DOCUMENT,
      limits: { maxRows: 100, maxOutputTokens: 2000 },
    },
  },
};
