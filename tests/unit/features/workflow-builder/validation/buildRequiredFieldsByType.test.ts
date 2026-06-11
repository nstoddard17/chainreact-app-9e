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

const trigger = {
  key: "native:manual.run",
  provider: "native",
  type: "manual.run",
  displayName: "Manual Run",
  fields: [],
} as unknown as TriggerMeta;

describe("buildRequiredFieldsByType", () => {
  it("keys by provider:type and keeps only required fields with name+label", () => {
    const map = buildRequiredFieldsByType([action], [trigger]);
    expect(map["native:http_request"]).toEqual({
      displayName: "HTTP Request",
      requiredFields: [
        { name: "method", label: "Method" },
        { name: "url", label: "URL" },
      ],
    });
  });

  it("includes types with no required fields (empty list)", () => {
    const map = buildRequiredFieldsByType([action], [trigger]);
    expect(map["native:manual.run"]).toEqual({
      displayName: "Manual Run",
      requiredFields: [],
    });
  });
});
