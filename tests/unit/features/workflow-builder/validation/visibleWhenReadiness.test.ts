/** @jest-environment node */
/**
 * CONFIG-UX-SETUP-ADVANCED-1 — readiness is visibility-aware.
 *
 * A required field hidden by an unmet top-level `visibleWhen` is not a
 * setup gap; it becomes required the moment the revealing mode is chosen.
 * Shared core (`missingRequiredFields`) — the builder chips, validation
 * drawer, and server execution readiness all flow through this.
 */
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import type { ActionMeta, FieldMeta } from "@/contracts/actionMeta";
import type { WorkflowNode } from "@/contracts/workflow";

const meta: ActionMeta = {
  key: "acme:send",
  provider: "acme",
  type: "send",
  displayName: "Send Thing",
  description: "Send a thing.",
  category: "other",
  requiresIntegration: true,
  fields: [
    {
      name: "mode",
      label: "Mode",
      type: "select",
      required: true,
      options: [
        { value: "simple", label: "Simple" },
        { value: "custom", label: "Custom" },
      ],
    },
    {
      name: "customPayload",
      label: "Custom payload",
      type: "textarea",
      required: true,
      visibleWhen: { field: "mode", valueIn: ["custom"] },
    },
    { name: "recipient", label: "Recipient", type: "text", required: true },
  ] as FieldMeta[],
  outputs: [],
  producesFileRef: false,
  consumesFileRef: false,
  displayOrder: null,
  isDestructive: false,
  requiresConfirmation: false,
  riskLevel: "low",
} as ActionMeta;

const node = (config: Record<string, unknown>): WorkflowNode =>
  ({
    id: "n1",
    kind: "action",
    provider: "acme",
    type: "send",
    config,
  }) as unknown as WorkflowNode;

describe("buildRequiredFieldsByType — visibleWhen carried through", () => {
  it("includes the condition on the requirement entry", () => {
    const map = buildRequiredFieldsByType([meta], []);
    const reqs = map["acme:send"]!.requiredFields;
    const custom = reqs.find((r) => r.name === "customPayload");
    expect(custom?.visibleWhen).toEqual({ field: "mode", valueIn: ["custom"] });
    // Unconditional requirements carry no condition key at all.
    const recipient = reqs.find((r) => r.name === "recipient");
    expect(recipient?.visibleWhen).toBeUndefined();
  });
});

describe("missingRequiredFields — visibility-aware", () => {
  const map = buildRequiredFieldsByType([meta], []);

  it("hidden required field is NOT a gap while its mode is off", () => {
    const missing = missingRequiredFields(node({ mode: "simple", recipient: "x" }), map);
    expect(missing.map((m) => m.name)).toEqual([]);
  });

  it("the same field IS a gap once the revealing mode is chosen", () => {
    const missing = missingRequiredFields(node({ mode: "custom", recipient: "x" }), map);
    expect(missing.map((m) => m.name)).toEqual(["customPayload"]);
  });

  it("a filled revealed field satisfies the requirement", () => {
    const missing = missingRequiredFields(
      node({ mode: "custom", recipient: "x", customPayload: "{{step1.body}}" }),
      map,
    );
    expect(missing).toEqual([]);
  });

  it("unconditional requirements are unaffected", () => {
    const missing = missingRequiredFields(node({ mode: "simple" }), map);
    expect(missing.map((m) => m.name)).toEqual(["recipient"]);
  });

  it("no mode chosen yet → the conditional field is not counted (its controller is)", () => {
    const missing = missingRequiredFields(node({}), map);
    expect(missing.map((m) => m.name)).toEqual(["mode", "recipient"]);
  });
});
