/** @jest-environment node */
/**
 * Tests for the deterministic broken-variable-reference detector
 * (`core/workflows/invalidVariableReferences.ts`, Slice 4.AI-REPAIR-3G).
 *
 * Also pins the "validators agree" contract: the production deleted-node token
 * (`{{<uuid>.to}}`) the design-time field validator flags as `missing_node` is the
 * SAME reference this detector returns — both delegate tokenization to
 * `parseReferences`, so they can't diverge on what a reference IS.
 */
import { findInvalidVariableReferences } from "@/core/workflows/invalidVariableReferences";
import { validateReferences } from "@/features/workflow-builder/config-modal/fields/_variableValidator";

const DELETED = "e25b1c45-af99-4913-9947-f726012329a5";

describe("findInvalidVariableReferences (AI-REPAIR-3G)", () => {
  it("flags a reference to a deleted/unknown node (the production Slack-message bug)", () => {
    const refs = findInvalidVariableReferences([
      { id: "trigger-1", config: {} },
      { id: "slack-1", config: { message: `Hello {{${DELETED}.to}}` } },
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      nodeId: "slack-1",
      fieldKey: "message",
      token: `{{${DELETED}.to}}`,
      sourceId: DELETED,
      refPath: "to",
    });
  });

  it("does NOT flag the trigger alias or an existing node", () => {
    const refs = findInvalidVariableReferences([
      { id: "n1", config: {} },
      { id: "n2", config: { a: "{{trigger.email}}", b: "{{n1.output}}" } },
    ]);
    expect(refs).toEqual([]);
  });

  it("scans string elements inside an array-valued field", () => {
    const refs = findInvalidVariableReferences([
      { id: "n2", config: { to: ["{{ghost.email}}", "static@example.com"] } },
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ nodeId: "n2", fieldKey: "to", sourceId: "ghost" });
  });

  it("skips AI_FIELD tokens (agent construct, not a variable)", () => {
    const refs = findInvalidVariableReferences([
      { id: "n2", config: { message: "{{AI_FIELD:message}}" } },
    ]);
    expect(refs).toEqual([]);
  });

  it("flags a whole-node reference to a missing node", () => {
    const refs = findInvalidVariableReferences([
      { id: "n2", config: { body: "{{ghost}}" } },
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ sourceId: "ghost", refPath: "" });
  });

  it("agrees with the design-time field validator on the deleted-node reference", () => {
    const value = `Hi {{${DELETED}.to}}`;
    // The Check-side detector flags it...
    const det = findInvalidVariableReferences([{ id: "slack-1", config: { message: value } }]);
    // ...and the design-time field validator (no upstream source by that id) flags
    // the SAME token as a missing-node warning.
    const warnings = validateReferences({ value, sources: [] });
    expect(det).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("missing_node");
    expect(warnings[0]!.token).toBe(det[0]!.token);
    expect(warnings[0]!.sourceId).toBe(det[0]!.sourceId);
  });
});
