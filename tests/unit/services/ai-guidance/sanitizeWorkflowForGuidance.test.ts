/**
 * @jest-environment node
 *
 * Privacy-boundary tests for sanitizeWorkflowForGuidance (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 * Proves the de-identified request carries ONLY capability shape + topology — never config
 * values/keys, secrets, PII, labels, or real node/workflow ids — and never mutates the input.
 */

import { sanitizeWorkflowForGuidance } from "@/services/ai-guidance/sanitizeWorkflowForGuidance";
import type { WorkflowDefinition } from "@/contracts/workflow";

// A realistic workflow whose config is FULL of things that must never leave ChainReact.
const SECRET_TOKEN = ["xoxb", "SUPER", "SECRET", "TOKEN", "9f3a"].join("-");
const PII_EMAIL = "ceo.private@example.com";
const dirtyDef = {
  nodes: [
    {
      id: "real-node-trigger-abc123", kind: "trigger", provider: "slack", type: "message_posted",
      config: { channel: "#exec-private", botToken: SECRET_TOKEN, webhookUrl: "https://hooks.example/x" },
      label: "When the CEO posts in #exec-private",
      position: { x: 0, y: 0 },
    },
    {
      id: "real-node-action-def456", kind: "action", provider: "gmail", type: "send_email",
      config: { to: PII_EMAIL, subject: "Q4 numbers", body: "Revenue was $4.2M — confidential" },
      label: "Email the CEO",
      position: { x: 0, y: 200 },
    },
  ],
  edges: [{ id: "real-edge-1", from: "real-node-trigger-abc123", to: "real-node-action-def456", label: "then" }],
} as unknown as WorkflowDefinition;

describe("sanitizeWorkflowForGuidance — privacy boundary", () => {
  it("keeps capability shape + topology, by opaque refs (no real ids)", () => {
    const { request, refMap } = sanitizeWorkflowForGuidance({ definition: dirtyDef, guidanceKind: "repair_suggestion" });
    expect(request.workflow.nodeCount).toBe(2);
    expect(request.workflow.edgeCount).toBe(1);
    expect(request.workflow.nodes).toEqual([
      { ref: "n0", kind: "trigger", provider: "slack", type: "message_posted" },
      { ref: "n1", kind: "action", provider: "gmail", type: "send_email" },
    ]);
    expect(request.workflow.edges).toEqual([{ fromRef: "n0", toRef: "n1" }]);
    // The real-id map exists ONLY for ChainReact-side use.
    expect(refMap.get("n0")).toBe("real-node-trigger-abc123");
    expect(refMap.get("n1")).toBe("real-node-action-def456");
  });

  it("serialized request leaks NO config value, secret, PII, label, or real id", () => {
    const { request } = sanitizeWorkflowForGuidance({ definition: dirtyDef, guidanceKind: "workflow_design" });
    const s = JSON.stringify(request);
    for (const needle of [
      SECRET_TOKEN, PII_EMAIL, "botToken", "webhookUrl", "#exec-private", "Q4 numbers",
      "Revenue was", "confidential", "send the CEO", "Email the CEO", "When the CEO",
      "real-node-trigger-abc123", "real-node-action-def456", "real-edge-1",
      "config", "label", "position", "body", "subject",
    ]) {
      expect(s).not.toContain(needle);
    }
  });

  it("the request shape has NO scope / config / label / id keys at any depth", () => {
    const { request } = sanitizeWorkflowForGuidance({ definition: dirtyDef, guidanceKind: "explain_structure" });
    const keys = new Set<string>();
    (function walk(v: unknown) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
    })(request);
    for (const forbidden of ["config", "label", "id", "accountId", "userId", "workflowId", "secret", "token", "position"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    // Only the allow-listed generalized keys appear.
    expect([...keys].sort()).toEqual(
      ["edgeCount", "edges", "fromRef", "guidanceKind", "kind", "nodeCount", "nodes", "provider", "ref", "schemaVersion", "toRef", "type", "workflow"],
    );
  });

  it("drops unsafe finding codes (free text) and keeps only code-shaped values", () => {
    const { request } = sanitizeWorkflowForGuidance({
      definition: dirtyDef, guidanceKind: "repair_suggestion",
      findingCodes: ["MISSING_REQUIRED_FIELD", "DISCONNECTED", "the user's secret message body", "a@b.com", "OK.code-1"],
    });
    expect(request.findingCodes).toEqual(["MISSING_REQUIRED_FIELD", "DISCONNECTED", "OK.code-1"]);
  });

  it("does NOT mutate the input definition", () => {
    const snapshot = JSON.parse(JSON.stringify(dirtyDef));
    sanitizeWorkflowForGuidance({ definition: dirtyDef, guidanceKind: "workflow_design", findingCodes: ["X"] });
    expect(dirtyDef).toEqual(snapshot);
  });

  it("drops edges referencing unknown nodes (defensive topology)", () => {
    const def = {
      nodes: [{ id: "a", kind: "action", provider: "core", type: "noop", config: {}, position: { x: 0, y: 0 } }],
      edges: [{ id: "e", from: "a", to: "ghost", label: "x" }],
    } as unknown as WorkflowDefinition;
    const { request } = sanitizeWorkflowForGuidance({ definition: def, guidanceKind: "workflow_design" });
    expect(request.workflow.edges).toEqual([]);
  });
});
