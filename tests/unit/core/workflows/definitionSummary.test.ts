/** @jest-environment node */
/**
 * Tests for core/workflows/definitionSummary.
 *
 * Pure helper consumed server-side by the workflows list route
 * (Slice 4.WORKFLOWS-PAGE-1). Asserts the SAFETY contract: it reads only
 * `node.provider` and `node.kind` — never `node.config` — so derived chip
 * data can never leak secrets/config values to the client.
 */
import { summarizeDefinition } from "@/core/workflows/definitionSummary";
import type { WorkflowDefinition } from "@/contracts/workflow";

function node(
  id: string,
  kind: "trigger" | "action",
  provider: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  return { id, kind, provider, type, config, position: { x: 0, y: 0 } } as const;
}

describe("summarizeDefinition", () => {
  it("returns zeros for null / undefined / empty definitions", () => {
    expect(summarizeDefinition(undefined)).toEqual({
      providerIds: [],
      triggerCount: 0,
      actionCount: 0,
    });
    expect(summarizeDefinition(null)).toEqual({
      providerIds: [],
      triggerCount: 0,
      actionCount: 0,
    });
    expect(
      summarizeDefinition({ nodes: [], edges: [] } as WorkflowDefinition),
    ).toEqual({ providerIds: [], triggerCount: 0, actionCount: 0 });
  });

  it("counts triggers + actions independently", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("t1", "trigger", "gmail", "new_email"),
        node("a1", "action", "slack", "send_channel_message"),
        node("a2", "action", "notion", "create_page"),
      ],
      edges: [],
    };
    const out = summarizeDefinition(def);
    expect(out.triggerCount).toBe(1);
    expect(out.actionCount).toBe(2);
  });

  it("returns distinct provider ids with TRIGGER providers first", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("a1", "action", "slack", "send_channel_message"),
        node("a2", "action", "slack", "send_dm"), // duplicate slack → skipped
        node("t1", "trigger", "gmail", "new_email"),
        node("a3", "action", "notion", "create_page"),
      ],
      edges: [],
    };
    expect(summarizeDefinition(def).providerIds).toEqual([
      "gmail", // trigger first
      "slack", // first action provider
      "notion", // second action provider
    ]);
  });

  it("NEVER reads node.config — config values are excluded from the summary", () => {
    const def: WorkflowDefinition = {
      nodes: [
        node("t1", "trigger", "gmail", "new_email", {
          access_token: "SECRET",
          channel: "#secret",
        }),
        node("a1", "action", "slack", "send_channel_message", {
          api_key: "ANOTHER_SECRET",
        }),
      ],
      edges: [],
    };
    const summary = summarizeDefinition(def);
    // The summary carries only provider ids + counts. No way for config
    // strings to ride along.
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/SECRET/);
    expect(serialized).not.toMatch(/api_key/);
    expect(serialized).not.toMatch(/access_token/);
    expect(serialized).not.toMatch(/#secret/);
  });

  it("skips nodes with no provider id (defensive)", () => {
    const def = {
      nodes: [
        { id: "x", kind: "action", provider: "", type: "", config: {}, position: { x: 0, y: 0 } },
        node("a1", "action", "slack", "send_dm"),
      ],
      edges: [],
    } as unknown as WorkflowDefinition;
    expect(summarizeDefinition(def).providerIds).toEqual(["slack"]);
  });
});
