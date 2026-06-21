import type { WorkflowNode } from "@/contracts/workflow";
import type { RequiredFieldsByType } from "@/features/workflow-builder/validation/collectBuilderValidationIssues";
import {
  appliedConfigHintNeedsAttention,
  buildAppliedConfigHints,
} from "@/features/workflow-builder/utils/appliedConfigHints";

/**
 * HERMES-AGENT-APPLY-CONFIG-HINTS — the pure helper that turns just-applied node
 * ids into safe required-field hints. Field NAMES only, metadata-sourced, with a
 * conservative fallback when metadata is unavailable. No values / secrets.
 */

function node(over: Partial<WorkflowNode> & Pick<WorkflowNode, "id">): WorkflowNode {
  return {
    kind: "action",
    provider: "slack",
    type: "send_message",
    config: {},
    position: { x: 0, y: 0 },
    ...over,
  };
}

const requiredFieldsByType: RequiredFieldsByType = {
  "slack:send_message": {
    displayName: "Send Message",
    requiredFields: [
      { name: "channel", label: "Channel" },
      { name: "message", label: "Message" },
    ],
  },
  "gmail:new_email": {
    displayName: "New Email",
    requiredFields: [],
  },
};

describe("buildAppliedConfigHints", () => {
  it("sources missing required field LABELS from metadata (names only)", () => {
    const nodes = [node({ id: "n1" })];
    const hints = buildAppliedConfigHints(["n1"], nodes, requiredFieldsByType);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      nodeId: "n1",
      hasMetadata: true,
      missingFieldLabels: ["Channel", "Message"],
    });
  });

  it("never leaks config values — only field names appear", () => {
    // Even if a node somehow carried config, hints derive from metadata labels,
    // never from the stored values.
    const nodes = [node({ id: "n1", config: { channel: "C-SECRET-123" } })];
    const hints = buildAppliedConfigHints(["n1"], nodes, requiredFieldsByType);
    const serialized = JSON.stringify(hints);
    expect(serialized).not.toContain("C-SECRET-123");
    // channel is now filled → only message remains missing (label, not value).
    expect(hints[0]!.missingFieldLabels).toEqual(["Message"]);
  });

  it("flags hasMetadata=false (generic fallback) when the type is unknown", () => {
    const nodes = [node({ id: "n1", provider: "acme", type: "do_thing" })];
    const hints = buildAppliedConfigHints(["n1"], nodes, requiredFieldsByType);
    expect(hints[0]).toMatchObject({ hasMetadata: false, missingFieldLabels: [] });
    expect(appliedConfigHintNeedsAttention(hints[0]!)).toBe(true);
  });

  it("flags hasMetadata=false when no metadata map is provided at all", () => {
    const nodes = [node({ id: "n1" })];
    const hints = buildAppliedConfigHints(["n1"], nodes, undefined);
    expect(hints[0]).toMatchObject({ hasMetadata: false, missingFieldLabels: [] });
  });

  it("drops ids that no longer exist (node removed since apply)", () => {
    const hints = buildAppliedConfigHints(["gone"], [node({ id: "n1" })], requiredFieldsByType);
    expect(hints).toEqual([]);
  });

  it("treats a fully-satisfied, known node as NOT needing attention", () => {
    const nodes = [node({ id: "n1", provider: "gmail", type: "new_email" })];
    const hints = buildAppliedConfigHints(["n1"], nodes, requiredFieldsByType);
    expect(hints[0]).toMatchObject({ hasMetadata: true, missingFieldLabels: [] });
    expect(appliedConfigHintNeedsAttention(hints[0]!)).toBe(false);
  });

  it("preserves the order of appliedNodeIds", () => {
    const nodes = [
      node({ id: "a", provider: "gmail", type: "new_email" }),
      node({ id: "b" }),
    ];
    const hints = buildAppliedConfigHints(["b", "a"], nodes, requiredFieldsByType);
    expect(hints.map((h) => h.nodeId)).toEqual(["b", "a"]);
  });
});
