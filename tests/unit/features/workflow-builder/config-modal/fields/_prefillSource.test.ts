/**
 * @jest-environment node
 */
import { describePrefillSource } from "@/features/workflow-builder/config-modal/fields/_prefillSource";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const triggerSource: VariableSource = {
  sourceId: "trigger",
  displayName: "New labeled email",
  kind: "trigger",
  provider: "gmail",
  outputs: [
    { name: "subject", type: "string" },
    { name: "from", type: "string" },
    { name: "shopDomain", type: "string" },
  ],
};

const actionSource: VariableSource = {
  sourceId: "a1",
  displayName: "Create Contact",
  kind: "action",
  provider: "hubspot",
  outputs: [{ name: "email", type: "string" }],
};

const SOURCES = [triggerSource, actionSource];

describe("describePrefillSource", () => {
  it("labels a single trigger reference with the humanized output name", () => {
    expect(describePrefillSource({ value: "{{trigger.subject}}", sources: SOURCES })).toBe(
      "Subject from the trigger",
    );
  });

  it("labels a single action reference with the source display name", () => {
    expect(describePrefillSource({ value: "{{a1.email}}", sources: SOURCES })).toBe(
      "Email from the Create Contact step",
    );
  });

  it("humanizes camelCase output names", () => {
    expect(describePrefillSource({ value: "{{trigger.shopDomain}}", sources: SOURCES })).toBe(
      "Shop domain from the trigger",
    );
  });

  it("returns a source-level phrase when the path is not a declared output (never fabricates a field)", () => {
    expect(describePrefillSource({ value: "{{trigger.unknownThing}}", sources: SOURCES })).toBe(
      "Data from the trigger",
    );
  });

  it("returns a source-level phrase for a whole-node reference", () => {
    expect(describePrefillSource({ value: "{{trigger}}", sources: SOURCES })).toBe(
      "Data from the trigger",
    );
  });

  it("returns null for a mixed string (no single precise label)", () => {
    expect(
      describePrefillSource({ value: "Subject: {{trigger.subject}}", sources: SOURCES }),
    ).toBeNull();
  });

  it("returns null for multiple references", () => {
    expect(
      describePrefillSource({ value: "{{trigger.subject}} {{trigger.from}}", sources: SOURCES }),
    ).toBeNull();
  });

  it("returns null when the referenced source is unknown", () => {
    expect(describePrefillSource({ value: "{{ghost.x}}", sources: SOURCES })).toBeNull();
  });

  it("returns null for a literal value", () => {
    expect(describePrefillSource({ value: "Weekly report", sources: SOURCES })).toBeNull();
  });

  it("never emits the raw token, node id, or braces", () => {
    const label = describePrefillSource({ value: "{{a1.email}}", sources: SOURCES });
    expect(label).not.toContain("{{");
    expect(label).not.toContain("a1");
  });
});
