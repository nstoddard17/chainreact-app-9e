/**
 * @jest-environment node
 *
 * AGENT-CHANGE-HISTORY-1 — value-free change summarizer.
 *
 * Business rules under test:
 *   - summarizeConfigDiff counts added / removed / changed nodes, config fields
 *     touched, and still-missing required fields — reading ONLY structural shape.
 *   - It is VALUE-FREE: even when the diff carries secret field VALUES, the result
 *     is pure numbers — no config value can leak into the persisted summary.
 *   - A null diff (the additive new-workflow path) yields all-zero counts.
 *   - buildAgentChangeTitle produces a concise structural label, or null when
 *     nothing notable changed.
 */

import type { ConfigDiff, NodeConfigDiff } from "@/core/workflows/buildConfigDiff";
import {
  buildAgentChangeTitle,
  summarizeConfigDiff,
} from "@/features/workflow-builder/hooks/agentChangeSummary";

function node(overrides: Partial<NodeConfigDiff>): NodeConfigDiff {
  return {
    nodeId: "n1",
    provider: "slack",
    type: "send_channel_message",
    label: "Slack",
    status: "changed",
    addedFields: [],
    changedFields: [],
    removedFields: [],
    missingRequiredFields: [],
    variablesUsed: [],
    ...overrides,
  };
}

describe("summarizeConfigDiff", () => {
  it("counts added / removed / changed nodes, fields touched, and setup issues", () => {
    const diff: ConfigDiff = {
      nodes: [
        node({ nodeId: "a", status: "added", addedFields: [
          { name: "to", label: "To", secret: false, after: { kind: "empty" } },
        ], missingRequiredFields: [{ name: "to", label: "To" }] }),
        node({ nodeId: "r", status: "removed", removedFields: [
          { name: "channel", label: "Channel", secret: false, before: { kind: "empty" } },
        ] }),
        node({ nodeId: "c", status: "changed", changedFields: [
          { name: "text", label: "Text", secret: false, before: { kind: "empty" }, after: { kind: "empty" } },
        ] }),
      ],
    };
    expect(summarizeConfigDiff(diff)).toEqual({
      addedNodeCount: 1,
      removedNodeCount: 1,
      changedNodeCount: 1,
      changedConfigCount: 3, // 1 added + 1 removed + 1 changed field
      setupIssueCount: 1,
    });
  });

  it("never leaks a config VALUE — the result is pure numbers even with a secret field present", () => {
    const SECRET = "xoxb-super-secret-token";
    const diff: ConfigDiff = {
      nodes: [
        node({
          nodeId: "c",
          status: "changed",
          changedFields: [
            // A secret-shaped field carrying a (hypothetical) raw value. The summarizer
            // must read only that ONE field exists, never the value.
            { name: "token", label: "Token", secret: true, after: { kind: "summary", summary: SECRET } },
          ],
        }),
      ],
    };
    const counts = summarizeConfigDiff(diff);
    expect(Object.values(counts).every((v) => typeof v === "number")).toBe(true);
    expect(JSON.stringify(counts)).not.toContain(SECRET);
  });

  it("yields all-zero counts for a null diff (additive new-workflow path)", () => {
    expect(summarizeConfigDiff(null)).toEqual({
      addedNodeCount: 0,
      removedNodeCount: 0,
      changedNodeCount: 0,
      changedConfigCount: 0,
      setupIssueCount: 0,
    });
  });
});

describe("buildAgentChangeTitle", () => {
  it("builds a concise structural label from node counts", () => {
    expect(
      buildAgentChangeTitle({
        addedNodeCount: 1,
        removedNodeCount: 1,
        changedNodeCount: 0,
        changedConfigCount: 2,
        setupIssueCount: 1,
      }),
    ).toBe("1 node added, 1 node removed");
  });

  it("falls back to 'Configuration updated' when only config (no node) changed", () => {
    expect(
      buildAgentChangeTitle({
        addedNodeCount: 0,
        removedNodeCount: 0,
        changedNodeCount: 0,
        changedConfigCount: 3,
        setupIssueCount: 0,
      }),
    ).toBe("Configuration updated");
  });

  it("returns null when nothing notable changed", () => {
    expect(
      buildAgentChangeTitle({
        addedNodeCount: 0,
        removedNodeCount: 0,
        changedNodeCount: 0,
        changedConfigCount: 0,
        setupIssueCount: 0,
      }),
    ).toBeNull();
  });
});
